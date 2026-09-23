// customers.html の取り込みロジックで実ファイルを読み、何件どう読めるかだけ確かめる（保存はしない）。
//   node xlsx_import_check.js <ファイル.xlsx> [...]
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
const FILES = process.argv.slice(2).filter(f => fs.existsSync(f));
if (!FILES.length) { console.error('ファイルを指定してください'); process.exit(1); }
const DIR = __dirname, PORT = 8176;
(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, /\.html$/.test(p) ? { 'Content-Type': 'text/html; charset=utf-8' } : {}); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // アプリ本体は動かさず、取り込み関数だけを取り出して使う
  const html = fs.readFileSync(path.join(DIR, 'customers.html'), 'utf8');
  const i = html.indexOf('const fixMD=');
  const j = html.indexOf('// ═══════════════════════════════════════════\n// 統計パネル');
  const src = html.slice(i, j);
  await page.goto('about:blank');
  await page.addScriptTag({ url: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js' });
  await page.evaluate(code => {
    window.__src = code;
    // 取り込み関数が使う小物だけ用意する
    window.safeName = n => String(n).replace(/[^a-zA-Z0-9　-鿿゠-ヿ぀-ゟ]/g, '_').slice(0, 30);
    window.makeCustId = (f, i, name, no) => `${f}__${i}__${String(name).replace(/[\s　]/g, '')}__${no}`;
    window.cellColorToStatus = () => null;
    window.isDateLike = v => v instanceof Date || (typeof v === 'string' && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(v));
    window.COURSES = [{ id: 1, name: 'レギュラー' }, { id: 2, name: 'クイック' }, { id: 3, name: 'ハイブリッド' }];
    window.__parseExcelFile = (0, eval)(code + ';parseExcelFile');   // 取り込み関数だけ取り出す
  }, src);
  for (const f of FILES) {
    const b64 = fs.readFileSync(f).toString('base64');
    const name = path.basename(f);
    const out = await page.evaluate(async ([b64, name]) => {
      const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const file = new File([u8], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      try {
        const r = await window.__parseExcelFile(file);
        const withEntry = r.customers.filter(c => c.entryDate);
        return { ok: true, name: r.name, total: r.customers.length, cols: r.cols,
          entry: withEntry.length, sample: withEntry.slice(0, 5).map(c => `${c.name}：${c.entryDate}${c.store ? '（' + c.store + '）' : ''}`),
          byStatus: r.customers.reduce((a, c) => { a[c.status] = (a[c.status] || 0) + 1; return a; }, {}) };
      } catch (e) { return { ok: false, err: e.message }; }
    }, [b64, name]);
    console.log('=== ' + name);
    if (!out.ok) { console.log('  読めません:', out.err); continue; }
    const c = out.cols || {};
    console.log(`  全${out.total}件　入庫日 ${out.entry}件（列「${c.entryHeader || '(見出しなし)'}」${c.entryCol >= 0 ? ' = ' + String.fromCharCode(65 + c.entryCol) + '列' : ''}）　満期 ${c.expiryCount}件　電話 ${c.phoneCount}件　住所 ${c.addressCount}件`);
    console.log('  状態:', JSON.stringify(out.byStatus));
    out.sample.forEach(x => console.log('   ・' + x));
  }
  await browser.close(); server.close();
})();
