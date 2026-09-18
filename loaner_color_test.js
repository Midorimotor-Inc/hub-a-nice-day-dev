// 代車管理の色分け：同じ日の別のお客様は違う色、同じお客様は常に同じ色（記録された color が同じでも）。
//   2026-09-17 報告：9/17 の代車予約が全部同じ色。色が「名前を入れる前」に決まっていたため。
//   実行: node loaner_color_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8162, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x)); if (b) { b.click(); return true; } return false; }, s);

const now = new Date(); const Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
const SAME = '#c2410c';
const rec = (id, carId, user) => ({ id, carId, user, fy: Y, fm: M, fd: D, ty: Y, tm: M, td: D, color: SAME });
(async () => {
  const src = fs.readFileSync(path.join(DIR, process.env.SRC || 'index_dev.html'), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')
    .replace(/const BACKEND = '[a-z]+';/, "const BACKEND = 'gas';");   // この検査は GAS を模擬するので保存先を GAS に固定（2026-09-18）
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'index_dev.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(src); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  // 3台に、山田・新井・北前（記録上は全部同じ色）。4台目は山田がもう1件（同じお客様）
  const lres = { 1: { a: rec(1001, 1, '山田') }, 2: { b: rec(1002, 2, '新井') }, 3: { c: rec(1003, 3, '北前') } };
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.route('https://script.google.com/**', async route => {
    const req = route.request();
    const ok = b => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: b });
    if (req.method() === 'POST') return ok('ok');
    const k = new URL(req.url()).searchParams.get('key') || '';
    if (k === STOR + 'honten-lres') return ok(JSON.stringify(lres));
    return ok('null');
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`http://localhost:${PORT}/index_dev.html`, { waitUntil: 'domcontentloaded' });
  await seeText(page, '担当者を選択してください');
  await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, '代車管理', 15000); await clickText(page, '代車管理');
  t('代車管理に3件出る', await seeText(page, '山田', 15000) && await seeText(page, '新井') && await seeText(page, '北前'));
  const colors = await page.evaluate(() => {
    const out = {};
    for (const nm of ['山田', '新井', '北前']) {
      const td = [...document.querySelectorAll('td')].find(e => e.innerText.trim().startsWith(nm));
      out[nm] = td ? getComputedStyle(td).backgroundColor : null;
    }
    return out;
  });
  const vals = Object.values(colors);
  t('3件とも色が付いている', vals.every(v => v && v !== 'rgba(0, 0, 0, 0)' && v !== 'rgb(255, 255, 255)'), colors);
  t('記録された色が同じでも、別のお客様は違う色で出る', new Set(vals).size === 3, colors);
  t('JSエラーなし', errs.length === 0, errs.slice(0, 2));
  await ctx.close(); await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
