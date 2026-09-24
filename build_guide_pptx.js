// Hub a Nice Day「登録手順」のスライド（PDF も出す）。
//   素材: guide_shots/*.png と index.json（capture_guide_shots.js が作る）
//   実行: node build_guide_pptx.js
//   出力: C:/Users/A/Documents/Hub取扱説明書/Hub_登録手順スライド_2026-09.pptx（と同名の .pdf）
//
//   作り方：画面写真の上に赤枠を描き、右の説明欄と線で結ぶ（説明書と同じ作り）。
const path = require('path'), fs = require('fs');
let pptxgen; try { pptxgen = require('pptxgenjs'); } catch (e) { pptxgen = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'pptxgenjs')); }
let sharp; try { sharp = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'sharp')); } catch (e) { sharp = null; }

const PROTO = process.argv.includes('--proto');
const SHOTS = path.join(__dirname, 'guide_shots');
const META = {}; JSON.parse(fs.readFileSync(path.join(SHOTS, 'index.json'), 'utf8')).forEach(m => { META[m.file] = m; });
const OUTDIR = 'C:\\Users\\A\\Documents\\Hub取扱説明書';
const VERSION = (fs.readFileSync(path.join(__dirname, 'index_dev.html'), 'utf8').match(/const APP_VERSION = '([^']+)'/) || [])[1] || '';

const NAVY = '12233F', BLUE = '1D4ED8', BLUE_L = 'E8EFFC', ORANGE = 'EA580C', ORANGE_L = 'FDEDE2', INK = '1B2735', MUTED = '5B6B7C',
      LINE = 'D8E0EA', PAPER = 'FFFFFF', SOFT = 'F4F7FB', RED = 'E11D48', WHITE = 'FFFFFF', GREEN = '15803D';
const F = 'Meiryo';
const W = 13.333, H = 7.5;

let pres;
function newDeck(title) { pres = new pptxgen(); pres.layout = 'LAYOUT_WIDE'; pres.author = 'Hub a Nice Day'; pres.title = title; }

const dim = {};
async function loadDims() { if (!sharp) return; for (const f of fs.readdirSync(SHOTS).filter(x => x.endsWith('.png'))) { try { const m = await sharp(path.join(SHOTS, f)).metadata(); dim[f] = { w: m.width, h: m.height }; } catch (e) {} } }
const shadow = () => ({ type: 'outer', color: '8A9AAD', blur: 8, offset: 2, angle: 90, opacity: 0.3 });
const T = (s, text, o) => s.addText(text, Object.assign({ fontFace: F, isTextBox: true, margin: 0 }, o));

function pageTitle(s, kicker, title, sub) {
  if (kicker) {
    s.addShape(pres.ShapeType.roundRect, { x: 0.55, y: 0.3, w: 1.55, h: 0.34, rectRadius: 0.17, fill: { color: kicker.color || BLUE }, line: { color: kicker.color || BLUE, width: 0 } });
    T(s, kicker.t, { x: 0.55, y: 0.3, w: 1.55, h: 0.34, fontSize: 11.5, bold: true, color: WHITE, align: 'center', valign: 'middle' });
  }
  T(s, title, { x: kicker ? 2.25 : 0.55, y: 0.24, w: 10.5, h: 0.5, fontSize: 24, bold: true, color: INK });
  if (sub) T(s, sub, { x: 0.55, y: 0.78, w: 12.2, h: 0.36, fontSize: 12.5, color: MUTED });
}
function numCircle(s, n, x, y, d, fill) {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill || RED }, line: { color: WHITE, width: 1.2 }, shadow: shadow() });
  T(s, String(n), { x, y, w: d, h: d, fontSize: d >= 0.34 ? 13 : 11, bold: true, color: WHITE, align: 'center', valign: 'middle' });
}
// (x1,y1)→(x2,y2) の線
function leader(s, x1, y1, x2, y2, color) {
  const dx = x2 - x1, dy = y2 - y1;
  s.addShape(pres.ShapeType.line, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(dx) || 0.001, h: Math.abs(dy) || 0.001, line: { color: color || RED, width: 1.5, dashType: 'solid' }, flipV: (dx * dy) < 0 });
}

