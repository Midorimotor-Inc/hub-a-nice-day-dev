// 未反映の車検予約（端末に残った控え）を画面に出して送り直せること／保存中の帯が出ること。
//   2026-09-17：GASが不調の朝に5件入れて3件が届かず、控えはコンソールに警告が出るだけで本人は気づけなかった。
//   実行: node insp_pending_banner_test.js
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8159, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const gone = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => !document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s, root) => page.evaluate(([x, r]) => {
  const scope = r ? document.querySelector(r) : document; if (!scope) return false;
  const b = [...scope.querySelectorAll('button')].find(e => e.innerText.trim() === x || e.innerText.includes(x));
  if (b) { b.click(); return true; } return false;
}, [s, root || null]);

const now = new Date();
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
// 届かなかった3件の控え（三田店2件・本店1件）
const pend = [
  { pid: 'insp-p1', dk: DK, ts: Date.now() - 600000, row: { name: '山田', carType: 'スイフト', course: 3, time: '09:00', staff: '藤原昭人', store: 'sanda', bookingStatus: 'confirmed' } },
  { pid: 'insp-p2', dk: DK, ts: Date.now() - 600000, row: { name: '新井', carType: 'ラパン', course: 3, time: '09:00', staff: '藤原昭人', store: 'sanda', bookingStatus: 'confirmed' } },
  { pid: 'insp-p3', dk: DK, ts: Date.now() - 600000, row: { name: '北前', carType: 'フィット', course: 1, time: '10:00', staff: '岡上秀一', store: 'honten', bookingStatus: 'confirmed' } },
  // すでにサーバーに入っている分（控えだけ残った）→ 画面には出さず、控えを消す
  { pid: 'insp-p4', dk: DK, ts: Date.now() - 600000, row: { name: '前村', course: 2, staff: '江川京志', store: 'honten', bookingStatus: 'confirmed' } },
];

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

  let insp = { [DK]: [{ name: '前村', course: 2, staff: '江川京志', store: 'honten', bookingStatus: 'confirmed', seq: Date.now() - 900000, id: 1 }] };
  const writes = []; let postDelay = 0;
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, JSON.stringify(v)); }, [STOR + 'insp-pending', pend]);
  await ctx.route('https://script.google.com/**', async route => {
    const req = route.request();
    const ok = b => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: b });
    if (req.method() === 'POST') {
      let d = {}; try { d = JSON.parse(req.postData() || '{}'); } catch (e) {}
      const items = d.action === 'setMany' && Array.isArray(d.items) ? d.items : [d];
      if (postDelay) await new Promise(r => setTimeout(r, postDelay));
      for (const it of items) {
        let v = null; try { v = JSON.parse(it.value); } catch (e) {}
        if (it.key === STOR + 'insp' && v) { insp = v; writes.push(JSON.parse(JSON.stringify(v))); }
      }
      return ok('ok');
    }
    const k = new URL(req.url()).searchParams.get('key') || '';
    if (k === STOR + 'insp') return ok(JSON.stringify(insp));
    return ok('null');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0) errs.push(m.text()); });
  page.on('dialog', async d => { await d.accept().catch(() => {}); });

  await page.goto(`http://localhost:${PORT}/index_dev.html`, { waitUntil: 'domcontentloaded' });
  await seeText(page, '担当者を選択してください');
  await clickText(page, '江川京志');
  await clickText(page, 'でログイン');
  t('未反映の控えが画面に出る', await seeText(page, 'サーバーに届いていない車検予約が 3 件', 15000), await page.evaluate(() => document.body.innerText.slice(0, 300)));
  t('控えの中身（名前・店・担当）が読める', await seeText(page, '山田') && await seeText(page, '三田店・藤原昭人') && await seeText(page, '北前'));
  t('すでにサーバーにある分（前村）は控えを消して出さない', await page.evaluate(k => !JSON.parse(localStorage.getItem(k) || '[]').some(p => p.pid === 'insp-p4'), STOR + 'insp-pending'));

  // 1件を送り直す（POSTを遅らせて「保存中」の帯も確かめる）
  postDelay = 2500;
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText === '送り直す'); if (b) b.click(); });
  t('送り直し中は「保存中です」の帯が出る', await seeText(page, '保存中です', 4000));
  t('送り直した予約がサーバーに書かれる', await page.waitForFunction(() => true).then(async () => {
    for (let i = 0; i < 20; i++) { if (writes.some(w => (w[DK] || []).some(r => r && r.name === '山田'))) return true; await page.waitForTimeout(500); }
    return false;
  }), writes.map(w => (w[DK] || []).map(r => r && r.name)));
  t('送り直した控えは一覧から消える', await gone(page, 'サーバーに届いていない車検予約が 3 件', 10000) && await seeText(page, 'サーバーに届いていない車検予約が 2 件', 5000));
  t('保存が終わると帯が消える', await gone(page, '保存中です', 8000));
  const wrote = writes[writes.length - 1][DK] || [];
  t('もとの予約（前村）は消えていない', wrote.some(r => r && r.name === '前村'), wrote.map(r => r && r.name));
  t('三田店の予約として入る', wrote.some(r => r && r.name === '山田' && r.store === 'sanda' && r.staff === '藤原昭人'), wrote.find(r => r && r.name === '山田'));

  // 残りをまとめて送り直す
  postDelay = 0;
  await clickText(page, 'すべて送り直す');
  t('残りもまとめて送り直せる（一覧が消える）', await gone(page, 'サーバーに届いていない車検予約', 20000));
  const fin = (insp[DK] || []).filter(r => r && r.name).map(r => r.name);
  t('最終的に4件がサーバーにある', ['前村', '山田', '新井', '北前'].every(n => fin.includes(n)) && fin.length === 4, fin);
  t('控えが空になる', await page.evaluate(k => JSON.parse(localStorage.getItem(k) || '[]').length === 0, STOR + 'insp-pending'));
  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
