// ① 更新の帯：サーバー側のバージョン番号が違えば（__APP_BUILD が同じでも）帯が出る／同じなら出ない
// ② 既定で全画面：初めて開いたタブでは最初の操作で全画面に入る。「元に戻す」を押した端末は次から入らない。
//    （2026-09-12 ユーザー指示。全画面はブラウザの制約で操作なしには入れないので「最初の操作で」）
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname;
const PORT = 8155;
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };

(async () => {
  // 配信側の版を切り替えられる小さなサーバー。 ?_v= 付き（帯の確認用の取得）だけ「新しい版」を返す。
  let served = {};  // file -> {bumpVersion:boolean}
  const server = http.createServer((req, res) => {
    const [p0, qs] = req.url.split('?');
    const p = decodeURIComponent(p0).replace(/^\//, '');
    fs.readFile(path.join(DIR, p), 'utf8', (err, d) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      let out = d;
      if (p.endsWith('.html')) {
        out = out.replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;');
        // 帯の確認用の取得（?_v=）にだけ、バージョン番号を1つ上げた版を返す
        if (qs && /_v=/.test(qs) && served[p] && served[p].bumpVersion) {
          out = out.replace(/(APP_VERSION|MOBILE_VERSION)(\s*=\s*)'(\d+)\.(\d+)'/, (m, k, eq, a, b) => `${k}${eq}'${a}.${Number(b) + 1}'`);
        }
        // 帯は 8 秒後の確認で出る。テストでは待ち時間を 1 秒に縮める
        out = out.replace('setTimeout(check,8000);', 'setTimeout(check,1000);');
      }
      res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(out);
    });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });

  const open = async (file, opts) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    if (opts && opts.before) { await page.goto(`http://localhost:${PORT}/blank.txt`).catch(() => {}); await page.evaluate(opts.before); }
    await page.goto(`http://localhost:${PORT}/${file}`, { waitUntil: 'domcontentloaded' });
    return { ctx, page, errs };
  };

  // ── ① 更新の帯 ──
  for (const file of ['index_dev.html', 'customers.html', 'mobile.html']) {
    served = { [file]: { bumpVersion: true } };
    const { ctx, page, errs } = await open(file);
    t(file + '：版が上がっていれば帯が出る（__APP_BUILD が同じでも）', await seeText(page, '新しいバージョンがあります', 30000));
    t(file + '：JSエラーなし', errs.length === 0, errs.slice(0, 2));
    await ctx.close();
    served = { [file]: { bumpVersion: false } };
    const r2 = await open(file);
    await r2.page.waitForTimeout(4000);
    t(file + '：同じ版なら帯は出ない', !(await r2.page.evaluate(() => document.body.innerText.includes('新しいバージョンがあります'))));
    await r2.ctx.close();
  }

  // ── ② 既定で全画面（index_dev.html）──
  //   headless では requestFullscreen が拒否されることがあるので、呼ばれたかどうかを記録して確かめる
  const spy = () => {
    window.__fsCalls = 0;
    const orig = Element.prototype.requestFullscreen;
    Element.prototype.requestFullscreen = function () { window.__fsCalls++; return orig ? orig.apply(this, arguments).catch(() => {}) : Promise.resolve(); };
  };
  {
    const { ctx, page } = await open('index_dev.html');
    await page.evaluate(spy);
    await seeText(page, '担当者を選択してください');
    await page.mouse.click(700, 500);          // 最初の操作
    await page.waitForTimeout(500);
    t('初めて開いたタブ：最初の操作で全画面に入ろうとする', (await page.evaluate(() => window.__fsCalls)) >= 1);
    await ctx.close();
  }
  {
    // 「元に戻す」を押した端末（fs-pref='off'）は、次から入らない
    const { ctx, page } = await open('index_dev.html', { before: () => { try { localStorage.setItem('hub-v8-dev-fs-pref', 'off'); } catch (e) {} } });
    await page.evaluate(spy);
    await seeText(page, '担当者を選択してください');
    await page.mouse.click(700, 500);
    await page.waitForTimeout(500);
    t('「元に戻す」を押した端末：最初の操作でも全画面に入らない', (await page.evaluate(() => window.__fsCalls)) === 0);
    await ctx.close();
  }
  {
    // Escで抜けた（同じタブで fs-restore='0'）→ このタブでは復帰しない
    const { ctx, page } = await open('index_dev.html', { before: () => { try { sessionStorage.setItem('hub-v8-dev-fs-restore', '0'); } catch (e) {} } });
    await page.evaluate(spy);
    await seeText(page, '担当者を選択してください');
    await page.mouse.click(700, 500);
    await page.waitForTimeout(500);
    t('Escで抜けたタブ：勝手に戻らない', (await page.evaluate(() => window.__fsCalls)) === 0);
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
