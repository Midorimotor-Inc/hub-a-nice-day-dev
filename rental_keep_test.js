// レンタカー付きの予約カードを開いて保存し直しても、レンタカー予約（貸出期間）が消えないこと
//   2026-09-12 ユーザー報告：長崎様（納車9/12 11:30）のレンタカーDが代車管理から消えた。
//   原因は、予約を開くときに持たせていた中身の無い仮の記録 {id:'restored'} で本物を上書きしていたこと。
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
const PORT = 8149;
const STOR = 'hub-v8-dev-';

let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s, root) => page.evaluate(([x, r]) => {
  const scope = r ? document.querySelector(r) : document;
  if (!scope) return false;
  const b = [...scope.querySelectorAll('button')].find(e => e.innerText.includes(x));
  if (b) { b.click(); return true; } return false;
}, [s, root || null]);

// 今日の予定に置く（画面は今日のスケジュールを開くため）
const now = new Date();
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
const SLOT = '09:30';
const BK = `sched-${DK}-${SLOT}`;
const realRec = { id: 'rr1000', carId: 'r4', user: '長崎　佳菜', fy: 2026, fm: 7, fd: 21, ty: 2026, tm: 8, td: 12, color: '#059669', bookingKey: BK };
const stubRec = { id: 'restored', carId: 'r4', bookingKey: BK };
const schedRow = { name: '長崎　佳菜', staff: '江川京志', carType: 'バンディット', work: 'B', loaner: '', loanerId: null,
  rentalLabel: '🔑 レンタカーD (R004)', rentalCarId: 'r4', shimi: '', content: '', deliveryDate: '2026-9-12', deliveryTime: '11:30',
  bookingStatus: 'new', id: 1789016110562 };

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

  // 1回分：rres の初期値を渡して、予約カードを開いて保存し直し、rres への書き込みを記録する
  const run = async (label, rresInit) => {
    let rres = JSON.parse(JSON.stringify(rresInit));
    const rresWrites = [];
    const sched = { [DK]: { [SLOT]: schedRow } };
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await ctx.route('https://script.google.com/**', async route => {
      const req = route.request();
      const ok = b => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: b });
      if (req.method() === 'POST') {
        let d = {}; try { d = JSON.parse(req.postData() || '{}'); } catch (e) {}
        const items = d.action === 'setMany' && Array.isArray(d.items) ? d.items : [d];
        for (const it of items) {
          let v = null; try { v = JSON.parse(it.value); } catch (e) {}
          if (it.key === STOR + 'rres' && v) { rres = v; rresWrites.push(JSON.parse(JSON.stringify(v))); }
          if (it.key === STOR + 'honten-sched' && v) Object.assign(sched, v);
        }
        return ok('ok');
      }
      const k = new URL(req.url()).searchParams.get('key') || '';
      if (k === STOR + 'rres') return ok(JSON.stringify(rres));
      if (k === STOR + 'honten-sched') return ok(JSON.stringify(sched));
      return ok('null');
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0) errs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/index_dev.html`, { waitUntil: 'domcontentloaded' });
    await seeText(page, '担当者を選択してください');
    await clickText(page, '江川京志');
    await clickText(page, 'でログイン');
    t(label + '：今日のスケジュールに長崎様が出る', await seeText(page, '長崎　佳菜', 10000));
    // 予約カードを開く（行をクリック）
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('div,td,span')].filter(e => e.children.length === 0 && e.innerText.trim() === '長崎　佳菜').pop();
      let n = el; while (n && !n.onclick && !n.getAttribute('onclick') && n !== document.body) n = n.parentElement;
      (el || n).click();
    });
    const opened = await seeText(page, 'レンタカーD', 6000);
    t(label + '：予約カードにレンタカーDが出る', opened);
    const saved = await clickText(page, '予約確定', '.modal-box') || await clickText(page, '予約確定');
    t(label + '：保存ボタンを押せた', saved, await page.evaluate(() => document.body.innerText.replace(/s+/g, ' ').slice(0, 300)));
    await page.waitForTimeout(3500);
    await ctx.close();
    return { rres, rresWrites, errs };
  };

  // ① 本物の予約がある → 保存し直しても本物（期間つき）が残る
  {
    const r = await run('本物あり', { r4: { rr1000: realRec } });
    const recs = Object.values(r.rres.r4 || {});
    const real = recs.find(x => x.id === 'rr1000');
    t('本物あり：保存後もレンタカーDの予約が期間つきで残る', !!real && real.fy === 2026 && real.fd === 21 && real.td === 12, r.rres);
    t('本物あり：中身の無い仮の記録(restored)は書かれない', !recs.some(x => x.id === 'restored'), r.rres);
    t('本物あり：JSエラーなし', r.errs.length === 0, r.errs.slice(0, 2));
  }
  // ② すでに仮の記録しか無い（消えた後）→ これ以上壊さない（rres に書かない）
  {
    const r = await run('仮のみ', { r4: { restored: stubRec } });
    t('仮のみ：rres への書き込みをしない', r.rresWrites.length === 0, r.rresWrites);
    t('仮のみ：JSエラーなし', r.errs.length === 0, r.errs.slice(0, 2));
  }

  await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
