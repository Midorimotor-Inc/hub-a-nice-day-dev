// まとめ読みポーラー（Kyoshi承認のBLOCK-B変更・2026-09-17）の検査
//   ・起動時の読み込みが「キーごとに約20本」ではなく「1〜2本のまとめ読み」になる
//   ・値は従来どおり画面に届く（スケジュール・代車・スタッフ表）
//   ・ポーリングで他PCの変更が反映される（周期ごとに、まとめて）
//   ・まとめ読みがHTMLエラー（GAS不調）を返し続けると赤い帯が出て、戻れば消える
//   ・まとめ読み非対応（'null'）なら従来のキーごと読みに戻る
//   実行: node batch_poll_test.js
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8160, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const gone = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => !document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x)); if (b) { b.click(); return true; } return false; }, s);

const now = new Date();
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

(async () => {
  const src = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8')
    .replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;');
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'index_dev.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(src); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });

  const run = async (label, { batchMode, brokenFromStart }) => {
    const data = {
      [STOR + 'insp']: { [DK]: [{ name: '前村', course: 2, staff: '江川京志', store: 'honten', bookingStatus: 'confirmed', seq: Date.now() - 900000 }] },
      [STOR + 'honten-sched']: { [DK]: { '11:00': { name: '下野', work: 'M6', staff: '岡上秀一', id: 1 } } },
      [STOR + 'honten-lres']: {},
    };
    let single = 0, batch = 0, batchKeys = [], broken = !!brokenFromStart; const singleKeys = [];
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await ctx.route('https://script.google.com/**', async route => {
      const req = route.request();
      const ok = (b, ct) => route.fulfill({ status: 200, contentType: ct || 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: b });
      if (req.method() === 'POST') return ok('ok');
      const u = new URL(req.url());
      const keys = u.searchParams.get('keys');
      if (keys) {
        batch++;
        if (broken) return ok('<!DOCTYPE html><html><body>Error 404</body></html>', 'text/html');
        if (!batchMode) return ok('null');                     // まとめ読み非対応の模擬
        const ks = keys.split(','); batchKeys.push(ks.length);
        const out = {}; ks.forEach(k => { out[k] = (k in data) ? JSON.stringify(data[k]) : 'null'; });
        return ok(JSON.stringify(out));
      }
      const k = u.searchParams.get('key') || '';
      if (k) { single++; singleKeys.push(k.replace(STOR, '') + '@' + Math.round(performance.now() / 1000)); if (broken && !brokenFromStart) return ok('<!DOCTYPE html><html><body>Error 404</body></html>', 'text/html'); return ok((k in data) ? JSON.stringify(data[k]) : 'null'); }
      return ok('null');
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0) errs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/index_dev.html`, { waitUntil: 'domcontentloaded' });
    await seeText(page, '担当者を選択してください', 20000);
    await clickText(page, '江川京志');
    await clickText(page, 'でログイン');
    t(label + '：スケジュールの予約が出る', await seeText(page, '前村', brokenFromStart ? 30000 : 15000));
    t(label + '：タイムスケジュールが出る', await seeText(page, '下野', 8000));
    await page.waitForTimeout(1500);
    const s0 = single, b0 = batch;
    if (brokenFromStart) {
      t(label + '：まとめ読みが失敗しても初回はキーごと読みで予定が出る', single >= 10, { batch, single });
      broken = false;
    } else if (batchMode) {
      t(label + '：起動時の読み込みがまとめ読み（1〜3本）で済む', batch >= 1 && batch <= 3 && single <= 4, { batch, single, batchKeys });
      t(label + '：1本に多数のキーが入っている', Math.max(...batchKeys) >= 10, batchKeys);
    } else {
      t(label + '：非対応ならキーごと読みに戻る', single >= 10, { batch, single });
    }
    // 他PCの変更 → ポーリングで反映（insp は15秒周期）
    data[STOR + 'insp'][DK].push({ name: '瀬川', course: 1, staff: '見取大介', store: 'honten', bookingStatus: 'confirmed', seq: Date.now() - 800000 });
    t(label + '：他PCの予約がポーリングで反映される', await seeText(page, '瀬川', 25000));
    if (batchMode && !brokenFromStart) {
      // 起動直後の1回きりの読み（保管箱・控えの棚卸し等）が落ち着いてから、20秒間のキーごと読みを数える
      const s1 = single, b1 = batch;
      await page.waitForTimeout(20000);
      t(label + '：ポーリング中はキーごとの読みが増えず、まとめ読みだけが動く', single - s1 <= 1 && batch - b1 >= 1, { single: single - s1, batch: batch - b1, singleKeys });
    }
    // GAS不調（HTMLエラーページ）→ 赤い帯 → 復旧で消える
    broken = true;
    t(label + '：読み込みが失敗し続けると「サーバーに接続できません」の帯が出る', await seeText(page, 'サーバーに接続できません', 40000));
    broken = false;
    t(label + '：戻れば帯が消える', await gone(page, 'サーバーに接続できません', 40000));
    t(label + '：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  };

  await run('まとめ読み', { batchMode: true });
  await run('非対応', { batchMode: false });
  await run('最初から失敗', { batchMode: true, brokenFromStart: true });

  await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
