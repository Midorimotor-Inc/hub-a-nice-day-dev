// 実データ（scratchpad/real_seed.json に書き出したテスト版の休日関連キー）を にせの firebase に流し込み、
// PC の休日カレンダー（個人表示）とスタッフ休日カレンダー、スマホの休日タブを 指定の年月で描画して文字を出す。
//   node render_holiday_real.js <seed.json> <年> <月(1-12)> [氏名]
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
const [SEED_FILE, Y, M1, NAME = '江川京志'] = process.argv.slice(2);
const Y0 = Number(Y), M0 = Number(M1) - 1;
const DIR = __dirname, PORT = 8171, STOR = 'hub-v8-dev-';
const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
seed[STOR + 'insp'] = seed[STOR + 'insp'] || {}; seed[STOR + 'honten-sched'] = seed[STOR + 'honten-sched'] || {};
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ME = { email: 'egawa@midori-m.com', uid: 'uid_egawa', name: NAME, store: 'honten' };
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
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'index_dev.html' || p === 'mobile.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const routeFakeFb = (ctx) => ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  const routeGas = ctx => ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  // ── PC ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await ctx.addInitScript(signedInInit, [0, ME, STOR]);
    await ctx.addInitScript(([y, m]) => { const D = Date; const fixed = new D(y, m, 21, 10, 0, 0); window.Date = class extends D { constructor(...a) { if (a.length) super(...a); else super(fixed.getTime()); } static now() { return fixed.getTime(); } }; }, [Y0, M0]);
    await routeFakeFb(ctx); await routeGas(ctx);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, NAME, 20000); await clickText(page, NAME); await clickText(page, 'でログイン');
    await seeText(page, 'スケジュール', 20000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('カレンダー') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 16); if (b) b.click(); });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '休日' || (el.textContent.includes('休日') && el.textContent.length < 5)); if (b) b.click(); });
    await page.waitForTimeout(600);
    await page.evaluate(n => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === n); if (b) b.click(); }, NAME);
    await page.waitForTimeout(800);
    const txt = await page.evaluate(() => document.body.innerText);
    console.log('【PC 閲覧カレンダー 個人表示】', (txt.match(/\d{4}年\s*\d{1,2}月/) || [''])[0]);
    console.log('  ', (txt.match(/🏖 休日[^\n]*/) || [''])[0], '|', (txt.match(/📋 有給[^\n]*/) || [''])[0], '|', (txt.match(/枠[^\n]*/) || ['(枠の表示なし)'])[0]);
    await page.screenshot({ path: path.join(DIR, 'render-holiday-pc.png') });
    // 予定カレンダー（自分の休日が同期して出るか）
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '予定' || (el.textContent.includes('予定') && el.textContent.length < 5)); if (b) b.click(); });
    await page.waitForTimeout(800);
    const txt3 = await page.evaluate(() => document.body.innerText);
    console.log('【PC 予定カレンダー】 休日の印:', (txt3.match(/🏖 休日/g) || []).length, '件 / 有給:', (txt3.match(/📋 有給/g) || []).length, '件 / 繰り越し分:', (txt3.match(/↩d+月繰り越し分/g) || []).length, '件');
    await page.screenshot({ path: path.join(DIR, 'render-holiday-pc-mysched.png') });
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '休日' || (el.textContent.includes('休日') && el.textContent.length < 5)); if (b) b.click(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('設定') && el.textContent.length < 6 && el.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(400); await clickText(page, 'スタッフ休日設定'); await seeText(page, 'スタッフ休日・有給カレンダー', 5000);
    await page.waitForTimeout(600);
    const txt2 = await page.evaluate(() => document.body.innerText);
    console.log('【PC スタッフ休日カレンダー 集計】', (txt2.match(/📊[^\n]*/) || [''])[0]);
    console.log('  ', (txt2.match(new RegExp(NAME + '[^\\n]*')) || [''])[0]);
    console.log('   会社の休日数の欄:', (txt2.match(/月の休日数[^\n]*/) || [''])[0]);
    await page.screenshot({ path: path.join(DIR, 'render-holiday-pc-modal.png') });
    if (errs.length) console.log('   JSエラー:', errs.slice(0, 2));
    await ctx.close();
  }
  // ── スマホ ──
  {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(signedInInit, [0, ME, STOR]);
    await ctx.addInitScript(([y, m]) => { const D = Date; const fixed = new D(y, m, 21, 10, 0, 0); window.Date = class extends D { constructor(...a) { if (a.length) super(...a); else super(fixed.getTime()); } static now() { return fixed.getTime(); } }; }, [Y0, M0]);
    await routeFakeFb(ctx); await routeGas(ctx);
    const page = await ctx.newPage();
    await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, NAME, 20000);
    await page.evaluate(n => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes(n)); if (b) b.click(); }, NAME);
    await seeText(page, 'カレンダー', 20000);
    await page.evaluate(() => { const el = [...document.querySelectorAll('div')].filter(e => e.textContent === '🏖休日' || (e.textContent.includes('休日') && e.textContent.length < 6)).pop(); if (el) el.click(); });
    await seeText(page, 'スタッフ休日', 8000); await page.waitForTimeout(600);
    const txt = await page.evaluate(() => document.body.innerText);
    console.log('【スマホ 休日タブ】', (txt.match(/\d{4}年\s*\d{1,2}月/) || [''])[0]);
    console.log('  ', (txt.match(/会社の[^\n]*/) || [''])[0], '|', (txt.match(new RegExp(NAME + '：[^\\n]*')) || [''])[0], '|', (txt.match(/枠[^\n]*/) || ['(枠の表示なし)'])[0]);
    await page.screenshot({ path: path.join(DIR, 'render-holiday-mobile.png') });
    await ctx.close();
  }
  await browser.close(); server.close();
})();
