// スマホ休日タブの「確定」ボタンの見た目を撮る（にせの firebase）。 node shot_mobile_confirm.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
const DIR = __dirname, PORT = 8172, STOR = 'hub-v8-dev-';
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const now = new Date(), Y = now.getFullYear(), M = now.getMonth();
const seed = {
  [STOR + 'insp']: {}, [STOR + 'honten-sched']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }, { uid: 'h1', name: '見取大介', myNumber: 1, badge: 'inspector', store: 'honten' }, { uid: 'h3', name: '竹林直行', myNumber: 3, badge: 'inspector', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [], [STOR + 'honten-dayoff']: {}, [STOR + 'honten-pleave']: {},
  [STOR + 'honten-cdate']: [], [STOR + 'sanda-cdate']: [], [STOR + 'honten-cdow']: [], [STOR + 'sanda-cdow-v2']: [3],
  [STOR + 'mholidays']: { [`${Y}-${M + 1}`]: 9 },
};
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
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x)); if (b) { b.click(); return true; } return false; }, s);
(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'mobile.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 850 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(signedInInit, [0, ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => { const u = route.request().url(); const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : ''; return route.fulfill({ status: 200, contentType: 'application/javascript', body }); });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await seeText(page, 'カレンダー', 20000);
  await page.evaluate(() => { const el = [...document.querySelectorAll('div')].filter(e => e.textContent === '🏖休日' || (e.textContent.includes('休日') && e.textContent.length < 6)).pop(); if (el) el.click(); });
  await seeText(page, 'スタッフ休日', 8000); await page.waitForTimeout(500);
  await clickText(page, '休日を入力する'); await page.waitForTimeout(300);
  const tapDay = d => page.evaluate(d => { const c = [...document.querySelectorAll('div')].filter(e => e.style && e.style.cursor === 'pointer' && e.firstElementChild && e.firstElementChild.textContent === String(d))[0]; if (c) c.click(); }, d);
  const dim = new Date(Y, M + 1, 0).getDate(); const picks = []; for (let d = 5; d <= dim && picks.length < 3; d++) { const w = new Date(Y, M, d).getDay(); if (w !== 2 && w !== 3) picks.push(d); }
  for (const d of picks) { await tapDay(d); await page.waitForTimeout(150); }
  const box = await page.evaluate(() => { const b = document.querySelector('[data-edit-bar]'); const r = b.getBoundingClientRect(); return { y: r.top }; });
  await page.screenshot({ path: path.join(DIR, 'shot-mobile-confirm.png'), clip: { x: 0, y: Math.max(0, box.y - 6), width: 400, height: 520 } });
  await browser.close(); server.close(); console.log('ok');
})();
