// ログイン登録手順書（build_auth_manual_pptx.js）用のスクリーンショットを撮る。
//   GASは模擬（実物には一切触れない）。index_dev.html / mobile.html をローカルで配信し、
//   PC（Edge相当の幅）とiPhone（390×844）で、招待リンク → 6桁 → 端末の種類 → 完了 → 引き継ぎ を辿る。
//   実行: node capture_auth_shots.js   → manual_shots/auth-*.png
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8151, STOR = 'hub-v8-dev-', OUT = path.join(DIR, 'manual_shots');
const CODE = '483920', INV = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const staffH = [
  { uid: 'h1', name: '見取大介', myNumber: 1, badge: 'manager',  store: 'honten', loginEmail: 'daisuke@midori-m.com' },
  { uid: 'h2', name: '岡上秀一', myNumber: 2, badge: 'mechanic', store: 'honten' },
  { uid: 'h3', name: '竹林直行', myNumber: 3, badge: 'inspector', store: 'honten', loginEmail: 'tikurin@midori-m.com' },
];
const staffS = [{ uid: 's10', name: '藤原昭人', myNumber: 10, badge: 'sales', store: 'sanda' }];
let devices = {}; const HANDS = {};

const src = f => fs.readFileSync(path.join(DIR, f), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = true;').replace(/const BACKEND = '[a-z]+';/, "const BACKEND = 'gas';");
const pages = { 'index_dev.html': src('index_dev.html'), 'mobile.html': src('mobile.html') };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index_dev.html';
  if (pages[p]) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(pages[p]); return; }
  fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200); res.end(d); });
});

const gasRoute = async route => {
  const q = new URL(route.request().url()).searchParams;
  const body = o => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });
  if (route.request().method() === 'POST') return route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'ok' });
  const s = staffH[0];
  switch (q.get('action')) {
    case 'authRequest': return body({ ok: true, existing: true });
    case 'authVerify': {
      if (q.get('code') !== CODE) return body({ ok: false, err: 'bad_code' });
      devices['d1'] = { n: s.name, m: s.myNumber, s: s.store, at: Date.now(), exp: Date.now() + 90 * 86400000, ua: 'x' };
      return body({ ok: true, token: 'TKN-h1', exp: Date.now() + 90 * 86400000, name: s.name, myNumber: 1, store: 'honten', uid: 'h1', admin: false });
    }
    case 'authRenew': return body({ ok: true, renewed: false, exp: Date.now() + 90 * 86400000 });
    case 'authLabel': return body({ ok: true });
    case 'authAdminNames': return body({ ok: true, names: [] });
    case 'authHandoff': { const id = 'b'.repeat(32); HANDS[id] = 'TKN-h1'; return body({ ok: true, hand: id }); }
    case 'authHandoffTake': {
      if (!HANDS[q.get('hand')]) return body({ ok: false, err: 'bad_hand' });
      return body({ ok: true, token: 'TKN-h1', name: s.name, myNumber: 1, store: 'honten', uid: 'h1', exp: Date.now() + 90 * 86400000, admin: false, device: false, label: '', kind: 'own' });
    }
  }
  const key = q.get('key') || '';
  if (key === STOR + 'honten-staff-v2') return body(staffH);
  if (key === STOR + 'sanda-staff-v2') return body(staffS);
  if (key === STOR + 'auth-devices') return body(devices);
  if (key === STOR + 'auth-devnames') return body([{ name: '共有PC1', store: 'honten' }]);
  return route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' });
};

const see = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const click = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x)); if (b) { b.click(); return true; } return false; }, s);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) });

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });

  // ── PC（Edge相当） ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
    await ctx.route('https://script.google.com/**', gasRoute);
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/index_dev.html?inv=${INV}`, { waitUntil: 'domcontentloaded' });
    await see(page, '招待メールに書かれた6桁'); await page.waitForTimeout(400);
    await shot(page, 'auth-pc-1-code.png');
    await page.fill('input[inputmode=numeric]', CODE);
    await page.waitForTimeout(200);
    await shot(page, 'auth-pc-2-code-filled.png');
    await click(page, '確認する');
    await see(page, 'この端末はどちらですか'); await page.waitForTimeout(300);
    await shot(page, 'auth-pc-3-kind.png');
    await click(page, '自分専用');
    await see(page, 'この端末に登録しました'); await page.waitForTimeout(300);
    await shot(page, 'auth-pc-4-done.png');
    await ctx.close();
  }
  // ── iPhone（Safari） ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' });
    await ctx.route('https://script.google.com/**', gasRoute);
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/index_dev.html?inv=${INV}`, { waitUntil: 'domcontentloaded' });
    await see(page, '招待メールに書かれた6桁'); await page.waitForTimeout(400);
    await shot(page, 'auth-ip-1-code.png');
    await page.fill('input[inputmode=numeric]', CODE);
    await click(page, '確認する');
    await see(page, 'この端末はどちらですか'); await page.waitForTimeout(300);
    await shot(page, 'auth-ip-2-kind.png');
    await click(page, '自分専用');
    await see(page, 'スマホ版を開く'); await page.waitForTimeout(600);
    await shot(page, 'auth-ip-3-done.png');
    // スマホ版へ（引き継ぎ）— 別の保管場所でも同じになるよう、新しいコンテキストで ?hand= から開く
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' });
    await ctx2.route('https://script.google.com/**', gasRoute);
    const p2 = await ctx2.newPage();
    await p2.goto(`http://localhost:${PORT}/mobile.html?hand=${'b'.repeat(32)}`, { waitUntil: 'domcontentloaded' });
    await see(p2, 'ホーム画面に追加'); await p2.waitForTimeout(3200);   // ログインの演出が終わるのを待つ
    await shot(p2, 'auth-ip-4-mobile-hint.png');
    await ctx.close(); await ctx2.close();
  }
  await browser.close();
  await new Promise(r => server.close(r));
  console.log('ok → manual_shots/auth-*.png');
})();
