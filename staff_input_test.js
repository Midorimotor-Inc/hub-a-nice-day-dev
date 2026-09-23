// 予約カードの「担当」欄（2026-09-23）：番号＋Enter でその場に担当者名が出る／入力履歴のポップを出さない
//   実行: node staff_input_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
const DIR = __dirname, PORT = 8178, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const seeText = async (page, s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ME = { email: 'egawa@midori-m.com', uid: 'uid_egawa', name: '江川京志', store: 'honten' };
const now = new Date(), DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
const seed = {
  [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }, { uid: 'h1', name: '見取大介', myNumber: 1, badge: 'inspector', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
};
const signedInInit = ([k, me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.uid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: 'h7', role: 'admin', active: true, kind: 'staff' } };
  st['devices/dev-test'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'shared', l: 'テストPC', ua: 'test', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev-test');
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: 'h7', name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', 'shared');
  sessionStorage.setItem(stor + 'fs-pref2', 'off');
};
(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (/\.html$/.test(p)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript(signedInInit, [0, ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  t('スケジュール画面が出る', await seeText(page, 'スケジュール', 25000));
  await page.waitForTimeout(1500);
  // タイムスケジュールの空き枠をクリックして予約カードを開く
  await page.evaluate(() => { const el = [...document.querySelectorAll('div,span')].find(e => e.offsetParent !== null && /クリックして追加/.test(e.textContent) && e.textContent.length < 20); if (el) el.click(); });
  t('予約カードが開く', await seeText(page, '担当', 10000), await page.evaluate(() => document.body.innerText.slice(0, 200)));
  const staffSel = 'input[placeholder="担当者名 or 番号"]';
  t('担当欄に入力履歴のポップを出さない（autocomplete=off）', await page.evaluate(s => { const el = document.querySelector(s); return !!el && el.getAttribute('autocomplete') === 'off'; }, staffSel));
  await page.click(staffSel);
  await page.fill(staffSel, '1');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const v1 = await page.evaluate(s => document.querySelector(s).value, staffSel);
  t('番号＋Enter で担当者名がその場に出る（1 → 見取大介）', v1 === '見取大介', v1);
  t('Enter のあとも担当欄にカーソルが残る', await page.evaluate(s => document.activeElement === document.querySelector(s), staffSel));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  t('もう一度 Enter で次の項目（車種）へ進む', await page.evaluate(() => { const el = document.activeElement; return !!el && el.getAttribute('placeholder') === '例：プリウス'; }), await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('placeholder')));
  const v2 = await page.evaluate(s => document.querySelector(s).value, staffSel);
  t('担当欄の名前はそのまま残る', v2 === '見取大介', v2);
  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