// ── 赤枠＋引き出し線つきの画面写真スライド ──
//   items: [{k:'boxキー', t:'見出し', d:'説明'}]  写真は左、説明は右の欄。枠は上から順に番号。
async function annotated(kicker, title, sub, file, items, opt) {
  opt = opt || {};
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, kicker, title, sub);
  const meta = META[file] || { vw: 1500, vh: 950, boxes: {} };
  const d = dim[file] || { w: meta.vw * 2, h: meta.vh * 2 };
  const colW = opt.layout === 'below' ? 0 : (opt.colW == null ? 3.7 : opt.colW);
  const bx = 0.55, by = 1.28, bw = 12.2 - (colW ? colW + 0.35 : 0), bh = opt.layout === 'below' ? (opt.imgH || 3.3) : 5.95;
  // 写真の切り出し（crop: {x,y,w,h} CSS px）に対応
  const crop = opt.crop || { x: 0, y: 0, w: meta.vw, h: meta.vh };
  const r = Math.min(bw / crop.w, bh / crop.h);            // 1 CSS px = r インチ
  const iw = crop.w * r, ih = crop.h * r;
  const ix = (opt.imgX!=null?opt.imgX:bx), iy = by + (opt.top ? 0 : (bh - ih) / 2);
  const scaleX = d.w / meta.vw, scaleY = d.h / meta.vh;    // 写真は 2倍解像度
  // 切り出しは sharp で実ファイルを作る（pptxgenjs の crop 指定は環境で解釈が揺れるため）
  let imgPath = path.join(SHOTS, file);
  if (opt.crop && sharp) {
    const cdir = path.join(SHOTS, 'crops'); fs.mkdirSync(cdir, { recursive: true });
    imgPath = path.join(cdir, file.replace(/.png$/, '') + '-' + [crop.x, crop.y, crop.w, crop.h].join('_') + '.png');
    if (!fs.existsSync(imgPath)) await sharp(path.join(SHOTS, file)).extract({ left: Math.round(crop.x * scaleX), top: Math.round(crop.y * scaleY), width: Math.round(crop.w * scaleX), height: Math.round(crop.h * scaleY) }).toFile(imgPath);
  }
  s.addImage({ path: imgPath, x: ix, y: iy, w: iw, h: ih, shadow: shadow() });
  // 項目は写真の上から順（線が交差しないように）
  const inside = bx0 => bx0 && bx0.x + bx0.w > crop.x && bx0.x < crop.x + crop.w && bx0.y + bx0.h > crop.y && bx0.y < crop.y + crop.h;
  const list = items.map(it => Object.assign({}, it, { box: meta.boxes[it.k] })).filter(it => inside(it.box));
  // 右配置は上から順、下配置は左から順（線が交差しないように）
  if (opt.layout === 'below') list.sort((p, q) => (p.box.x - q.box.x) || (p.box.y - q.box.y)); else list.sort((p, q) => (p.box.y - q.box.y) || (p.box.x - q.box.x));
  const n = list.length;
  const pad = 4;
  // 撮影環境の描画不良（日付入力の表示崩れなど）を隠す：白で塗って文字を載せる
  (opt.mask || []).forEach(m => { const bx0 = meta.boxes[m.k]; if (!inside(bx0)) return; const mx = ix + (bx0.x - crop.x + 2) * r, my = iy + (bx0.y - crop.y + 2) * r, mw = (bx0.w - 4) * r, mh = (bx0.h - 4) * r; s.addShape(pres.ShapeType.rect, { x: mx, y: my, w: mw, h: mh, fill: { color: WHITE }, line: { color: WHITE, width: 0 } }); if (m.text) T(s, m.text, { x: mx + 0.12, y: my, w: mw - 0.2, h: mh, fontSize: Math.max(9, Math.min(14, mh * 40)), color: INK, valign: 'middle' }); });
  const frame = (it) => ({ fx: ix + (it.box.x - crop.x - pad) * r, fy: iy + (it.box.y - crop.y - pad) * r, fw: (it.box.w + pad * 2) * r, fh: (it.box.h + pad * 2) * r });
  const drawFrame = (it, i) => {
    const f = frame(it);
    s.addShape(pres.ShapeType.rect, { x: f.fx, y: f.fy, w: f.fw, h: f.fh, fill: { type: 'none' }, line: { color: RED, width: 2.25 } });
    // 番号は枠の左外（中の文字を隠さない）。左端に寄りすぎる時は枠の上外
    let bxx = f.fx - 0.36 >= 0.15 ? f.fx - 0.36 : f.fx, byy = f.fx - 0.36 >= 0.15 ? f.fy + Math.min(f.fh / 2, 0.22) - 0.15 : f.fy - 0.34;
    if (it.pos === 'below') { bxx = f.fx + f.fw / 2 - 0.15; byy = f.fy + f.fh + 0.04; }   // 左隣に別のボタンがある時は枠の下
    numCircle(s, i + 1, bxx, byy, 0.3);
    return f;
  };
  if (opt.layout === 'below') {
    // 写真を上いっぱいに、説明はその下に2〜3列
    const cols = n <= 6 ? Math.max(n, 1) : Math.ceil(n / 2), rows = Math.ceil(n / cols);   // 1行に並べて線の交差を避ける
    const gy = iy + ih + 0.4, cw = (12.2 - (cols - 1) * 0.2) / cols, rh = Math.min(1.6, (H - 0.35 - gy) / rows);
    list.forEach((it, i) => {
      const f = drawFrame(it, i);
      const cx = 0.55 + (i % cols) * (cw + 0.25), cy = gy + Math.floor(i / cols) * rh;
      s.addShape(pres.ShapeType.roundRect, { x: cx, y: cy, w: cw, h: rh - 0.12, rectRadius: 0.05, fill: { color: SOFT }, line: { color: LINE, width: 0.75 } });
      numCircle(s, i + 1, cx + 0.1, cy + 0.1, 0.32);
      T(s, it.t, { x: cx + 0.5, y: cy + 0.08, w: cw - 0.6, h: 0.3, fontSize: cols >= 5 ? 11 : 12.5, bold: true, color: INK });
      if (it.d) T(s, it.d, { x: cx + 0.15, y: cy + 0.42, w: cw - 0.3, h: rh - 0.55, fontSize: 9.5, color: MUTED, valign: 'top' });
      // 枠の下辺の中央 → カードの上辺（番号の位置）
      leader(s, f.fx + Math.min(f.fw / 2, 1.0), f.fy + f.fh, cx + 0.26, cy);
    });
  } else {
    const cx = ix + iw + 0.35, cW = Math.min(opt.cW||99, Math.max(2.8, 12.75 - cx));
    const rowH = Math.min(1.55, bh / Math.max(n, 1));
    const cTop = by + Math.max(0, (bh - rowH * n) / 2);   // 説明欄は縦の真ん中に揃える
    list.forEach((it, i) => {
      const f = drawFrame(it, i);
      const cy = cTop + i * rowH;
      s.addShape(pres.ShapeType.roundRect, { x: cx, y: cy + 0.04, w: cW, h: rowH - 0.1, rectRadius: 0.05, fill: { color: SOFT }, line: { color: LINE, width: 0.75 } });
      numCircle(s, i + 1, cx + 0.1, cy + 0.12, 0.32);
      T(s, it.t, { x: cx + 0.5, y: cy + 0.1, w: cW - 0.6, h: 0.3, fontSize: 12.5, bold: true, color: INK });
      if (it.d) T(s, it.d, { x: cx + 0.5, y: cy + 0.4, w: cW - 0.6, h: rowH - 0.5, fontSize: 10, color: MUTED, valign: 'top' });
      // 枠の右辺 → カードの左辺（番号の高さ）
      leader(s, f.fx + f.fw, f.fy + Math.min(f.fh / 2, 0.25), cx, cy + 0.28);
    });
  }
  if (opt.note) s.addNotes(opt.note);
  return s;
}

