// 管理者コンソール（admin.html）の画面テスト。GASは模擬し、実際にクリックして確かめる。
//   実行: node admin_ui_test.js
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8147, STOR = 'hub-v8-dev-';
const ok = [], ng = [];
const t = (n, c, e) => { (c ? ok : ng).push(n + (c ? '' : '  ← ' + JSON.stringify(e))); };
const CODE = '515151';

let staffH, staffS, devices, adminProp, sentInvites, sentCodes, devnames;
function reset() {
  staffH = [
    { uid:'h1', name:'見取大介', myNumber:1, badge:'manager',  store:'honten', loginEmail:'daisuke@midori-m.com' },
    { uid:'h2', name:'岡上秀一', myNumber:2, badge:'mechanic', store:'honten' },
    { uid:'h7', name:'江川京志', myNumber:7, badge:'mechanic', store:'honten' },   // メール未設定（種火の管理者）
    { uid:'h8', name:'ダク', myNumber:8, badge:'mechanic', store:'honten' },       // 助っ人。PCを持たず触らない
  ];
  staffS = [ { uid:'s10', name:'藤原昭人', myNumber:10, badge:'manager', store:'sanda' } ];
  devices = {
    dA: { n:'見取大介', m:1, s:'honten', e:'daisuke@midori-m.com', k:'shared', l:'共有PC1',
          at:Date.now()-40*86400000, last:Date.now()-86400000, exp:Date.now()+89*86400000, ua:'Windows Chrome' },
  };
  adminProp = 'egawa@midori-m.com=h7';
  devnames = [];
  sentInvites = []; sentCodes = [];
}

const admins = () => adminProp.split(',').filter(Boolean).map(p => {
  const i = p.indexOf('='); return { mail:(i<0?p:p.slice(0,i)).trim().toLowerCase(), uid:(i<0?'':p.slice(i+1)).trim() };
});
const allStaff = () => [...staffH, ...staffS];
const byEmail  = m => allStaff().find(s => (s.loginEmail||'').toLowerCase() === m);
const byUid    = u => allStaff().find(s => s.uid === u);
const isAdmin  = m => admins().find(a => a.mail === m);
const resolve  = m => {
  const s = byEmail(m); const a = isAdmin(m);
  if (s) return { ...s, admin: !!a };
  if (!a) return null;
  const u = a.uid ? byUid(a.uid) : null;
  return u ? { ...u, admin:true } : { name:'管理者', myNumber:'', store:'honten', uid:a.uid||'', admin:true };
};
// 利用証は「メール|管理者フラグ」を素朴に入れただけの模擬。
// 区切りは '~'。'.' にするとメールアドレスのドットで分解されてしまう。
const tokenOf = (s, mail) => 'TK~' + mail + '~' + (s.admin ? '1' : '0');
const readTok = raw => {
  const i = String(raw||'').indexOf('|'); if (i < 0) return null;
  const p = String(raw).slice(i+1).split('~');
  if (p[0] !== 'TK') return null;
  return { mail: p[1], admin: p[2] === '1' };
};

const serve = () => http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'admin.html';
  fs.readFile(path.join(DIR, p), (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(data);
  });
});

