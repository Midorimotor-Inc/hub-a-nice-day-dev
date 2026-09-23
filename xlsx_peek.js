// Excel（顧客ファイル）の中身を見る道具。 node xlsx_peek.js <ファイル.xlsx> [行数]
//   ヘッダー行・各列の見出し・先頭数行の値を出す。取り込みで読めない列があった時の調べ用。
//   SheetJS はアプリと同じ CDN 版をヘッドレスブラウザで読み込む（node に追加インストールしない）。
const path = require('path'), fs = require('fs');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
const FILE = process.argv[2];
const ROWS = Number(process.argv[3] || 6);
if (!FILE || !fs.existsSync(FILE)) { console.error('ファイルがありません:', FILE); process.exit(1); }
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');
  await page.addScriptTag({ url: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js' });
  const b64 = fs.readFileSync(FILE).toString('base64');
  const out = await page.evaluate(([b64, rows]) => {
    const wb = XLSX.read(b64, { type: 'base64', cellDates: true, cellStyles: true });
    const res = [];
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      // ヘッダー行＝「名称」「満期」等を含む最初の行（アプリと同じ探し方）
      const kws = ['名称', 'NO', '車種', '点検', '満期'];
      let hr = 0;
      for (let i = 0; i < Math.min(grid.length, 12); i++) {
        const line = (grid[i] || []).map(x => String(x || '')).join('');
        if (kws.filter(k => line.includes(k)).length >= 2) { hr = i; break; }
      }
      const head = (grid[hr] || []).map((h, i) => ({
        col: String.fromCharCode(65 + i), i, name: h instanceof Date ? h.toLocaleDateString('ja-JP') : String(h || ''),
      }));
      const sample = [];
      for (let r = hr + 1; r < Math.min(grid.length, hr + 1 + rows); r++) {
        sample.push((grid[r] || []).map(v => v instanceof Date ? 'D:' + v.toLocaleDateString('ja-JP') : (typeof v === 'number' ? 'N:' + v : String(v || ''))));
      }
      // 各列の「値が入っている行数」と最初の値
      const stats = head.map(h => {
        let n = 0, first = '';
        for (let r = hr + 1; r < grid.length; r++) {
          const v = (grid[r] || [])[h.i];
          if (v !== undefined && v !== null && String(v).trim() !== '') { n++; if (!first) first = v instanceof Date ? 'D:' + v.toLocaleDateString('ja-JP') : (typeof v === 'number' ? 'N:' + v : String(v)); }
        }
        return { col: h.col, name: h.name, n, first };
      });
      res.push({ sheet: sn, headerRow: hr, rows: grid.length, head, sample, stats });
    }
    return res;
  }, [b64, ROWS]);
  await browser.close();
  for (const s of out) {
    console.log('=== シート「' + s.sheet + '」　ヘッダー行=' + (s.headerRow + 1) + '行目　全' + s.rows + '行');
    console.log('列  見出し                    値のある行数  最初の値');
    s.stats.forEach(x => console.log((x.col + '   ' + (x.name || '(空)')).padEnd(30) + String(x.n).padStart(6) + '  ' + x.first));
    console.log('--- 先頭' + ROWS + '行 ---');
    s.sample.forEach((r, i) => console.log(String(i + 1).padStart(2) + ': ' + r.slice(0, 16).join(' | ')));
  }
})();