function slideTitle() {
  const s = pres.addSlide(); s.background = { color: NAVY };
  T(s, 'Hub a Nice Day', { x: 0.9, y: 2.1, w: 11.5, h: 0.9, fontSize: 46, bold: true, color: WHITE });
  T(s, '取扱説明書', { x: 0.9, y: 3.0, w: 11.5, h: 0.8, fontSize: 34, bold: true, color: '9FC2FF' });
  T(s, '車検予約管理システム　／　基本操作 と 便利操作', { x: 0.9, y: 4.0, w: 11.5, h: 0.4, fontSize: 15, color: 'C6D4E8' });
  s.addShape(pres.ShapeType.roundRect, { x: 0.9, y: 4.9, w: 3.05, h: 0.46, rectRadius: 0.2, fill: { color: '1E3A66' }, line: { color: '2F5590', width: 1 } });
  T(s, '本店・三田店 共通', { x: 0.9, y: 4.9, w: 3.05, h: 0.46, fontSize: 12, color: 'C6D4E8', align: 'center', valign: 'middle' });
  T(s, '緑モータース　2026年9月版（v' + VERSION + '）' + (PROTO ? '　※試作' : ''), { x: 0.9, y: 6.5, w: 11.5, h: 0.35, fontSize: 11, color: '7E92AE' });
  s.addNotes('実際の画面を撮影して作っています。お客様のお名前・電話・住所は架空のものに置き換えてあります。');
}
function slideSection(no, title, lead, items, color) {
  const s = pres.addSlide(); s.background = { color: NAVY };
  T(s, '第 ' + no + ' 部', { x: 0.9, y: 1.4, w: 11.5, h: 0.4, fontSize: 14, bold: true, color: 'F2A97C', charSpacing: 2 });
  T(s, title, { x: 0.9, y: 1.85, w: 11.5, h: 0.85, fontSize: 38, bold: true, color: WHITE });
  if (lead) T(s, lead, { x: 0.9, y: 2.75, w: 10.5, h: 0.5, fontSize: 14, color: 'C6D4E8' });
  (items || []).forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.9 + col * 5.9, y = 3.5 + row * 0.62;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 5.6, h: 0.5, rectRadius: 0.08, fill: { color: '1E3A66' }, line: { color: '2F5590', width: 1 } });
    T(s, it, { x: x + 0.2, y, w: 5.3, h: 0.5, fontSize: 13, color: WHITE, valign: 'middle' });
  });
}
function slideToc() {
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, null, 'この説明書の構成', '「基本操作」は毎日使う手順、「便利操作」は知っていると助かる機能です');
  const cols = [
    { t: '第1部　基本操作', c: BLUE, bg: BLUE_L, items: ['画面の見方（バージョン・接続状態・店舗）', 'カレンダーから予約する', '顧客リストから予約する', 'タイムスケジュールに直接予約する', '代車・レンタカーの付け方'] },
    { t: '第2部　便利操作', c: ORANGE, bg: ORANGE_L, items: ['カレンダー：スタッフ休日設定・My予定・車検台数制限', 'スケジュール：代車の限定・入庫済み☑・検索・事前入庫／納車日・入庫制限・印刷', '代車管理：最適化・タイヤ設定・レンタカーの所在地', '車両管理：代車・社用車の点検アラート', '顧客リスト：検索・同期チェック・絞り込みボタン'] },
  ];
  cols.forEach((c, i) => {
    const x = 0.55 + i * 6.2;
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.45, w: 6.0, h: 5.4, rectRadius: 0.1, fill: { color: c.bg }, line: { color: c.c, width: 1.5 } });
    T(s, c.t, { x: x + 0.3, y: 1.65, w: 5.4, h: 0.5, fontSize: 20, bold: true, color: c.c });
    c.items.forEach((it, j) => {
      numCircle(s, j + 1, x + 0.3, 2.35 + j * 0.8, 0.34, c.c);
      T(s, it, { x: x + 0.8, y: 2.3 + j * 0.8, w: 4.9, h: 0.5, fontSize: 12.5, color: INK, valign: 'middle' });
    });
  });
}