const gasRoute = async (route) => {
  const u = new URL(route.request().url()), q = u.searchParams;
  const body = o => route.fulfill({ status:200, contentType:'text/plain',
    headers:{'Access-Control-Allow-Origin':'*'}, body: JSON.stringify(o) });
  const text = s => route.fulfill({ status:200, contentType:'text/plain',
    headers:{'Access-Control-Allow-Origin':'*'}, body: s });

  if (route.request().method() === 'POST') {
    let d = {}; try { d = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    let v = null; try { v = JSON.parse(d.value); } catch (e) {}
    if (d.key === STOR + 'auth-devices' && v && typeof v === 'object') devices = v;
    if (d.key === STOR + 'auth-devnames' && Array.isArray(v)) devnames = v;
    if (d.key === STOR + 'honten-staff-v2' && Array.isArray(v)) staffH = v;
    if (d.key === STOR + 'sanda-staff-v2'  && Array.isArray(v)) staffS = v;
    return text('ok');
  }

  const me = readTok(q.get('apiKey'));
  switch (q.get('action')) {
    case 'authRequest': {
      const m = String(q.get('email')||'').trim().toLowerCase();
      if (!resolve(m)) return body({ ok:false, err:'not_registered' });
      sentCodes.push(m); return body({ ok:true });
    }
    case 'authVerify': {
      const m = String(q.get('email')||'').trim().toLowerCase();
      const s = resolve(m);
      if (!s) return body({ ok:false, err:'not_registered' });
      if (q.get('code') !== CODE) return body({ ok:false, err:'bad_code' });
      const jti = 'd' + Object.keys(devices).length;
      devices[jti] = { n:s.name, m:s.myNumber, s:s.store, e:m, at:Date.now(),
                       exp:Date.now()+90*86400000, ua:'Test Browser' };
      return body({ ok:true, token:tokenOf(s, m), exp:Date.now()+90*86400000,
                    name:s.name, myNumber:s.myNumber, store:s.store, uid:s.uid||'', admin:!!s.admin });
    }
    case 'authInvite': {
      const m = String(q.get('email')||'').trim().toLowerCase();
      if (!byEmail(m)) return body({ ok:false, err:'not_registered' });
      sentInvites.push(m); return body({ ok:true, name:byEmail(m).name });
    }
    case 'authAdminList': {
      if (!me || !me.admin) return body({ ok:false, err:'not_admin' });
      return body({ ok:true, admins: admins().map(a => ({ mail:a.mail, uid:a.uid,
        name:(byUid(a.uid)||{}).name || '' })) });
    }
    case 'authAdminSet': {
      if (!me || !me.admin) return body({ ok:false, err:'not_admin' });
      const mail = String(q.get('email')||'').trim().toLowerCase();
      let list = admins();
      if (q.get('op') === 'add') {
        if (!list.some(a => a.mail === mail)) list.push({ mail, uid:String(q.get('uid')||'') });
      } else if (q.get('op') === 'remove') {
        if (list.length <= 1) return body({ ok:false, err:'last_admin' });
        list = list.filter(a => a.mail !== mail);
      } else return body({ ok:false, err:'bad_op' });
      adminProp = list.map(a => a.mail + (a.uid ? '=' + a.uid : '')).join(',');
      return body({ ok:true, count:list.length });
    }
  }
  const key = q.get('key') || '';
  if (key === STOR + 'honten-staff-v2') return text(JSON.stringify(staffH));
  if (key === STOR + 'sanda-staff-v2')  return text(JSON.stringify(staffS));
  if (key === STOR + 'auth-devices')    return text(JSON.stringify(devices));
  if (key === STOR + 'auth-devnames')   return text(JSON.stringify(devnames));
  return text('null');
};

const see = async (page, s, ms = 6000) => {
  try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; }
  catch (e) { return false; }
};
const click = (page, s, root) => page.evaluate(([x, r]) => {
  const sc = r ? document.querySelector(r) : document;
  if (!sc) return false;
  const b = [...sc.querySelectorAll('button,a')].find(e => e.innerText.includes(x));
  if (b) { b.click(); return true; } return false;
}, [s, root || null]);
const dump = page => page.evaluate(() => document.body.innerText.replace(/\s+/g,' ').slice(0, 400));

