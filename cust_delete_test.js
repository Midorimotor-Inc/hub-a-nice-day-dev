// 顧客ファイルの削除（2026-09-23）の検査。にせの firebase で本物には繋がない。
//   ・削除すると一覧（cf-index）から外れ、チャンク（中身）もサーバーから消える
//   ・他のPCが開き直した時に出てこない
//   ・開きっぱなしの他のPCでも、一覧の変化を受け取って画面から消える
//   実行: node cust_delete_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }
const DIR = __dirname, PORT = 8175, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const seeText = async (page, s, ms = 15000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const goneText = async (page, s, ms = 15000) => { try { await page.waitForFunction(x => !document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ME = { email: 'egawa@midori-m.com', uid: 'uid_egawa', name: '江川京志', store: 'honten' };
const signedInInit = ([k, me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.uid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: 'h7', role: 'admin', active: true, kind: 'staff' } };
  st['devices/dev-test'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'shared', l: 'テストPC', ua: 'test', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev-test');
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: 'h7', name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', 'shared');
};
const cust = (i, name) => ({ custId: 'c' + i, rowIdx: i, expiry: '2026-11-20', name, no: 1000 + i, carType: '車', phoneHome: '', phoneMobile: '', address: '',
  dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '', entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', status: 'none', bookingTime: '', linkedInspDate: '' });
const seed = {
  [STOR + 'cf-index']: [{ name: '202610', count: 2 }, { name: '202611', count: 1 }],
  [STOR + 'cf-202610-index']: { name: '202610', chunks: 1, total: 2 },
  [STOR + 'cf-202610-chunk-0']: [cust(1, '甲　一郎'), cust(2, '乙　二郎')],
  [STOR + 'cf-202611-index']: { name: '202611', chunks: 1, total: 1 },
  [STOR + 'cf-202611-chunk-0']: [cust(3, '丙　三郎')],
  [STOR + 'cust-updates']: [],
  [STOR + 'insp']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
};
(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'customers.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8')); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const watch = page => { const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0 && m.text().indexOf('deoptimised') < 0) errs.push(m.text().slice(0, 200)); }); return errs; };
  const open = async (store) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    if (store) await ctx.addInitScript(s => { if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', s); }, store);   // 先に写しを置く（signedInInit は足すだけ）
    await ctx.addInitScript(signedInInit, [0, ME, STOR]);
    await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
      const u = route.request().url();
      const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + (store ? '' : '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();') : '';
      return route.fulfill({ status: 200, contentType: 'application/javascript', body });
    });
    await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
    const page = await ctx.newPage(); const errs = watch(page);
    page.on('dialog', async d => { await d.accept().catch(() => {}); });   // 削除の確認は「はい」
    await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
    return { ctx, page, errs };
  };

  // ── 1. 削除する側（PC-A）──
  const A = await open(null);
  t('A：2つのファイルが並ぶ', await seeText(A.page, '202610', 25000) && await seeText(A.page, '202611', 10000));
  // 開きっぱなしの他のPC（PC-B）を、この時点の store の写しで開く
  const stBefore = await A.page.evaluate(() => localStorage.getItem('__fakeFbStore'));
  const B = await open(stBefore);
  t('B：同じ2つのファイルが並ぶ', await seeText(B.page, '202610', 25000) && await seeText(B.page, '202611', 10000));
  // A で 202610 を削除
  await A.page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.title === 'このファイルを削除' && (e.closest('div') || {}).innerText && (e.parentElement.innerText || '').includes('202610')); (b || [...document.querySelectorAll('button')].find(e => e.title === 'このファイルを削除')).click(); });
  t('A：削除したファイルが画面から消える', await goneText(A.page, '202610', 15000), await A.page.evaluate(() => document.body.innerText.slice(0, 200)));
  t('A：一覧（cf-index）から名前が外れる', await A.page.waitForFunction(k => { const v = window.__fakeFb.get(k + 'cf-index'); return Array.isArray(v) && !v.some(x => x && x.name === '202610') && v.some(x => x && x.name === '202611'); }, STOR, { timeout: 15000 }).then(() => true).catch(() => false), await A.page.evaluate(k => window.__fakeFb.get(k + 'cf-index'), STOR));
  t('A：中身（チャンク・ファイル索引）もサーバーから消える', await A.page.waitForFunction(k => !window.__fakeFb.get(k + 'cf-202610-chunk-0') && !window.__fakeFb.get(k + 'cf-202610-index'), STOR, { timeout: 15000 }).then(() => true).catch(() => false), await A.page.evaluate(k => ({ chunk: window.__fakeFb.get(k + 'cf-202610-chunk-0'), idx: window.__fakeFb.get(k + 'cf-202610-index') }), STOR));
  t('A：消していない方（202611）は残る', (await A.page.evaluate(() => document.body.innerText)).includes('202611'));
  t('A：JSエラーなし', A.errs.length === 0, A.errs.slice(0, 3));

  // ── 2. 開きっぱなしの他のPC（B）にも届く ──
  const stAfter = await A.page.evaluate(() => localStorage.getItem('__fakeFbStore'));
  // B（開きっぱなし）に、A の削除後のサーバー状態を届ける
  await B.page.evaluate(s => { const v = JSON.parse(s); const d = v['kv/hub-v8-dev-cf-index']; window.__fakeFb.set('hub-v8-dev-cf-index', JSON.parse((d && d.v) || '[]')); }, stAfter);
  t('B（開きっぱなし）：消されたファイルが画面から消える', await goneText(B.page, '202610', 20000), await B.page.evaluate(() => document.body.innerText.slice(0, 200)));
  t('B：残っている方は消えない', (await B.page.evaluate(() => document.body.innerText)).includes('202611'), await B.page.evaluate(() => document.body.innerText.slice(0, 300)));
  t('B：JSエラーなし', B.errs.length === 0, B.errs.slice(0, 3));

  // ── 3. 別のPC（C）が新しく開いた時も出てこない ──
  const C = await open(stAfter);
  t('C（開き直し）：残っているファイルだけが並ぶ', await seeText(C.page, '202611', 25000) && !(await C.page.evaluate(() => document.body.innerText)).includes('202610'), await C.page.evaluate(() => document.body.innerText.slice(0, 200)));
  t('C：JSエラーなし', C.errs.length === 0, C.errs.slice(0, 3));

  await A.ctx.close(); await B.ctx.close(); await C.ctx.close();
  await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