// ── テキストだけのスライド（手順や注意）──
function slideText(kicker, title, sub, blocks, opt) {
  opt = opt || {};
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, kicker, title, sub);
  const n = blocks.length, cols = opt.cols || (n <= 2 ? n : (n <= 4 ? 2 : 3)), rows = Math.ceil(n / cols);
  const cw = (12.2 - (cols - 1) * 0.3) / cols, rh = Math.min(opt.rh || 2.6, (H - 1.7 - 0.4) / rows);
  blocks.forEach((b, i) => {
    const tot = rows * rh + (rows - 1) * 0.15, y0 = 1.45 + Math.max(0, (H - 0.4 - 1.45 - tot) / 2);   // 縦の真ん中に置く
    const x = 0.55 + (i % cols) * (cw + 0.3), y = y0 + Math.floor(i / cols) * (rh + 0.15);
    s.addShape(pres.ShapeType.roundRect, { x, y, w: cw, h: rh, rectRadius: 0.08, fill: { color: b.tone === 'warn' ? ORANGE_L : b.tone === 'ok' ? 'E6F3EA' : SOFT }, line: { color: b.tone === 'warn' ? ORANGE : b.tone === 'ok' ? GREEN : LINE, width: 1 } });
    if (b.n != null) numCircle(s, b.n, x + 0.18, y + 0.2, 0.36, b.tone === 'warn' ? ORANGE : BLUE);
    T(s, b.t, { x: x + (b.n != null ? 0.66 : 0.25), y: y + 0.18, w: cw - (b.n != null ? 0.9 : 0.5), h: 0.4, fontSize: 15, bold: true, color: INK });
    T(s, b.d, { x: x + 0.25, y: y + 0.68, w: cw - 0.5, h: rh - 0.85, fontSize: 11.5, color: INK, valign: 'top', paraSpaceAfter: 4 });
  });
  if (opt.note) s.addNotes(opt.note);
}
function slideCover(title, sub, lead, badge) {
  const s = pres.addSlide(); s.background = { color: NAVY };
  T(s, 'Hub a Nice Day', { x: 0.9, y: 2.0, w: 11.5, h: 0.9, fontSize: 44, bold: true, color: WHITE });
  T(s, title, { x: 0.9, y: 2.9, w: 11.5, h: 0.8, fontSize: 34, bold: true, color: '9FC2FF' });
  T(s, sub, { x: 0.9, y: 3.9, w: 11.5, h: 0.4, fontSize: 15, color: 'C6D4E8' });
  if (badge) { s.addShape(pres.ShapeType.roundRect, { x: 0.9, y: 4.8, w: 3.6, h: 0.46, rectRadius: 0.2, fill: { color: '7C2D12' }, line: { color: 'B45309', width: 1 } }); T(s, badge, { x: 0.9, y: 4.8, w: 3.6, h: 0.46, fontSize: 12, bold: true, color: 'FDE68A', align: 'center', valign: 'middle' }); }
  T(s, lead || '', { x: 0.9, y: 5.4, w: 11.5, h: 0.4, fontSize: 12, color: 'C6D4E8' });
  T(s, '緑モータース　2026年9月版（v' + VERSION + '）', { x: 0.9, y: 6.5, w: 11.5, h: 0.35, fontSize: 11, color: '7E92AE' });
}
async function exportPdf(pptx) {
  const { execFileSync } = require('child_process');
  const pdf = pptx.replace(/\.pptx$/, '.pdf');
  const ps = '$pp = New-Object -ComObject PowerPoint.Application; $p = $pp.Presentations.Open("' + pptx + '", $true, $false, $false); $p.SaveAs("' + pdf + '", 32); $p.Close(); $pp.Quit();';
  try { execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore', timeout: 120000 }); console.log('PDF: ' + pdf); } catch (e) { console.log('PDF 変換は PowerPoint が必要です（スキップ）'); }
}


// 写真の一部を切り出してファイルにする（thumbnail 用）
async function cropFile(file, crop) {
  if (!sharp) return path.join(SHOTS, file);
  const meta = META[file], d = dim[file] || { w: meta.vw * 2, h: meta.vh * 2 };
  const sx = d.w / meta.vw, sy = d.h / meta.vh;
  const cdir = path.join(SHOTS, 'crops'); fs.mkdirSync(cdir, { recursive: true });
  const out = path.join(cdir, file.replace(/\.png$/, '') + '-' + [crop.x, crop.y, crop.w, crop.h].join('_') + '.png');
  if (!fs.existsSync(out)) await sharp(path.join(SHOTS, file)).extract({ left: Math.round(crop.x * sx), top: Math.round(crop.y * sy), width: Math.round(crop.w * sx), height: Math.round(crop.h * sy) }).toFile(out);
  return out;
}
// ── 流れのスライド：小さい画面写真を4つ並べる ──
async function slideFlow(title, sub, steps) {
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, null, title, sub);
  const n = steps.length, gap = 0.3, cw = (12.2 - (n - 1) * gap) / n;
  for (let i = 0; i < n; i++) {
    const st = steps[i], x = 0.55 + i * (cw + gap);
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.45, w: cw, h: 4.5, rectRadius: 0.08, fill: { color: SOFT }, line: { color: LINE, width: 1 } });
    numCircle(s, i + 1, x + 0.18, 1.62, 0.36, BLUE);
    T(s, st.t, { x: x + 0.66, y: 1.6, w: cw - 0.8, h: 0.4, fontSize: 14, bold: true, color: INK });
    // 写真は枠の中に収める（縦横比はそのまま）
    const boxW = cw - 0.5, boxH = 2.45;
    const meta = META[st.f], cr = st.crop || { x: 0, y: 0, w: meta.vw, h: meta.vh };
    const r = Math.min(boxW / cr.w, boxH / cr.h), iw = cr.w * r, ih = cr.h * r;
    s.addImage({ path: await cropFile(st.f, cr), x: x + (cw - iw) / 2, y: 2.1 + (boxH - ih) / 2, w: iw, h: ih, shadow: shadow() });
    T(s, st.d, { x: x + 0.25, y: 4.7, w: cw - 0.5, h: 1.1, fontSize: 11.5, color: INK, valign: 'top' });
  }
  return s;
}