(async () => {
  reset();
  const server = serve();
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  await ctx.route('https://script.google.com/**', gasRoute);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  try {
    await page.goto(`http://localhost:${PORT}/admin.html`, { waitUntil: 'domcontentloaded' });

    // ① 入口 —— 管理者でなければ入れない
    t('ログイン画面が出る', await see(page, 'Hub 管理者コンソール'));
    await page.fill('#m', 'daisuke@midori-m.com');       // スタッフだが管理者ではない
    await click(page, '確認コードを送る');
    await see(page, '6桁');
    await page.fill('#c', CODE);
    await click(page, '確認する');
    t('管理者でない人は断られる', await see(page, '管理者ではありません'), await dump(page));

    // ② 種火の管理者 —— スタッフ表にメールが無くても入れる
    await click(page, 'アドレスを入れ直す');
    await page.fill('#m', 'egawa@midori-m.com');
    await click(page, '確認コードを送る');
    await see(page, '6桁');
    t('管理者にはコードを送る', sentCodes.includes('egawa@midori-m.com'), sentCodes);
    await page.fill('#c', '999999');
    await click(page, '確認する');
    t('違うコードは弾く', await see(page, 'コードが違います'));
    await page.fill('#c', CODE);
    await click(page, '確認する');
    t('管理者はコンソールに入れる', await see(page, '本人認証の進み具合'), await dump(page));
    t('スタッフ表にメールが無くても名前が出る', await see(page, '江川京志'));

    // ③ 進み具合と一覧
    t('役割を決めた人だけが並ぶ', await page.evaluate(() => {
      const b = document.querySelector('.panelbox tbody').innerText;
      return b.includes('見取大介') && !b.includes('藤原昭人');
    }), await dump(page));
    t('登録済みが1人と出る', await page.evaluate(() =>
      document.querySelectorAll('.state.ok').length >= 1));

    // ④ ＋ で役割を決めて追加し、招待を送る
    t('まだ決めていない人数が出る', await see(page, 'まだ決めていないスタッフ'));
    await click(page, '＋ 追加');
    t('追加の画面が出る', await see(page, 'この方はシステムを操作しますか'));
    t('操作する／しないを選べる', await page.evaluate(() =>
      document.querySelectorAll('input[name="newrole"]').length === 2));
    await page.selectOption('#newuid', 'h2');
    await page.fill('#newmail', 'okaue@midori-m.com');
    await click(page, '追加する', '.dialog');
    await page.waitForTimeout(1200);
    t('ログイン用メールが保存される',
      (staffH.find(s => s.uid === 'h2') || {}).loginEmail === 'okaue@midori-m.com',
      staffH.find(s => s.uid === 'h2'));
    t('保存を知らせる', await see(page, 'さんを保存しました'));

    // メールを空のまま追加できる（あとから入れて招待する運用）
    await click(page, '＋ 追加');
    await see(page, 'この方はシステムを操作しますか');
    await page.selectOption('#newuid', 's10');
    await click(page, '追加する', '.dialog');
    await page.waitForTimeout(1200);
    t('メール未入力でも追加できる', await page.evaluate(() =>
      document.querySelector('.panelbox tbody').innerText.includes('メール未入力')));
    t('あとからメールを入れられる', await page.evaluate(() => !!document.querySelector('[data-mail="s10"]')));


    await page.evaluate(() => {
      const b = [...document.querySelectorAll('[data-invite="h2"]')][0]; if (b) b.click();
    });
    t('送る前にアドレスを確認させる', await see(page, '宛先に間違いはありませんか'));
    t('確認画面にアドレスが出る', await see(page, 'okaue@midori-m.com'));
    await click(page, '送る', '.dialog');
    await page.waitForTimeout(700);
    t('招待が送られる', sentInvites.includes('okaue@midori-m.com'), sentInvites);
    t('送信を知らせる', await see(page, '招待メールを送りました'));

    // ⑤ 端末タブ
    await click(page, '登録端末');
    t('端末一覧が出る', await see(page, '最後に使った日'));
    t('端末の持ち主が出る', await see(page, '見取大介'));
    t('端末の名前が出る', await see(page, '共有PC1'));
    t('種類が出る', await page.evaluate(() =>
      document.querySelector('.panelbox tbody').innerText.includes('共有')));
    t('店のPCが自分専用のときの直し方を書いてある',
      await see(page, '店のPCが「自分専用」になっていたら'));
    t('失効までの日数が出る', await see(page, 'あと'));
    // ★画面が小さくても「追加する」に手が届くこと。
    //   使う端末を選ぶとダイアログが伸びる。中央寄せのままだと上下が切れ、
    //   背景もスクロールしないのでボタンに触れなくなる（実際にそうなっていた）。
    for (const h of [900, 700, 600, 500]) {
      await page.setViewportSize({ width: 1360, height: h });
      await click(page, 'スタッフと招待'); await page.waitForTimeout(400);
      await click(page, '＋ 追加'); await page.waitForTimeout(400);
      await page.check('#planshared').catch(()=>{});
      await page.waitForTimeout(300);
      const okBtn = await page.evaluate(() => {
        const d = document.querySelector('.dialog'); if (!d) return null;
        const b = [...d.querySelectorAll('button')].find(x => x.innerText.includes('追加する'));
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { 見えている: r.bottom <= window.innerHeight + 1 && r.top >= 0,
                 上が切れていない: d.getBoundingClientRect().top >= 0 };
      });
      t('画面高' + h + 'でも「追加する」が押せる', !!okBtn && okBtn.見えている, okBtn);
      await page.evaluate(()=>{const e=document.querySelector('.scrim'); if(e) e.click();});
      await page.waitForTimeout(300);
    }
    await page.setViewportSize({ width: 1360, height: 1000 });

    // 共有端末は「＋ 追加 → 共有端末」で足す。人は選ばない。
    await click(page, 'スタッフと招待');
    await page.waitForTimeout(600);
    await click(page, '＋ 追加');
    t('何を追加するか選べる', await see(page, '何を追加しますか'));
    t('最初はスタッフ側が出ている', await page.evaluate(() =>
      !!document.getElementById('staffwrap') && !document.getElementById('staffwrap').hidden));
    await page.check('input[name="addwhat"][value="dev"]');
    t('共有端末を選ぶとスタッフ一覧が消える', await page.evaluate(() =>
      document.getElementById('staffwrap').hidden && !document.getElementById('devwrap').hidden));
    await page.fill('#devname', '共有PC1');
    await click(page, '追加する', '.dialog');
    await page.waitForTimeout(1500);
    t('端末名が一覧に加わる', devnames.some(function(d){ return d.name === '共有PC1'; }), devnames);

    // 一覧にない人を、ここで新しく登録できる
    await click(page, '＋ 追加');
    await see(page, '何を追加しますか');
    await page.selectOption('#newuid', '__new__');
    t('氏名を入力する欄が出る', await page.evaluate(() =>
      !!document.getElementById('newstaffwrap') && !document.getElementById('newstaffwrap').hidden));
    await page.fill('#nsname', '新人テスト');
    await page.fill('#nsno', '21');
    await page.fill('#newmail', 'shinjin@midori-m.com');
    await click(page, '追加する', '.dialog');
    await page.waitForTimeout(1600);
    t('新しいスタッフがスタッフ表に入る',
      staffH.some(function(x){ return x.name === '新人テスト' && Number(x.myNumber) === 21; }),
      staffH.map(function(x){ return x.name; }));
    t('ログイン用メールも一緒に入る', (function(){
      var x = staffH.find(function(y){ return y.name === '新人テスト'; }) || {};
      return x.loginEmail === 'shinjin@midori-m.com'; })(),
      staffH.find(function(y){ return y.name === '新人テスト'; }));
    t('使う端末も記録される', (function(){
      var x = staffH.find(function(y){ return y.name === '新人テスト'; }) || {};
      return (x.devPlan||[]).indexOf('own') >= 0; })());
    t('番号が重なると断る', await (async function(){
      await click(page, '＋ 追加');
      await see(page, '何を追加しますか');
      await page.selectOption('#newuid', '__new__');
      await page.fill('#nsname', 'もう一人');
      await page.fill('#nsno', '21');
      await click(page, '追加する', '.dialog');
      await page.waitForTimeout(700);
      return await see(page, 'すでに使われています');
    })());
    await page.evaluate(()=>{const e=document.querySelector('.scrim'); if(e) e.click();});
    await page.waitForTimeout(400);

    // 既存の人の用途は、行の「設定」から決める
    await page.evaluate(() => { const b = document.querySelector('[data-edit="s10"]'); if (b) b.click(); });
    t('行の「設定」から用途を変えられる', await see(page, 'この方が使う端末'));
    await page.check('#planshared');
    t('登録済みの共有端末から選べる', await page.evaluate(() =>
      !!document.getElementById('planname') &&
      [...document.querySelectorAll('#planname option')].some(o => o.value === '共有PC1')));
    await page.fill('#newmail', 'fujiwara@midori-m.com');
    await click(page, '変更する', '.dialog');
    await page.waitForTimeout(1500);
    t('その人の使う端末として記録される', (function(){
      var x = staffS.find(function(y){ return y.uid === 's10'; }) || {};
      return (x.devPlan||[]).indexOf('共有PC1') >= 0; })(),
      staffS.find(function(y){ return y.uid === 's10'; }));

    // 操作しない人
    await click(page, '＋ 追加');
    await see(page, '何を追加しますか');
    await page.selectOption('#newuid', 'h8');
    await page.check('input[name="newrole"][value="none"]');
    t('操作しないを選ぶと端末の欄が隠れる', await page.evaluate(() =>
      !!document.getElementById('usewrap') && document.getElementById('usewrap').hidden));
    await click(page, '追加する', '.dialog');
    await page.waitForTimeout(1400);
    t('操作しないとして保存される', (staffH.find(s => s.uid === 'h8') || {}).noLogin === true,
      staffH.find(s => s.uid === 'h8'));
    t('スタッフ表から消えない（休日設定で要る）', !!staffH.find(s => s.uid === 'h8'));

    await click(page, '登録端末');
    await page.waitForTimeout(700);
    const before = Object.keys(devices).length;
    const target = await page.evaluate(() => {
      const b = document.querySelector('[data-revoke]'); if (!b) return null;
      b.click(); return b.dataset.revoke;
    });
    t('取り消しの確認が出る', await see(page, 'この端末の登録を取り消します'));
    await click(page, '取り消す', '.dialog');
    await page.waitForTimeout(1200);
    t('押した端末だけが台帳から消える',
      !!target && !devices[target] && Object.keys(devices).length === before - 1,
      {消した:target, 残り:Object.keys(devices)});

    // ⑥ 管理者タブ
    await click(page, '管理者');
    t('管理者一覧が出る', await see(page, 'この画面を開けるのは'));
    t('種火の管理者が載る', await page.evaluate(() =>
      !!document.querySelector('.panelbox tbody') &&
      document.querySelector('.panelbox tbody').innerText.includes('egawa@midori-m.com')));
    t('最後の1人は外せないと出る', await see(page, '最後の1人は外せません'));
    await page.selectOption('#addadm', 'h1');
    await click(page, '管理者に追加');
    await page.waitForTimeout(900);
    t('管理者を追加できる', adminProp.includes('daisuke@midori-m.com'), adminProp);
    t('追加した人が一覧に出る', await page.evaluate(() =>
      !!document.querySelector('.panelbox tbody') &&
      document.querySelector('.panelbox tbody').innerText.includes('daisuke@midori-m.com')));

    // ⑦ 登録解除（端末の取り消し＋メール削除をまとめて）
    await click(page, 'スタッフと招待');
    await see(page, 'スタッフと招待');
    devices.dZ = { n:'岡上秀一', m:2, s:'honten', e:'okaue@midori-m.com',
                   at:Date.now(), last:Date.now(), exp:Date.now()+90*86400000, ua:'Android' };
    await click(page, '再読込').catch(()=>{});
    await page.waitForTimeout(1400);   // 読み直しで表が描き直されるのを待つ
    await page.evaluate(() => { const b = document.querySelector('[data-release="h2"]'); if (b) b.click(); });
    t('登録解除の確認が出る', await see(page, 'さんを登録解除します'));
    t('何をするか明示する', await see(page, 'ログイン用メールを消す'));
    await click(page, '登録解除する', '.dialog');
    await page.waitForTimeout(1600);
    t('端末が取り消される', !Object.keys(devices).some(k => devices[k].n === '岡上秀一'), devices);
    t('ログイン用メールが消える', !(staffH.find(s => s.uid === 'h2') || {}).loginEmail,
      staffH.find(s => s.uid === 'h2'));
    t('スタッフ表から名前は消えない', !!staffH.find(s => s.uid === 'h2'));
    t('一覧からは消えない（招待を送り直せる）', await page.evaluate(() =>
      document.querySelector('.panelbox tbody').innerText.includes('岡上秀一')), await dump(page));

    // ⑨ スケジュール画面で足した人も、再読込で拾える
    staffH.push({ uid:'h30', name:'あとから入った人', myNumber:30, badge:'mechanic', store:'honten' });
    t('足す場所の案内が出ている', await see(page, 'スタッフ設定 → ➕ 新規登録'));
    await click(page, 'スタッフと招待');
    await page.waitForTimeout(500);
    await click(page, '再読込');
    await page.waitForTimeout(1400);
    await click(page, '＋ 追加');
    await see(page, '何を追加しますか');
    t('再読込でその人が選べるようになる', await page.evaluate(() =>
      [...document.querySelectorAll('#newuid option')].some(o => o.textContent.includes('あとから入った人'))));
    await page.evaluate(()=>{const e=document.querySelector('.scrim'); if(e) e.click();});
    await page.waitForTimeout(400);

    // ⑩ 開き直しても入れる（利用証が端末に残っている）
    await page.reload({ waitUntil: 'domcontentloaded' });
    t('開き直すとログインを求められない', await see(page, '本人認証の進み具合', 8000), await dump(page));

    t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  } catch (e) {
    t('（途中で止まった）', false, String(e).split('\n')[0]);
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }

  console.log('\n=== 合格 (' + ok.length + ') ===');
  ok.forEach(s => console.log('  ' + s));
  if (ng.length) { console.log('\n=== 不合格 (' + ng.length + ') ==='); ng.forEach(s => console.log('  X ' + s)); process.exit(1); }
  console.log('\n全' + ok.length + '件 PASS');
})();
