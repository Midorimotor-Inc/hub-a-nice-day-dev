// PC の登録完了 → 「スマホも登録しますか？」→ QR、ログイン画面の「スマホを登録（QR）」を撮る（にせの firebase）。 node shot_pc_qr.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
const DIR = __dirname, PORT = 8173, STOR = 'hub-v8-dev-';
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const SEED = {
  'meta/allowed': { 'tikurin@midori-m,com': { email: 'tikurin@midori-m.com', name: '竹林直行', store: 'honten', uid: 'h3', role: 'staff', active: true, kind: 'staff' } },
  [STOR + 'honten-staff-v2']: [{ uid: 'h3', name: '竹林直行', myNumber: 3, badge: 'inspector', store: 'honten', devPlan: ['own'] }],
  [STOR + 'sanda-staff-v2']: [], [STOR + 'insp']: {}, [STOR + 'honten-sched']: {},
};
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x)); if (b) { b.click(); return true; } return false; }, s);
(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, /\.html$/.test(p) ? { 'Content-Type': 'text/html; charset=utf-8' } : {}); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(seed => { if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', JSON.stringify(seed)); }, SEED);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: route.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE_FB : '' }));
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  await page.goto('http://localhost:' + PORT + '/index_dev.html?inv=1&e=tikurin@midori-m.com&mode=signIn&oobCode=good', { waitUntil: 'domcontentloaded' });
  if (await seeText(page, 'この端末はどちらですか', 20000)) { await clickText(page, '自分専用'); }
  await seeText(page, 'スマホも登録しますか', 30000);
  await clickText(page, 'はい（QR を表示）');
  await page.waitForFunction(() => !!document.querySelector('svg'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(DIR, 'shot-pc-qr-done.png') });
  await clickText(page, 'はじめる');
  await seeText(page, 'スケジュール', 20000);
  // ログアウト → ログイン画面
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.offsetParent !== null && /ログアウト|↩|⎋/.test(e.textContent) && e.textContent.length < 8); if (b) b.click(); });
  await page.waitForTimeout(800);
  if (!(await seeText(page, 'スマホを登録（QR）', 3000))) { await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.offsetParent !== null && e.title && /ログアウト/.test(e.title)); if (b) b.click(); }); await page.waitForTimeout(800); }
  await page.screenshot({ path: path.join(DIR, 'shot-pc-qr-login.png') });
  console.log('click:', await clickText(page, 'スマホを登録'));
  await page.waitForFunction(() => document.body.innerText.includes('スマホでの手順'), null, { timeout: 15000 }).catch(() => console.log('no panel'));
  await page.waitForTimeout(600);
  console.log(await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find(e => e.textContent.includes('スマホでの手順') && e.style && e.style.position === 'fixed'); if (!el) return 'no fixed modal; body has text=' + document.body.innerText.includes('スマホでの手順'); const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height, z: cs.zIndex, disp: cs.display, vis: cs.visibility, op: cs.opacity, parent: el.parentElement.tagName + '#' + el.parentElement.id }); }));
  await page.screenshot({ path: path.join(DIR, 'shot-pc-qr-modal.png') });
  await browser.close(); server.close(); console.log('ok');
})();