(async () => {
  await loadDims();
  fs.mkdirSync(OUTDIR, { recursive: true });
  const PC = { t: 'パソコン', color: BLUE }, SP = { t: 'スマホ', color: '0F766E' }, AD = { t: '管理者', color: '7C3AED' };

  newDeck('Hub a Nice Day 登録手順');
  slideCover('登録手順', '招待メールが届いた方へ', 'パソコンとスマホに1回ずつ登録します。あとは開くだけで使えます', '本店・三田店 共通');

  await slideFlow('登録の流れ（全体像）', '招待メールが届いたら、この4つだけ。登録は端末ごとに1回で、5分もかかりません', [
    { t: 'アドレスと6桁', f: 'p1-register.png', crop: { x: 430, y: 235, w: 420, h: 220 }, d: '招待メールのリンクを開き、自分のメールアドレスと、メールに書かれた招待コード（6桁）を入れて「登録する」。' },
    { t: '端末の種類を選ぶ', f: 'p2-kind.png', crop: { x: 440, y: 225, w: 400, h: 165 }, d: '店の共有PCなら「みんなで使う」、自分だけのPC・スマホなら「自分専用」。最初の1人が選ぶだけです。' },
    { t: 'スマホは QR で', f: 'p4-qr.png', crop: { x: 528, y: 376, w: 224, h: 224 }, d: 'パソコンの画面に出る QR を、スマホのカメラで読むだけ。アドレスも6桁も打たずに登録できます。' },
    { t: 'ホーム画面に追加', f: 'm2-done.png', crop: { x: 0, y: 150, w: 390, h: 560 }, d: 'スマホのホーム画面にアイコンを置けば、次からはタップ1つ。ここまでで登録は終わりです。' },
  ]);

  slideSection(1, 'パソコンに登録する', '店のPC・自分のPC。登録はその端末で1回だけです', ['招待メールを開く', 'アドレスと6桁を入れる', '端末の種類を選ぶ', '登録できた']);

  await annotated(PC, '① 登録画面を開く', '招待メールのリンクを開くと、この画面が出ます', 'p1-register.png', [
    { k: 'email', t: 'メールアドレス', d: '管理者に登録してもらった自分のアドレスを入れます' },
    { k: 'code', t: '招待コード（6桁）', d: 'メールに書かれた数字。パソコンとスマホの両方で同じコードが使えます' },
    { k: 'go', t: '登録する', d: '押すと本人確認が済み、この端末は登録済みになります' },
    { k: 'link', t: 'コードが無い時', d: 'ログイン用のリンクをメールで受け取る方法もあります（1日の送信数に上限あり）' },
  ], { crop: { x: 410, y: 85, w: 460, h: 480 } });

  await annotated(PC, '② 端末の種類を選ぶ', '最初に登録する人が1回だけ選びます（あとから変えられます）', 'p2-kind.png', [
    { k: 'shared', t: 'みんなで使う（共有）', d: '店のPC・工場のタブレット。使う前に名前を選ぶ方式になります。迷ったらこちら' },
    { k: 'own', t: '自分専用', d: '自分だけが使うPC・自分のスマホ。開くだけで自分として使えます' },
  ], { crop: { x: 410, y: 18, w: 460, h: 560 } });

  await annotated(PC, '③ 登録できました', 'ここまでで、このパソコンは登録完了です', 'p3-done.png', [
    { k: 'done', t: '登録の完了', d: '次からは、この端末を開くだけで使えます。使っているうちは登録が切れることはありません' },
    { k: 'yes', t: 'はい（QR を表示）', d: '続けてスマホを登録する時はこちら。次のページへ' },
    { k: 'later', pos: 'below', t: 'あとで', d: 'スマホはあとで登録できます（ログイン画面の「📱 スマホを登録（QR）」から）' },
  ], { crop: { x: 415, y: 18, w: 450, h: 600 } });

  slideSection(2, 'スマホに登録する', 'パソコンの QR を読むだけ。コードの入力は要りません', ['QR を表示する', 'スマホのカメラで読む', '自分専用を選ぶ', 'ホーム画面に追加']);

  await annotated(PC, '④ スマホ用の QR を出す', 'パソコンの画面に出た QR を、スマホのカメラで読みます', 'p4-qr.png', [
    { k: 'qr', t: 'QR コード', d: 'スマホのカメラを向けて、出てきたリンクを開きます（30分で無効になり、自動で作り直します）' },
    { k: 'steps', t: 'スマホでの手順', d: '画面にも同じ手順が出ています。迷ったらここを読んでください。終わったら下の「はじめる →」を押します' },
  ], { crop: { x: 415, y: 150, w: 450, h: 700 }, imgX: 2.4, cW: 5.6 });

  await annotated(SP, '⑤ スマホで開いたところ', 'アドレスと6桁が入った状態で開きます', 'm1-register.png', [
    { k: 'email', t: 'アドレスは入力済み', d: 'QR から開いたので、自分で打つ必要はありません' },
    { k: 'code', t: '6桁も入力済み', d: '同じく自動で入ります' },
    { k: 'go', t: '登録する', d: '押すだけ。次に「自分専用」を選べば完了です' },
  ], { imgX: 2.0, cW: 6.6 });

  await annotated(SP, '⑥ ホーム画面に追加する', 'ここまでで登録は完了。あとはアイコンを置くだけです', 'm2-done.png', [
    { k: 'done', t: '登録の完了', d: 'この端末に登録しました（自分専用）と出れば完了です' },
    { k: 'home', t: 'ホーム画面に追加', d: 'iPhone：共有ボタン（□↑）→「ホーム画面に追加」／Android：メニュー（⋮）→「ホーム画面に追加」' },
    { k: 'start', t: 'はじめる', d: '押すとそのまま使えます。次からはホーム画面のアイコンから開くだけ' },
  ], { imgX: 2.0, cW: 6.6 });

  slideText(SP, 'スマホで気をつけること', '2つだけ覚えてください', [
    { n: 1, t: 'LINE やメールの中で開いた時は「Safariで開く」', d: 'LINE の中のブラウザのまま登録すると、あとでホーム画面のアイコンから開いた時にもう一度コードを聞かれます。メニューから「Safariで開く」（Androidは「ブラウザで開く」）を選んでから登録してください。', tone: 'warn' },
    { n: 2, t: 'QR が使えない時は、アドレス＋6桁でも登録できます', d: 'スマホで招待メールのリンクを開き、メールアドレスと招待コード（6桁）を入れれば同じように登録できます。' },
  ], { rh: 2.5 });

  slideSection(3, '管理者の方へ', '招待の送り方と、メールが届かない時の渡し方', ['招待を送る', '招待 QR', 'メールが届かない時']);

  await annotated(AD, '招待を送る', '管理者コンソール（スケジュール画面 → 管理者のみ）', 'a1-console.png', [
    { k: 'bulk', t: '未登録の人にまとめて招待', d: 'まだ登録していない人ぜんぶに、いっぺんに招待メールを出します' },
    { k: 'invite', t: '招待を送る', d: 'その人のアドレスに6桁のコードをメールします。押すたびに新しいコードになります（前のコードは使えなくなります）' },
  ], { crop: { x: 110, y: 380, w: 1060, h: 330 }, colW: 4.4 });

  await annotated(AD, '招待 QR（メールが届かない時）', '「招待を送る」を押すと、その場で QR が出ます', 'a2-inviteqr.png', [
    { k: 'qr', t: '招待 QR', d: '本人のスマホのカメラで読むだけ。アドレスと6桁が入った状態で登録画面が開きます' },
    { k: 'code', t: '招待コード（6桁）', d: 'パソコンで登録する人には、この数字を伝えてください' },
    { k: 'copy', t: 'URL をコピー', d: 'LINE などで本人に送れます。コードが入っているので個人あてにだけ送ってください' },
  ], { crop: { x: 435, y: 95, w: 405, h: 660 } });

  slideText(null, '困った時', 'よくある3つ', [
    { n: 1, t: '「アドレスかコードが違います」と出る', d: 'アドレスの打ち間違いか、管理者がコードを再発行しています。最新の招待メール（または管理者に聞いた6桁）を使ってください。' },
    { n: 2, t: 'ホーム画面のアイコンから開いたら、またコードを聞かれた', d: 'Safari とホーム画面のアイコンは別の場所として扱われます。いったん Safari で開いてから「ホーム画面に追加」をやり直してください。', tone: 'warn' },
    { n: 3, t: '3か月以上開かなかった端末の登録が消えた', d: '決まりです（最後に使った日から90日）。もう一度、同じ手順で登録してください。' },
  ], { cols: 3, rh: 2.5 });

  slideText(null, 'これだけ覚えてください', '', [
    { n: 1, t: '登録は端末ごとに1回だけ', d: 'パソコン・スマホ、それぞれ1回。あとは開くだけです。' },
    { n: 2, t: 'コードに期限はありません', d: '次に招待し直すまで同じコードが使えます。2台目も同じコードでOK。' },
    { n: 3, t: '困ったら管理者へ', d: '画面右上のバージョン（v2.94 など）と、困っている画面を伝えてください。' },
  ], { cols: 3, rh: 2.3 });

  const out = path.join(OUTDIR, 'Hub_登録手順スライド_2026-09.pptx');
  await pres.writeFile({ fileName: out });
  console.log('出力: ' + out);
  await exportPdf(out);
})();
