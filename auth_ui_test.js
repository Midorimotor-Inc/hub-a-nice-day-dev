// 本人認証の画面テスト（index_dev.html）。GASは模擬し、実際にクリックして確かめる。
//   ・移行期間(AUTH_REQUIRED=false) … 従来どおり全員がログインでき、登録もできる
//   ・必須(AUTH_REQUIRED=true)      … 登録した人しか出ない／自分専用は自動ログイン
//   ・管理者側 … ログイン用メールの保存・招待メールの送信・端末一覧と取り消し
//   実行: node auth_ui_test.js
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8143, STOR = 'hub-v8-dev-';
const ok = [], ng = [];
const t = (n, c, e) => { (c ? ok : ng).push(n + (c ? '' : '  ← ' + JSON.stringify(e))); };

// サーバーが持っているスタッフ表（管理者が登録した loginEmail 付き）
let staffH = [
  { uid: 'h1', name: '見取大介', myNumber: 1, badge: 'manager', store: 'honten', loginEmail: 'daisuke@example.com' },
  { uid: 'h2', name: '岡上秀一', myNumber: 2, badge: 'mechanic', store: 'honten' },
  { uid: 'h7', name: '江川京志', myNumber: 7, badge: 'mechanic', store: 'honten', loginEmail: 'kyoshi@example.com' },
];
let devices = {};          // 端末台帳
let sentInvites = [];      // 送った招待
const CODE = '424242';

const serve = (html, name) => http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
  if (p === name) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
  }
  fs.readFile(path.join(DIR, p), (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': path.extname(p) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(data);
  });
});

