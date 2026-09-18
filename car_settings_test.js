// 代車・レンタカー設定（車両名の編集）：
//   ・車両名が白文字で読めない（2026-09-16 報告）→ 濃い色で出る
//   ・「✓」を押さずに「保存」を押しても、入力中の名前が保存される（同報告）
//   ・追加フォームに名前を入れたまま「保存」しても足される
//   実行: node car_settings_test.js
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8158, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s, root) => page.evaluate(([x, r]) => {
  const scope = r ? document.querySelector(r) : document; if (!scope) return false;
  const b = [...scope.querySelectorAll('button')].find(e => e.innerText.trim() === x || e.innerText.includes(x));
  if (b) { b.click(); return true; } return false;
}, [s, root || null]);

(async () => {
  const src = fs.readFileSync(path.join(DIR, process.env.SRC || 'index_dev.html'), 'utf8')
    .replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')
    .replace(/const BACKEND = '[a-z]+';/, "const BACKEND = 'gas';");   // この検査は GAS を模擬するので保存先を GAS に固定（2026-09-18）
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'index_dev.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(src); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });

  let cars = [{ id: 1, name: 'ワゴンR', num: '1234', store: 'honten' }, { id: 2, name: 'ムーヴ', num: '5678', store: 'honten' }];
  const writes = [];
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.route('https://script.google.com/**', async route => {
    const req = route.request();
    const ok = b => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: b });
    if (req.method() === 'POST') {
      let d = {}; try { d = JSON.parse(req.postData() || '{}'); } catch (e) {}
      const items = d.action === 'setMany' && Array.isArray(d.items) ? d.items : [d];
      for (const it of items) {
        let v = null; try { v = JSON.parse(it.value); } catch (e) {}
        if (it.key === STOR + 'honten-cars' && Array.isArray(v)) { cars = v; writes.push(v); }
      }
      return ok('ok');
    }
    const k = new URL(req.url()).searchParams.get('key') || '';
    if (k === STOR + 'honten-cars') return ok(JSON.stringify(cars));
    return ok('null');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0) errs.push(m.text()); });
  page.on('dialog', async d => { errs.push('dialog: ' + d.message()); await d.dismiss().catch(() => {}); });

  await page.goto(`http://localhost:${PORT}/index_dev.html`, { waitUntil: 'domcontentloaded' });
  await seeText(page, '担当者を選択してください');
  await clickText(page, '江川京志');
  await clickText(page, 'でログイン');
  await seeText(page, '代車管理', 15000);
  await clickText(page, '代車管理');
  await seeText(page, 'ワゴンR', 15000);
  await page.click('button[title="代車・レンタカー設定"]');
  t('設定モーダルが開く', await seeText(page, '代車・レンタカー設定', 5000));

  // 見出しと車両名が白文字でない
  const colors = await page.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find(e => e.innerText.includes('代車・レンタカー設定'));
    const nm = [...document.querySelectorAll('.modal-box div')].find(e => e.children.length === 0 && e.innerText.trim() === 'ワゴンR');
    const c = el => el ? getComputedStyle(el).color : '';
    return { h: c(h), nm: c(nm) };
  });
  const notWhite = c => c && c !== 'rgb(255, 255, 255)';
  t('見出しが白文字でない', notWhite(colors.h), colors);
  t('車両名が白文字でない', notWhite(colors.nm), colors);

  // 「編集」→ 名前を変える → ✓ を押さずに「保存」
  await clickText(page, '編集', '.modal-box');
  await seeText(page, '車両名', 3000);
  const inp = await page.$('.modal-box input[placeholder="車両名"]');
  t('編集欄が出る', !!inp);
  const inpColor = await page.evaluate(() => { const i = document.querySelector('.modal-box input[placeholder="車両名"]'); return i ? getComputedStyle(i).color : ''; });
  t('編集欄の文字が白でない', notWhite(inpColor), inpColor);
  await inp.fill('スペーシア');
  // 追加フォームにも名前だけ入れて「追加」を押さない
  await page.fill('.modal-box input[placeholder^="車両名（例"]', 'タント');
  await clickText(page, '✓ 保存', '.modal-box');
  await page.waitForTimeout(1500);
  const last = writes[writes.length - 1] || [];
  t('保存が1回書かれる', writes.length >= 1, writes.length);
  t('✓ を押さなくても新しい車両名が保存される', last[0] && last[0].name === 'スペーシア' && last[0].id === 1 && last[0].num === '1234', last);
  t('「追加」を押していない追加フォームの車両も足される', last.some(c => c.name === 'タント' && c.store === 'honten'), last);
  t('他の車両はそのまま', last.some(c => c.id === 2 && c.name === 'ムーヴ'), last);
  t('JSエラー・警告ダイアログなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
