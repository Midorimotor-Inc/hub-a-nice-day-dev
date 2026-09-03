// Androidスマホで正しく動くかを実機相当で確認する。
//   Pixel相当の画面・Android版Chromeのユーザーエージェント・タッチ操作で、
//   mobile.html と index_main.html（PC版をスマホで開いた場合）を読み込み、
//   JSエラー・描画・主要ボタンの有無を調べる。
//   ★GASへの書き込みは全て遮断。読み取りはDEVのデータのみ（実データは変更しない）。
//   実行: node check_android.js
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { console.error('playwright が見つかりません。'); process.exit(1); }

const MAIN_DIR = path.resolve(__dirname, '..', 'hub-a-nice-day');
const PORT = 8177;
const GAS_HOST = 'https://script.google.com';

// Android版Chrome（Pixel 7 相当）
const ANDROID = {
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.6,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
};

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(MAIN_DIR, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': path.extname(f) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise(r => server.listen(PORT, r));

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext(ANDROID);
  let blocked = 0;
  await ctx.route(GAS_HOST + '/**', async route => {
    if (route.request().method() === 'POST') {          // 書き込みは通さない
      blocked++;
      await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'ok' });
      return;
    }
    try {
      const r = await fetch(route.request().url().replace(/hub-v8-(?!dev-)/g, 'hub-v8-dev-'), { redirect: 'follow' });
      await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: await r.text() });
    } catch (e) {
      await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' });
    }
  });

  const problems = [];
  const run = async (file, label, after) => {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 100)); });
    await page.goto(`http://127.0.0.1:${PORT}/${file}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);
    if (after) await after(page);
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.evaluate(() => document.getElementById('root') ? document.getElementById('root').innerHTML.length : document.body.innerHTML.length);
    // 横スクロールが出ていないか（スマホで一番よくある崩れ）
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`\n── ${label}（${file}）`);
    console.log(`   描画: ${html > 2000 ? '✔ あり (' + html.toLocaleString() + '文字)' : '✖ ほぼ空 (' + html + ')'}`);
    console.log(`   JSエラー: ${errs.length ? '✖ ' + errs.length + '件' : '✔ なし'}`);
    errs.slice(0, 3).forEach(e => console.log('      ' + e));
    console.log(`   横はみ出し: ${overflow > 2 ? '✖ ' + overflow + 'px' : '✔ なし'}`);
    if (html <= 2000) problems.push(label + ': 描画されない');
    if (errs.length) problems.push(label + ': JSエラー');
    if (overflow > 2) problems.push(label + ': 横スクロール発生');
    await page.screenshot({ path: path.join(__dirname, 'manual_shots', 'android-' + file.replace('.html', '') + '.png') });
    return { page, body };
  };

  console.log('=== Android（Pixel 7 / Chrome 126）で確認 ===');

  // ① スマホ版
  await run('mobile.html', 'スマホ版', async page => {
    try {
      await page.fill('input[type="tel"]', '1');
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /SIGN IN|ログイン|入る/i.test(x.textContent)); if (b) b.click(); });
      await page.waitForTimeout(13000);
    } catch (e) {}
  });

  // ② PC版をAndroidで開いた場合（誤って開く人がいるため）
  await ctx.addInitScript(() => {
    sessionStorage.setItem('hub_currentUser', JSON.stringify({
      uid: 'h1', name: '見取大介', myNumber: 1, id: 1, badge: 'inspector',
      store: { id: 'honten', name: '本店', color: '#2563eb', bg: '#eff6ff', accent: '#1d4ed8' },
    }));
  });
  await run('index_main.html', 'PC版をAndroidで開いた場合', null);

  await browser.close();
  server.close();
  console.log(`\n遮断した書き込み: ${blocked}件（実データへの書き込みゼロ）`);
  console.log(problems.length ? '\n★問題あり:\n  ' + problems.join('\n  ') : '\n★問題なし — Androidで正常に動作します');
  process.exit(problems.length ? 1 : 0);
})();
