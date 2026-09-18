// 保存先 Firestore（BACKEND='firebase'）の経路の検査（Kyoshi承認のBLOCK-B変更・2026-09-18）
//   本物の Firestore には繋がず、ブラウザ内に「にせの firebase」（メモリ上の kv）を差し込んで、
//   アプリの sGet / sSet / writeVerified / useShared が Firestore 経路を通ることを確かめる。
//   ・起動時の読み込みが GAS（?key= / ?keys=）に一切行かず、Firestore の値が画面に出る
//   ・他端末の変更（ストアを直接書き換え）がポーリング無しで数秒以内に画面へ届く
//   ・未反映の控えの「送り直す」→ トランザクションで insp に行が足される（GAS への POST は無い）
//   ・認証（authXxx）は引き続き GAS へ行く
//   ・SDK が読めない（firebase 未定義）なら GAS 版として動く
//   実行: node fb_mode_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8163, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x)); if (b) { b.click(); return true; } return false; }, s);
const now = new Date();
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

// ブラウザに差し込む「にせの firebase」は fake_firebase.js（fb_auth_test.js と共用）
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
// 2026-09-18 から読み書きにはサインインが要る。検査ではサインイン済み・許可簿に載っている状態を先に作っておく
const ME = { email: 'egawa@midori-m.com', uid: 'uid_egawa', name: '江川京志', store: 'honten' };
const signedInInit = ([k, me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.uid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = { [me.email.replace(/./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: 'h7', role: 'admin', active: true, kind: 'staff' } };
  st['devices/dev-test'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'shared', l: 'テストPC', ua: 'test', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev-test');
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: 'h7', name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', 'shared');
};
(async () => {
  const src = fs.readFileSync(path.join(DIR, process.env.SRC || 'index_dev.html'), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;');
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'index_dev.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(src); return; }
    if (p === 'mobile.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });

  const run = async (label, { sdkOk }) => {
    const seed = {
      [STOR + 'insp']: { [DK]: [{ name: '前村', course: 2, staff: '江川京志', store: 'honten', bookingStatus: 'confirmed', seq: Date.now() - 900000, id: 1 }] },
      [STOR + 'honten-sched']: { [DK]: { '11:00': { name: '下野', work: 'M6', staff: '岡上秀一', id: 1 } } },
      [STOR + 'honten-lres']: {},
    };
    const pend = [{ pid: 'insp-p1', dk: DK, ts: Date.now() - 600000, row: { name: '北前', carType: 'フィット', course: 1, time: '10:00', staff: '岡上秀一', store: 'honten', bookingStatus: 'confirmed' } }];
    let gasReads = 0, gasPosts = 0, gasAuth = 0; const gasPostBodies = [];
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await ctx.addInitScript(signedInInit, [0, ME, STOR]);
    await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, JSON.stringify(v)); }, [STOR + 'insp-pending', pend]);
    // Firebase SDK の代わりに「にせの firebase」を配る（SDK が読めないケースは空のスクリプト）
    await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
      const u = route.request().url();
      const body = (sdkOk && u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + `\n(function(){ const s=${JSON.stringify(seed)}; for (const k in s) window.__fakeFb.set(k, s[k]); })();` : '';
      return route.fulfill({ status: 200, contentType: 'application/javascript', body });
    });
    await ctx.route('https://script.google.com/**', async route => {
      const req = route.request();
      const ok = b => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: b });
      const u = new URL(req.url());
      if (req.method() === 'POST') { gasPosts++; try { gasPostBodies.push(JSON.parse(req.postData() || '{}')); } catch (e) {} return ok('ok'); }
      if ((u.searchParams.get('action') || '').startsWith('auth')) { gasAuth++; return ok(JSON.stringify({ ok: true, names: ['江川京志'] })); }
      if (u.searchParams.get('key') || u.searchParams.get('keys')) {
        gasReads++;
        const keys = u.searchParams.get('keys');
        if (keys) { const out = {}; keys.split(',').forEach(k => { out[k] = (k in seed) ? JSON.stringify(seed[k]) : 'null'; }); return ok(JSON.stringify(out)); }
        const k = u.searchParams.get('key'); return ok((k in seed) ? JSON.stringify(seed[k]) : 'null');
      }
      return ok('null');
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0) errs.push(m.text()); });
    page.on('dialog', async d => { await d.accept().catch(() => {}); });
    await page.goto(`http://localhost:${PORT}/index_dev.html`, { waitUntil: 'domcontentloaded' });
    await seeText(page, '担当者を選択してください', 20000);
    await clickText(page, '江川京志'); await clickText(page, 'でログイン');
    t(label + '：スケジュールの予約が出る', await seeText(page, '前村', 20000));
    t(label + '：タイムスケジュールが出る', await seeText(page, '下野', 8000));
    const backend = await page.evaluate(() => window.__hubBackend);
    if (sdkOk) {
      t(label + '：保存先が firebase と判定される', backend === 'firebase', backend);
      await page.waitForTimeout(1500);
      t(label + '：GAS の読み（?key= / ?keys=）に行かない', gasReads === 0, { gasReads });
      // 他端末の変更 → onSnapshot で即反映（ポーリング周期を待たない）
      await page.evaluate(([k, dk]) => { const v = window.__fakeFb.get(k); v[dk].push({ name: '瀬川', course: 1, staff: '見取大介', store: 'honten', bookingStatus: 'confirmed', seq: Date.now() - 800000, id: 2 }); window.__fakeFb.set(k, v); }, [STOR + 'insp', DK]);
      t(label + '：他端末の予約が3秒以内に画面へ届く', await seeText(page, '瀬川', 3000));
      // 未反映の控えを送り直す → runTransaction で insp に足される
      t(label + '：未反映の控えが出る', await seeText(page, 'サーバーに届いていない車検予約が 1 件', 10000));
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText === '送り直す'); if (b) b.click(); });
      let landed = false;
      for (let i = 0; i < 40 && !landed; i++) { await page.waitForTimeout(250); landed = await page.evaluate(([k, dk]) => { const v = window.__fakeFb.get(k); return !!(v && v[dk] && v[dk].some(r => r.name === '北前')); }, [STOR + 'insp', DK]); }
      t(label + '：送り直しで Firestore の insp に行が足される', landed, await page.evaluate(() => window.__fakeFb.stats()));
      const st = await page.evaluate(() => window.__fakeFb.stats());
      t(label + '：書き込みはトランザクション経由', st.txns >= 1, st);
      t(label + '：Firestore の insp に3件そろう（前村・瀬川・北前）', await page.evaluate(([k, dk]) => { const v = window.__fakeFb.get(k); return v[dk].map(r => r.name).sort().join(','); }, [STOR + 'insp', DK]) === '前村,北前,瀬川');
      t(label + '：控えが空になる', await page.waitForFunction(k => JSON.parse(localStorage.getItem(k) || '[]').length === 0, STOR + 'insp-pending', { timeout: 8000 }).then(() => true).catch(() => false));
      t(label + '：GAS へのデータ書き込み（POST）が無い', gasPostBodies.filter(b => !b.action || b.action === 'setMany').length === 0, gasPostBodies.map(b => b.action || 'set'));
    } else {
      t(label + '：SDK が読めなければ GAS 版として動く', backend === 'gas' && gasReads >= 1, { backend, gasReads });
    }
    t(label + '：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  };
  await run('Firestore', { sdkOk: true });
  await run('SDK無し', { sdkOk: false });

  // にせの firebase ＋ 初期データを配る route（mobile / customers 用）
  const routeFakeFb = (ctx, seed) => ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  const routeGas = (ctx, counters) => ctx.route('https://script.google.com/**', async route => {
    const req = route.request();
    const ok = b => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: b });
    const u = new URL(req.url());
    if (req.method() === 'POST') { try { counters.posts.push(JSON.parse(req.postData() || '{}')); } catch (e) {} return ok('ok'); }
    if ((u.searchParams.get('action') || '').startsWith('auth')) return ok(JSON.stringify({ ok: true, names: ['江川京志', '見取大介'] }));
    if (u.searchParams.get('key') || u.searchParams.get('keys')) { counters.reads++; return ok('null'); }
    return ok('null');
  });
  // ── mobile.html：名前ログイン→スケジュールが Firestore から出る／他端末の変更が購読で届く／GAS の読みが無い ──
  const runMobile = async () => {
    const seed = {
      [STOR + 'insp']: { [DK]: [{ name: '前村', course: 2, staff: '江川京志', store: 'honten', bookingStatus: 'confirmed', seq: Date.now() - 900000, id: 1, time: '09:00' }] },
      [STOR + 'honten-sched']: { [DK]: { '11:00': { name: '下野', work: 'M6', staff: '岡上秀一', id: 1 } } },
      [STOR + 'honten-staff-v2']: [{ name: '江川京志', role: 'admin' }, { name: '見取大介' }],
    };
    const c = { reads: 0, posts: [] };
    const ctx = await browser.newContext({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(signedInInit, [0, ME, STOR]);
    await routeFakeFb(ctx, seed); await routeGas(ctx, c);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0) errs.push(m.text()); });
    page.on('dialog', async d => { await d.accept().catch(() => {}); });
    await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
    t('mobile：ログイン画面に名前が並ぶ', await seeText(page, '見取大介', 20000));
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => /見取大介/.test(el.textContent)); if (b) b.click(); });
    t('mobile：カレンダーに今日の台数が Firestore から出る', await seeText(page, '1台', 30000), await page.evaluate(() => document.body.innerText.slice(0, 300)));
    // スケジュールタブ（onClick 付き div）を開く
    await page.evaluate(() => { const el = [...document.querySelectorAll('div')].filter(e => e.textContent.includes('スケジュール') && e.textContent.replace(/s/g, '').length < 10).pop(); if (el) el.click(); });
    t('mobile：スケジュールの予約が Firestore から出る', await seeText(page, '前村', 30000), await page.evaluate(() => document.body.innerText.slice(0, 300)));
    const backend = await page.evaluate(() => window.__hubBackend);
    t('mobile：保存先が firebase と判定される', backend === 'firebase', backend);
    t('mobile：GAS の読み（?key= / ?keys=）に行かない', c.reads === 0, { reads: c.reads });
    await page.evaluate(([k, dk]) => { const v = window.__fakeFb.get(k); v[dk].push({ name: '瀬川', course: 1, staff: '見取大介', store: 'honten', bookingStatus: 'confirmed', seq: Date.now() - 800000, id: 2, time: '10:00' }); window.__fakeFb.set(k, v); }, [STOR + 'insp', DK]);
    t('mobile：他端末の予約が5秒以内に画面へ届く（ポーリング無し）', await seeText(page, '瀬川', 5000));
    t('mobile：GAS へのデータ書き込み（POST）が無い', c.posts.filter(b => !b.action || b.action === 'setMany').length === 0, c.posts.map(b => b.action || 'set'));
    t('mobile：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  };
  // ── customers.html：起動して顧客ファイルが Firestore から出る／GAS の読みが無い ──
  const runCustomers = async () => {
    const seed = {
      [STOR + 'cf-index']: [{ name: '202609', total: 1, chunks: 1 }],
      [STOR + 'cf-202609-index']: { name: '202609', total: 1, chunks: 1 },
      [STOR + 'cf-202609-chunk-0']: [{ name: 'テスト太郎', tel: '090', carType: 'フィット', num: '1234', expiry: '2026/9/30' }],
      [STOR + 'cust-updates']: [],
    };
    const c = { reads: 0, posts: [] };
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await ctx.addInitScript(signedInInit, [0, ME, STOR]);
    await routeFakeFb(ctx, seed); await routeGas(ctx, c);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0 && m.text().indexOf('deoptimised') < 0) errs.push(m.text()); });
    page.on('dialog', async d => { await d.accept().catch(() => {}); });
    await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
    t('customers：顧客ファイルが Firestore から出る', await seeText(page, 'テスト太郎', 30000), await page.evaluate(() => document.body.innerText.slice(0, 300)));
    const backend = await page.evaluate(() => window.__hubBackend);
    t('customers：保存先が firebase と判定される', backend === 'firebase', backend);
    await page.waitForTimeout(2000);
    t('customers：GAS の読み（?key= / ?keys=）に行かない', c.reads === 0, { reads: c.reads });
    t('customers：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  };
  await runMobile();
  await runCustomers();
  await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
