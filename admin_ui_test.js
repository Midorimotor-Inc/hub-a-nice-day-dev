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

let staffH, staffS, devices, adminProp, sentInvites, sentCodes;
function reset() {
  staffH = [
    { uid:'h1', name:'見取大介', myNumber:1, badge:'manager',  store:'honten', loginEmail:'daisuke@midori-m.com' },
    { uid:'h2', name:'岡上秀一', myNumber:2, badge:'mechanic', store:'honten' },
    { uid:'h7', name:'江川京志', myNumber:7, badge:'mechanic', store:'honten' },   // メール未設定（種火の管理者）
    { uid:'h8', name:'ダク', myNumber:8, badge:'mechanic', store:'honten' },       // 助っ人。PCを持たず触らない
  ];
  staffS = [ { uid:'s10', name:'藤原昭人', myNumber:10, badge:'manager', store:'sanda' } ];
  devices = {
    dA: { n:'見取大介', m:1, s:'honten', e:'daisuke@midori-m.com',
          at:Date.now()-40*86400000, last:Date.now()-86400000, exp:Date.now()+89*86400000, ua:'Windows Chrome' },
  };
  adminProp = 'egawa@midori-m.com=h7';
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
    t('4人が並ぶ', await see(page, '藤原昭人') && await see(page, '岡上秀一'));
    t('登録済みが1人と出る', await page.evaluate(() =>
      document.querySelectorAll('.state.ok').length >= 1));

    // ④ メールを登録して招待を送る
    await page.evaluate(() => {
      const i = document.querySelector('[data-mail="h2"]');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(i, 'okaue@midori-m.com');
      i.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(900);
    t('ログイン用メールが保存される',
      (staffH.find(s => s.uid === 'h2') || {}).loginEmail === 'okaue@midori-m.com',
      staffH.find(s => s.uid === 'h2'));
    t('保存を知らせる', await see(page, '保存しました'));

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
    t('失効までの日数が出る', await see(page, 'あと'));
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
    await page.evaluate(() => { const b = document.querySelector('[data-release="h2"]'); if (b) b.click(); });
    t('登録解除の確認が出る', await see(page, 'さんを登録解除します'));
    t('何をするか明示する', await see(page, 'ログイン用メールを消す'));
    await click(page, '登録解除する', '.dialog');
    await page.waitForTimeout(1600);
    t('端末が取り消される', !Object.keys(devices).some(k => devices[k].n === '岡上秀一'), devices);
    t('ログイン用メールが消える', !(staffH.find(s => s.uid === 'h2') || {}).loginEmail,
      staffH.find(s => s.uid === 'h2'));
    t('スタッフ表から名前は消えない', !!staffH.find(s => s.uid === 'h2'));

    // ⑧ ログイン不要 —— アルバイト・助っ人を進み具合の母数から外す
    const progBefore = await page.evaluate(() => document.querySelector('.progress').innerText.replace(/\s+/g,' '));
    t('母数に全員が入っている', /5\s*人が対象/.test(progBefore), progBefore);
    await page.evaluate(() => { const b = document.querySelector('[data-nologin="h8"]'); if (b) b.click(); });
    t('ログイン不要の確認が出る', await see(page, 'さんを「ログイン不要」にします'));
    t('何が起きるか明示する', await see(page, '休日設定・頭数・予約の担当欄には今までどおり出ます'));
    await click(page, 'ログイン不要にする', '.dialog');
    await page.waitForTimeout(1300);
    t('スタッフ表に印が付く', (staffH.find(s => s.uid === 'h8') || {}).noLogin === true,
      staffH.find(s => s.uid === 'h8'));
    t('スタッフ表から消えない（休日設定で要る）', !!staffH.find(s => s.uid === 'h8'));
    const after = await page.evaluate(() => document.querySelector('.progress').innerText.replace(/\s+/g,' '));
    t('母数から外れる', /4\s*人が対象/.test(after) && /1\s*ログイン不要/.test(after), after);
    t('一覧に「ログイン不要」と出る', await page.evaluate(() =>
      document.querySelector('.panelbox tbody').innerText.includes('ログイン不要')));
    t('招待の対象から外れる', await page.evaluate(() =>
      !document.querySelector('[data-invite="h8"]')));

    // 戻せること
    await page.evaluate(() => { const b = document.querySelector('[data-needlogin="h8"]'); if (b) b.click(); });
    await page.waitForTimeout(1300);
    t('ログインを使う扱いに戻せる', !(staffH.find(s => s.uid === 'h8') || {}).noLogin,
      staffH.find(s => s.uid === 'h8'));

    // ⑨ 開き直しても入れる（利用証が端末に残っている）
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