// GASの模擬。認証系はここで応答を作り、それ以外のキー読みは用意した値を返す。
const gasRoute = async (route) => {
  const url = new URL(route.request().url());
  const q = url.searchParams;
  const body = (o) => route.fulfill({ status: 200, contentType: 'text/plain',
    headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });

  if (route.request().method() === 'POST') {
    let d = {}; try { d = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    let v = null; try { v = JSON.parse(d.value); } catch (e) {}
    if (d.key === STOR + 'auth-devices' && v && typeof v === 'object') devices = v;
    if (d.key === STOR + 'honten-staff-v2' && Array.isArray(v)) staffH = v;
    return route.fulfill({ status: 200, contentType: 'text/plain',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: 'ok' });
  }
  switch (q.get('action')) {
    case 'authRequest': {
      const m = String(q.get('email') || '').trim().toLowerCase();
      const s = staffH.find(x => (x.loginEmail || '').toLowerCase() === m);
      return body(s ? { ok: true } : { ok: false, err: 'not_registered' });
    }
    case 'authVerify': {
      const m = String(q.get('email') || '').trim().toLowerCase();
      const s = staffH.find(x => (x.loginEmail || '').toLowerCase() === m);
      if (!s) return body({ ok: false, err: 'not_registered' });
      if (q.get('code') !== CODE) return body({ ok: false, err: 'bad_code' });
      const jti = 'd' + Object.keys(devices).length;
      devices[jti] = { n: s.name, m: s.myNumber, s: s.store, at: Date.now(),
        exp: Date.now() + 90 * 86400000, ua: 'test' };
      return body({ ok: true, token: 'TKN-' + s.uid, exp: Date.now() + 90 * 86400000,
        name: s.name, myNumber: s.myNumber, store: s.store, uid: s.uid });
    }
    case 'authRenew':  return body({ ok: true, renewed: false, exp: Date.now() + 90 * 86400000 });
    case 'authInvite': {
      const m = String(q.get('email') || '').trim().toLowerCase();
      const s = staffH.find(x => (x.loginEmail || '').toLowerCase() === m);
      if (!s) return body({ ok: false, err: 'not_registered' });
      sentInvites.push(m); return body({ ok: true, name: s.name });
    }
  }
  const key = q.get('key') || '';
  if (key === STOR + 'honten-staff-v2') return body(staffH);
  if (key === STOR + 'auth-devices') return body(devices);
  return route.fulfill({ status: 200, contentType: 'text/plain',
    headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' });
};

// 画面の文字が出るまで待つ
const seeText = async (page, s, ms = 6000) => {
  try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; }
  catch (e) { return false; }
};
// root を渡すとその中だけを探す（モーダルの裏にある同名ボタンを押さないため）
const clickText = async (page, s, root) => page.evaluate(([x, r]) => {
  const scope = r ? document.querySelector(r) : document;
  if (!scope) return false;
  const b = [...scope.querySelectorAll('button')].find(e => e.innerText.includes(x));
  if (b) { b.click(); return true; } return false;
}, [s, root || null]);
const MODAL = '.modal-box';
// 画面に何が出ているかを見る（失敗の原因調べ用）
const dump = async (page, root) => page.evaluate(r => {
  const el = r ? document.querySelector(r) : document.body;
  return el ? el.innerText.replace(/\s+/g, ' ').slice(0, 400) : '(要素なし)';
}, root || null);

(async () => {
  const src = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  if (src.indexOf('const AUTH_REQUIRED = false;') < 0) {
    console.error('X AUTH_REQUIRED の宣言が見つかりません'); process.exit(1);
  }
  const browser = await chromium.launch({ headless: true });

  const mobSrc = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
  if (mobSrc.indexOf('const AUTH_REQUIRED = false;') < 0) {
    console.error('X mobile.html に AUTH_REQUIRED がありません'); process.exit(1);
  }
  const run = async (required, fn, file) => {
    devices = {}; sentInvites = [];
    const name = file || 'index_dev.html';
    const base = (name === 'mobile.html') ? mobSrc : src;
    const html = required ? base.replace('const AUTH_REQUIRED = false;', 'const AUTH_REQUIRED = true;') : base;
    const server = serve(html, name);
    await new Promise(r => server.listen(PORT, r));
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await ctx.route('https://script.google.com/**', gasRoute);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    // Babelの「500KBを超えたので整形をやめた」という注意はエラーではない
    page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0) errs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/` + name, { waitUntil: 'domcontentloaded' });
    try { await fn(page, errs); }
    catch (e) { t('（途中で止まった）', false, String(e).split('\n')[0]); }
    finally {
      await ctx.close(); await new Promise(r => server.close(r));
    }
  };

  // ── ① 移行期間：従来どおり入れる。登録の入口もある ──────────────
  await run(false, async (page, errs) => {
    await seeText(page, '担当者を選択してください');
    t('移行期間：従来どおり全員が並ぶ', await seeText(page, '岡上秀一'));
    t('移行期間：登録の入口がある', await seeText(page, 'スタッフを追加'));
    t('移行期間：JSエラーなし', errs.length === 0, errs.slice(0, 2));
  });

  // ── ② 必須：登録が無ければ、まず登録画面 ───────────────────────
  await run(true, async (page, errs) => {
    t('必須：いきなり登録画面が出る', await seeText(page, 'この端末にスタッフを追加'));
    t('必須：登録前は名前が一つも出ない', !(await seeText(page, '岡上秀一', 1200)));

    // 未登録アドレスは断る
    await page.fill('input[type=email]', 'stranger@example.com');
    await clickText(page, '確認コードを送る');
    t('未登録アドレスは断られる', await seeText(page, '登録されていません'));

    // 登録済みアドレス → コード → 端末の種類
    await page.fill('input[type=email]', 'daisuke@example.com');
    await clickText(page, '確認コードを送る');
    t('コード入力に進む', await seeText(page, '6桁のコードを入れてください'));

    await page.fill('input[inputmode=numeric]', '111111');
    await clickText(page, '確認する');
    t('違うコードは弾く', await seeText(page, 'コードが違います'));

    await page.fill('input[inputmode=numeric]', CODE);
    await clickText(page, '確認する');
    t('本人だと分かってから種類をたずねる', await seeText(page, 'この端末はどちらですか'));
    t('確認できた人の名前を出す', await seeText(page, '見取大介'));
    await clickText(page, 'みんなで使う');
    t('登録が完了する', await seeText(page, 'この端末に登録しました'));
    t('共有として登録された', await seeText(page, '共有'));

    await clickText(page, 'はじめる');
    t('登録後はログイン画面へ', await seeText(page, '担当者を選択してください'));
    t('登録した人だけが並ぶ', await seeText(page, '見取大介'));
    t('登録していない人は出ない', !(await seeText(page, '岡上秀一', 1200)));

    const st = await page.evaluate(() => ({
      kind: localStorage.getItem('hub-v8-dev-auth-kind'),
      mine: JSON.parse(localStorage.getItem('hub-v8-dev-auth-mine') || '[]'),
    }));
    t('端末の種類が保存される', st.kind === 'shared', st.kind);
    t('利用証が保存される', st.mine.length === 1 && st.mine[0].token === 'TKN-h1', st.mine);

    // 2人目を足すと種類は聞かれない
    await clickText(page, 'スタッフを追加');
    await seeText(page, 'この端末にスタッフを追加');
    await page.fill('input[type=email]', 'kyoshi@example.com');
    await clickText(page, '確認コードを送る');
    t('2人目には端末の種類を聞かない', await seeText(page, '6桁のコードを入れてください'));
    await page.fill('input[inputmode=numeric]', CODE);
    await clickText(page, '確認する');
    await seeText(page, 'この端末に登録しました');
    await clickText(page, 'はじめる');
    await seeText(page, '担当者を選択してください');
    t('2人が並ぶ', (await seeText(page, '見取大介')) && (await seeText(page, '江川京志')), await dump(page));
    t('必須モードでもJSエラーなし', errs.length === 0, errs.slice(0, 2));
  });

  // ── ③ 自分専用の端末は、ログイン画面を出さずに入る ────────────────
  await run(true, async (page, errs) => {
    await seeText(page, 'この端末にスタッフを追加');
    await page.fill('input[type=email]', 'daisuke@example.com');
    await clickText(page, '確認コードを送る');
    await seeText(page, '6桁のコードを入れてください');
    await page.fill('input[inputmode=numeric]', CODE);
    await clickText(page, '確認する');
    await seeText(page, 'この端末はどちらですか');
    await clickText(page, '自分専用');
    await seeText(page, 'この端末に登録しました');
    await clickText(page, 'はじめる');
    const kind = await page.evaluate(() => localStorage.getItem('hub-v8-dev-auth-kind'));
    t('自分専用として保存される', kind === 'own', kind);
    t('自分専用はログイン画面を出さない', !(await seeText(page, '担当者を選択してください', 2500)));
    // リロードしてもログイン画面は出ない
    await page.reload({ waitUntil: 'domcontentloaded' });
    t('開き直しても素通しで入れる', !(await seeText(page, '担当者を選択してください', 3500)));
    t('自分専用でJSエラーなし', errs.length === 0, errs.slice(0, 2));
  });

  // ── ④ 管理者側：メール登録・招待・端末の取り消し ──────────────────
  await run(false, async (page, errs) => {
    await seeText(page, '担当者を選択してください');
    await clickText(page, '設定');
    t('スタッフ設定が開く', await seeText(page, 'スタッフ設定'));

    // 岡上さん（メール未登録）を選ぶ
    await clickText(page, '岡上秀一', MODAL);
    t('ログイン用メール欄がある', await seeText(page, 'ログイン用メール'), await dump(page, MODAL));
    const before = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.includes('招待メールを送る'));
      return b ? b.disabled : null;
    });
    t('メール未登録なら招待は押せない', before === true, before);

    await page.fill('.modal-box input[type=email]', 'shuichi@example.com');
    await clickText(page, '変更を保存', MODAL);
    await page.waitForTimeout(1200);
    const saved = staffH.find(x => x.uid === 'h2');
    t('ログイン用メールが保存される', saved && saved.loginEmail === 'shuichi@example.com', saved);

    // 招待を送る（確認ダイアログでアドレスを読み合わせる）
    let dialogText = '';
    page.on('dialog', async d => { dialogText = d.message(); await d.accept(); });
    await clickText(page, '岡上秀一', MODAL);
    await page.waitForTimeout(250);
    await clickText(page, '招待メールを送る', MODAL);
    await page.waitForTimeout(600);
    t('送る前にアドレスを確認させる', dialogText.indexOf('shuichi@example.com') > 0, dialogText);
    t('招待が送られる', sentInvites.indexOf('shuichi@example.com') >= 0, sentInvites);
    t('送信結果を画面に出す', await seeText(page, '送信しました'));

    // 端末タブ
    devices = { dA: { n: '見取大介', m: 1, s: 'honten', at: Date.now() - 5 * 86400000,
      last: Date.now() - 86400000, exp: Date.now() + 85 * 86400000, ua: 'Test/1.0' } };
    await clickText(page, '🔑 端末', MODAL);
    t('端末一覧が出る', await seeText(page, '本人確認を済ませた端末'));
    t('端末の持ち主が出る', await seeText(page, '見取大介'));
    t('最後に使った日が出る', await seeText(page, '最後に使った日'));
    await clickText(page, '取り消し', MODAL);
    await page.waitForTimeout(1500);
    t('取り消すと台帳から消える', Object.keys(devices).length === 0, devices);
    t('管理者側でJSエラーなし', errs.length === 0, errs.slice(0, 2));
  });

  // ── ⑤ スマホ：移行期間は従来どおり番号で入れる ─────────────────
  await run(false, async (page, errs) => {
    t('スマホ：ログイン画面が出る', await seeText(page, 'LOGIN CODE'));
    t('スマホ：登録の入口がある', await seeText(page, 'スタッフを追加'));
    await page.fill('input[type=tel]', '2');
    await clickText(page, 'SIGN IN');
    t('スマホ：移行期間は番号で入れる', await seeText(page, '岡上秀一', 8000));
    t('スマホ：移行期間にJSエラーなし', errs.length === 0, errs.slice(0, 2));
  }, 'mobile.html');

  // ── ⑥ スマホ：必須にすると、登録していない人は番号でも入れない ──────
  await run(true, async (page, errs) => {
    t('スマホ：まず登録画面が出る', await seeText(page, 'この端末にスタッフを追加'));
    await page.fill('input[type=email]', 'daisuke@example.com');
    await clickText(page, '確認コードを送る');
    t('スマホ：コード入力に進む', await seeText(page, '6桁のコードを送りました') || await seeText(page, '確認する'));
    await page.fill('input[inputmode=numeric]', CODE);
    await clickText(page, '確認する');
    t('スマホ：本人だと分かってから種類をたずねる', await seeText(page, 'この端末はどちらですか'));
    await clickText(page, 'みんなで使う');
    await seeText(page, 'この端末に登録しました');
    await clickText(page, 'はじめる');
    t('スマホ：共有ならログイン画面に戻る', await seeText(page, 'LOGIN CODE'));
    // 登録していない岡上さん(No.2)では入れない
    await page.fill('input[type=tel]', '2');
    await clickText(page, 'SIGN IN');
    t('スマホ：登録していない番号は弾く', await seeText(page, 'コードが正しくありません') || await seeText(page, '登録されていません'));
    // 登録済みの見取さん(No.1)は入れる
    await page.fill('input[type=tel]', '1');
    await clickText(page, 'SIGN IN');
    t('スマホ：登録した人は入れる', await seeText(page, '見取大介', 9000));
    t('スマホ：必須モードでJSエラーなし', errs.length === 0, errs.slice(0, 2));
  }, 'mobile.html');

  // ── ⑦ スマホ：自分専用なら番号すら打たずに入れる ────────────────
  await run(true, async (page, errs) => {
    await seeText(page, 'この端末にスタッフを追加');
    await page.fill('input[type=email]', 'daisuke@example.com');
    await clickText(page, '確認コードを送る');
    await seeText(page, '確認する');
    await page.fill('input[inputmode=numeric]', CODE);
    await clickText(page, '確認する');
    await seeText(page, 'この端末はどちらですか');
    await clickText(page, '自分専用');
    await seeText(page, 'この端末に登録しました');
    await clickText(page, 'はじめる');
    t('スマホ：自分専用は番号を聞かれない', !(await seeText(page, 'LOGIN CODE', 3000)));
    await page.reload({ waitUntil: 'domcontentloaded' });
    t('スマホ：開き直しても素通しで入れる', !(await seeText(page, 'LOGIN CODE', 4000)));
    t('スマホ：自分専用でJSエラーなし', errs.length === 0, errs.slice(0, 2));
  }, 'mobile.html');

  await browser.close();

  console.log('\n=== 合格 (' + ok.length + ') ===');
  ok.forEach(s => console.log('  ' + s));
  if (ng.length) { console.log('\n=== 不合格 (' + ng.length + ') ==='); ng.forEach(s => console.log('  X ' + s)); process.exit(1); }
  console.log('\n全' + ok.length + '件 PASS');
})();
