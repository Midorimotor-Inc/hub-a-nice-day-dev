// 代車管理で予約の利用者名（や期間）を変えて保存したあと、古いサーバー値（GASの60秒キャッシュ）が
// 返ってきても画面が元に戻らないこと。
//   2026-09-16 ユーザー報告：代車・レンタカーの編集で名前を変えて保存しても何も変わらない。
//   原因：突き合わせ規則が id（作成時刻）だけを見ていたため、編集しても「サーバーの方が正」と判定され、
//         キャッシュの古い値に数秒で上書きされていた。編集時に savedAt を打ち直し、id と savedAt の大きい方で比べる。
//   実行: node loaner_edit_name_test.js
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8157, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s, root) => page.evaluate(([x, r]) => {
  const scope = r ? document.querySelector(r) : document; if (!scope) return false;
  const b = [...scope.querySelectorAll('button')].find(e => e.innerText.includes(x));
  if (b) { b.click(); return true; } return false;
}, [s, root || null]);

const now = new Date();
const Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
// 今日を含む3日間の代車予約（車id=1 ワゴンR）。id は「古い」作成時刻（3日前）
const OLD_ID = Date.now() - 3 * 86400000;
const rec0 = { id: OLD_ID, carId: 1, user: '山田　太郎', fy: Y, fm: M, fd: D, ty: Y, tm: M, td: D, color: '#c2410c' };
const STALE_MS = 28000;   // 書き込み後28秒は古い値を返し続ける（GASの60秒キャッシュの模擬）

(async () => {
  const src = fs.readFileSync(path.join(DIR, process.env.SRC || 'index_dev.html'), 'utf8')   // SRC=… で別ファイルを検査（修正前の再現用）
    .replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')
    .replace(/const BACKEND = '[a-z]+';/, "const BACKEND = 'gas';");   // この検査は GAS を模擬するので保存先を GAS に固定（2026-09-18）
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'index_dev.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(src); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });

  let lres = { 1: { [OLD_ID]: rec0 } };      // サーバーの本当の値
  let staleUntil = 0, staleValue = null;     // キャッシュの模擬：書き込み前の値をしばらく返す
  const writes = []; let reads = 0, staleReads = 0, freshOnce = 0;   // freshOnce：書き込み直後の読み返し（確認）は本物を返す
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.route('https://script.google.com/**', async route => {
    const req = route.request();
    const ok = b => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: b });
    if (req.method() === 'POST') {
      let d = {}; try { d = JSON.parse(req.postData() || '{}'); } catch (e) {}
      const items = d.action === 'setMany' && Array.isArray(d.items) ? d.items : [d];
      for (const it of items) {
        let v = null; try { v = JSON.parse(it.value); } catch (e) {}
        if (it.key === STOR + 'honten-lres' && v) {
          if (!staleValue) { staleValue = JSON.parse(JSON.stringify(lres)); staleUntil = Date.now() + STALE_MS; }
          lres = v; writes.push(JSON.parse(JSON.stringify(v))); freshOnce = 1;
        }
      }
      return ok('ok');
    }
    const k = new URL(req.url()).searchParams.get('key') || '';
    if (k === STOR + 'honten-lres') {
      reads++;
      // ★書き込み直後の読み返し（確認）は本物を返す。それ以外の読み（保存後の再取得・ポーリング）はしばらく古い値
      if (freshOnce > 0) { freshOnce--; return ok(JSON.stringify(lres)); }
      if (staleValue && Date.now() < staleUntil) { staleReads++; return ok(JSON.stringify(staleValue)); }
      return ok(JSON.stringify(lres));
    }
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
  t('代車管理に山田様の予約が出る', await seeText(page, '山田　太郎', 15000));

  // 予約のセルをクリック → 固定パネル → ✎ 編集
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('td')].find(e => e.innerText.includes('山田　太郎'));
    if (el) el.click();
  });
  t('固定パネルが開く', await seeText(page, '✎ 編集', 4000));
  await clickText(page, '✎ 編集');
  t('編集モーダルが開く', await seeText(page, '代車予約の編集', 4000));
  await page.fill('.modal-box input:not([type=date])', '鈴木　花子');
  await clickText(page, '✓ 更新', '.modal-box');
  await page.waitForTimeout(1500);
  t('保存直後：画面が新しい名前になる', await seeText(page, '鈴木　花子', 3000));

  // 古いキャッシュが返っている間に、ポーリング（15秒周期＋まとめ読みの刻み5秒）を1回以上またぐ
  await page.waitForTimeout(24000);
  const stillNew = await page.evaluate(() => document.body.innerText.includes('鈴木　花子'));
  const revertedOld = await page.evaluate(() => document.body.innerText.includes('山田　太郎'));
  t('古いサーバー値が返ってきても新しい名前のまま（元に戻らない）', stillNew && !revertedOld, { stillNew, revertedOld, staleReads });
  t('その間に古い値を実際に返している（テストの前提）', staleReads >= 1, { staleReads, reads });

  // キャッシュが切れた後も同じ
  await page.waitForTimeout(8000);
  t('キャッシュが切れた後も新しい名前', await page.evaluate(() => document.body.innerText.includes('鈴木　花子')));

  // サーバーに書かれた中身
  const last = writes[writes.length - 1] || {};
  const rec = Object.values(last[1] || {}).find(r => r && r.id === OLD_ID);
  t('サーバーへ新しい名前が書かれている', !!rec && rec.user === '鈴木　花子', rec);
  t('編集の時刻（savedAt）が打ち直されている', !!rec && Number(rec.savedAt) > OLD_ID && Date.now() - Number(rec.savedAt) < 120000, rec && rec.savedAt);
  t('id・色・期間は変わらない', !!rec && rec.id === OLD_ID && rec.color === '#c2410c' && rec.fd === D && rec.td === D, rec);
  t('書き込みは1回', writes.length === 1, writes.length);
  t('JSエラー・警告ダイアログなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
