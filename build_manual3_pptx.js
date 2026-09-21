// Hub a Nice Day スマホ版説明書・管理者マニュアル（2026-09 改訂版）を生成する（2冊・PDF も出す）。
//   素材: manual3_shots/*.png と index.json（capture_manual3_shots.js が作る）
//   実行: node build_manual3_pptx.js
//   出力: C:\Users\A\Documents\Hub取扱説明書\Hub_取扱説明書_2026-09.pptx（試作は _試作.pptx）
//
//   作り方：画面写真の上に赤枠を描き、右の説明欄と線で結ぶ（ユーザー指示・2026-09-21）。
//   座標は撮影時に記録した要素の位置（CSS px）を、写真の縮尺に合わせて換算する。
const path = require('path'), fs = require('fs');
let pptxgen; try { pptxgen = require('pptxgenjs'); } catch (e) { pptxgen = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'pptxgenjs')); }
let sharp; try { sharp = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'sharp')); } catch (e) { sharp = null; }

const PROTO = process.argv.includes('--proto');
const SHOTS = path.join(__dirname, 'manual3_shots');
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
  const ix = bx, iy = by + (opt.top ? 0 : (bh - ih) / 2);
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
    const bxx = f.fx - 0.36 >= 0.15 ? f.fx - 0.36 : f.fx, byy = f.fx - 0.36 >= 0.15 ? f.fy + Math.min(f.fh / 2, 0.22) - 0.15 : f.fy - 0.34;
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
    const cx = ix + iw + 0.35, cW = Math.max(2.8, 12.75 - cx), cTop = by;
    const rowH = Math.min(1.15, bh / Math.max(n, 1));
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
  const n = blocks.length, cols = n <= 2 ? n : (n <= 4 ? 2 : 3), rows = Math.ceil(n / cols);
  const cw = (12.2 - (cols - 1) * 0.3) / cols, rh = Math.min(2.6, (H - 1.7 - 0.4) / rows);
  blocks.forEach((b, i) => {
    const x = 0.55 + (i % cols) * (cw + 0.3), y = 1.45 + Math.floor(i / cols) * (rh + 0.15);
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

(async () => {
  await loadDims();
  fs.mkdirSync(OUTDIR, { recursive: true });
  const M = { t: 'スマホ', color: BLUE }, MC = { t: 'スマホ・便利', color: ORANGE }, A = { t: '管理者', color: '7C3AED' }, AP = { t: '管理者・PC', color: '0F766E' };

  // ═══════════════════ スマホ版 ═══════════════════
  newDeck('Hub a Nice Day スマホ版説明書');
  slideCover('スマホ版 説明書', '自分のスマホで予約を見る・入れる', 'iPhone／Android 共通。ブラウザ（Safari／Chrome）で開きます', '本店・三田店 共通');
  slideText(M, 'はじめに：登録の流れ', '登録は端末ごとに1回だけ。以後は開くだけで使えます', [
    { n: 1, t: '管理者から招待コードをもらう', d: '管理者がコンソールから「招待を送る」と、あなたのメールアドレスに「招待コード（6桁）」が届きます。届かない時は管理者に直接聞いてください（画面に同じコードが出ています）。' },
    { n: 2, t: 'スマホでアプリを開く', d: 'メールのリンク、またはブックマークから開きます。LINE の中で開いた時は「Safari で開く」（Android は「ブラウザで開く」）を選んでから。' },
    { n: 3, t: 'アドレスとコードを入れて「登録する」', d: '次ページの画面です。登録が済むとホーム画面に追加できる案内が出ます。追加しておくと、次からアイコンをタップするだけで開けます。' },
    { n: 4, t: 'ログインは名前を選ぶだけ', d: '自分専用のスマホなら、開くとそのまま使えます。共有の端末（店のタブレット）では名前を選びます。', tone: 'ok' },
  ]);
  await annotated(M, '登録画面（初回だけ）', 'メールアドレスと6桁の招待コードを入れます', 'm1-register.png', [
    { k: 'email', t: 'メールアドレス', d: '管理者に登録してもらった自分のアドレス' },
    { k: 'code', t: '招待コード（6桁）', d: '招待メールに書かれた数字。同じコードでスマホと店のPCの両方に登録できます' },
    { k: 'go', t: '登録する', d: '押すと本人確認が済み、この端末は登録済みになります' },
    { k: 'link', t: 'コードがない時', d: 'ログイン用のリンクをメールで受け取る方法もあります（1日の送信数に上限あり）' },
  ], { colW: 5.2 });
  await annotated(M, '名前を選んでログイン（共有端末）', '店のタブレットなど、複数の人が使う端末では「誰が操作するか」を選びます', 'm2-login.png', [
    { k: 'names', t: '自分の名前', d: 'この端末に登録済みの人が並びます。タップでログイン' },
    { k: 'add', t: 'スタッフを追加', d: 'この端末を初めて使う人はここから登録（アドレス＋コード）' },
  ], { colW: 5.2 });
  await annotated(M, '画面の見方（カレンダー）', '上の帯と4つのタブ。カレンダーは日ごとの車検台数', 'm3-calendar.png', [
    { k: 'version', t: 'バージョン', d: 'PC 版と同じ番号。●が緑なら接続OK' },
    { k: 'user', t: 'ログイン中の人（店）' },
    { k: 'reload', t: '🔄 読み直し', d: '表示が古いと思った時に' },
    { k: 'mail', t: '✉ 通知メール', d: '保存に失敗した時の通知先（最後のページ）' },
    { k: 'logout', t: '↩ ログアウト', d: '共有端末で人が交代する時' },
    { k: 'tabs', t: 'タブ', d: 'カレンダー／スケジュール／代車／休日' },
    { k: 'dayCell', t: '日をタップ', d: 'その日の予約とマイスケジュールが出ます。左右スワイプで月移動' },
  ], { colW: 5.0 });
  await annotated(M, '日の詳細', '車検・整備の予約と、自分の予定（マイスケジュール）', 'm4-day.png', [
    { k: 'goSched', t: '予約・編集', d: 'その日のスケジュール画面へ（予約を入れる・直す）' },
    { k: 'insp', t: '車検の予約', d: 'お客様名・車種・コース・担当。他店の分は薄く表示' },
    { k: 'my', t: 'マイスケジュール', d: '自分の予定を追加。公開（全員に見える）と 🔒シークレット（自分だけ）。詳しくは PC 版の説明書と同じです' },
    { k: 'close', t: '閉じる' },
  ], { colW: 5.0 });
  await annotated(M, 'スケジュール（予約を入れる）', '上が車検、下が整備。空いている枠をタップすると予約カードが開きます', 'm5-schedule.png', [
    { k: 'dateNav', t: '日付', d: '‹ › で前後の日。左右スワイプでも動きます' },
    { k: 'inspAdd', t: '＋ 追加（車検）', d: '車検の予約カードを開く。1日6台まで。休業日・台数制限の日は押せません' },
    { k: 'schedAdd', t: 'タップで追加（整備）', d: '時間の行をタップ → 整備の予約カード' },
    { k: 'schedRow', t: '予約の行', d: 'タップで内容を直す。「同時刻に追加」で同じ時間に2件目' },
  ], { colW: 5.0 });
  await annotated(M, '車検の予約カード', '＊は必須。入れたら下の「保存」', 'm6-edit.png', [
    { k: 'name', t: '氏名 ＊' },
    { k: 'staff', t: '担当', d: '空欄なら自分' },
    { k: 'car', t: '車種 ＊' },
    { k: 'course', t: 'コース ＊', d: 'マッハ／クイック／レギュラー' },
    { k: 'time', t: '入庫時間 ＊' },
    { k: 'tokuten', t: '特典' },
    { k: 'close', t: '閉じる（保存しない）' },
  ], { colW: 5.0 });
  await annotated(M, '車検の予約カード（下）', '代車・事前入庫・納車日・備考。最後に「保存」', 'm6b-edit-bottom.png', [
    { k: 'loaner', t: '代車・レンタカー', d: '空いている車を選び、貸出日〜返却日を決めます' },
    { k: 'entry', t: '入庫日（事前入庫）', d: '前日に預かる時は日付を変える' },
    { k: 'delivery', t: '納車日' },
    { k: 'note', t: '備考' },
    { k: 'save', t: '保存', d: '受け付けた瞬間に画面に出ます。サーバー反映の確認が終わると ✅ の帯。失敗した時は赤い帯と通知メール' },
  ], { colW: 5.0 });
  await annotated(M, '整備の予約カード', '作業内容を選び、内容をひとこと', 'm6c-sched-edit.png', [
    { k: 'name', t: '氏名 ＊' },
    { k: 'car', t: '車種 ＊' },
    { k: 'work', t: '作業内容 ＊', d: 'Q クイック／12ヶ月／M12・M6／N1・N6／鈑金／商談／保険／試乗／納車／他' },
    { k: 'shimi', t: '指示書・見積' },
    { k: 'content', t: '内容' },
    { k: 'del', t: '🗑 削除', d: '予約を消します（確認が出ます）' },
    { k: 'save', t: '保存' },
  ], { colW: 5.0 });
  await annotated(M, '代車タブ', '代車・レンタカーの貸出状況を横に見ます', 'm7-loaner.png', [
    { k: 'monthNav', t: '期間', d: '‹ › で前後へ。「今日」で戻る' },
    { k: 'rental', t: 'レンタカー（両店共通）', d: '上が本店の代車、下がレンタカー。色の帯が貸出中（お客様名）' },
  ], { colW: 5.0 });
  await annotated(MC, '休日タブ：自分の休日を入れる', '各日に「出N」＝出勤人数。日をタップして休日／有給', 'm8-holiday.png', [
    { k: 'stores', t: '店舗', d: '自分の店で入力。もう一方の店は閲覧のみ' },
    { k: 'summary', t: '今月の自分の休日数と会社の休日数' },
    { k: 'carry', t: '今月の枠と残り', d: '会社の日数＋前月からの繰越。残りは翌月へ繰り越し' },
    { k: 'who', t: '設定する人（管理者だけ）', d: '管理者は他の人の休日も入れられます' },
    { k: 'cell', t: '日をタップ', d: 'オレンジ＝自分の休日、緑＝有給、グレー＝店休日' },
  ], { colW: 5.0 });
  await annotated(MC, '休日タブ：タップした日の詳細', '休みの人・出勤する人と、自分の休日・有給・メモ', 'm8b-holiday-detail.png', [
    { k: 'detail', t: 'その日の休み・出勤', d: '休日／有給の人と出勤する人。「出勤 N人 / M人」' },
    { k: 'off', t: '🏖 休日', d: 'タップで自分を休日に。もう一度で解除。押した瞬間に保存され PC にも出ます' },
    { k: 'leave', t: '📋 有給', d: '休日と有給は同じ日に両方は入りません' },
    { k: 'memo', t: '📝 メモ', d: '休みの日に「午後休」「前月分」などのメモ。休みを外すとメモも消えます' },
  ], { colW: 5.0 });
  await annotated(M, '通知メールの設定', '保存に失敗した時に知らせるアドレス（個人のアドレスで構いません）', 'm9-mail.png', [
    { k: 'input', t: '通知を受け取るアドレス' },
    { k: 'save', t: '保存' },
    { k: 'unreg', t: '登録解除' },
  ], { colW: 5.0 });
  slideText(M, '困った時', 'よくある3つ', [
    { n: 1, t: '保存の赤い帯が出た', d: '「〜が保存できていません」の帯が出たら、該当の日を開いて内容を確かめ、もう一度入力してください。通知メールを設定していればメールも届きます。アプリを閉じてしまった予約も、次に開いた時に確認されます。', tone: 'warn' },
    { n: 2, t: '「この端末では登録されていません」', d: 'その端末でまだ本人確認をしていません。名前の下の「スタッフを追加」から、アドレス＋招待コードで登録してください。コードが期限切れなら管理者に再発行を頼みます。' },
    { n: 3, t: '古い画面のまま', d: '上の🔄で読み直し。それでも直らない時は一度閉じて開き直してください。バージョン（v' + VERSION + ' など）が PC と違う時は更新の帯が出るので押します。' },
  ]);
  { const out = path.join(OUTDIR, 'Hub_スマホ版説明書_2026-09.pptx'); await pres.writeFile({ fileName: out }); console.log('出力: ' + out); await exportPdf(out); }

  // ═══════════════════ 管理者マニュアル ═══════════════════
  newDeck('Hub a Nice Day 管理者マニュアル');
  slideCover('管理者マニュアル', 'スタッフの招待・端末の管理・復旧', '管理者コンソールと、PC のスケジュール画面の管理者だけの機能', '管理者のみ配布・社外秘');
  slideText(A, '管理者の役割', '4つ。日々やるのは①だけです', [
    { n: 1, t: 'スタッフを招待する', d: '入社・端末の追加のたびに、コンソールから「招待を送る」。6桁の招待コードがメールで届き、本人が端末で登録します。' },
    { n: 2, t: '端末を取り消す', d: '退職・端末の紛失の時に、その人の登録端末を取り消します。取り消した端末は次に開いた時から使えません。' },
    { n: 3, t: '休業日・スタッフ・台数の設定', d: 'PC のスケジュール画面の右上（⚙ スタッフ管理・🏖 休業日・車検台数制限・月間休日数）。' },
    { n: 4, t: '復旧（バックアップから戻す）', d: '毎日／毎時の時点保存から、全部・店ごと・消えた分だけ を戻せます。慌てず「今すぐ時点保存を作る」を先に。', tone: 'warn' },
  ]);
  await annotated(A, 'コンソールにログインする', 'DEV サイトの admin.html。管理者のアドレス＋招待コードで入ります', 'a1-login.png', [
    { k: 'mail', t: '管理者のメールアドレス' },
    { k: 'code', t: '招待コード（6桁）', d: '自分に発行されたコード。同じコードで別の PC にもログインできます' },
    { k: 'ok', t: 'コードでログイン' },
    { k: 'send', t: 'コードが無い時', d: 'ログイン用リンクをメールで受け取る（1日の上限あり）' },
    { k: 'env', t: '本番に切り替える', d: 'DEV と本番でスタッフ表は別。許可簿とアカウントは共通' },
  ], { crop: { x: 300, y: 0, w: 800, h: 950 }, top: true, colW: 4.8 });
  await annotated(A, 'スタッフと招待', 'ここで「誰がシステムを操作するか」と「招待」を管理します', 'a2-staff.png', [
    { k: 'tabs', t: 'タブ', d: 'スタッフと招待／登録端末／管理者' },
    { k: 'bulk', t: 'まとめて招待', d: 'メールがあって未登録の人に一度に送る' },
    { k: 'add', t: '＋ 追加', d: '新しいスタッフ、または共有端末を足す（次ページ）' },
    { k: 'invite', t: '招待を送る', d: 'コードを発行してメール。押すたびに新しいコードになります' },
    { k: 'role', t: '操作しない に変える', d: 'アルバイトなど。休日・頭数には出るがログインしない' },
    { k: 'edit', t: '設定', d: '端末の種類・メール・所属店舗（店をまたいで移せます）' },
    { k: 'revoke', t: '登録解除', d: '端末の取り消し＋ログイン停止＋スタッフ表から名前を削除（退職時）' },
  ], { crop: { x: 150, y: 60, w: 1100, h: 890 }, top: true, colW: 4.6 });
  await annotated(A, '追加：新しいスタッフ・共有端末', '「＋ 追加」→ 何を追加するか → 役割と端末', 'a3-add.png', [
    { k: 'what', t: 'スタッフ／共有端末', d: '共有端末＝店の PC・タブレット（人ではない）' },
    { k: 'who', t: 'スタッフを選ぶ', d: '一覧に無い人は「＋ 一覧にない（新しく登録する）」' },
    { k: 'newStaff', t: '新しく登録', d: '氏名と店舗。バッジや対応業務はスケジュール画面の ⚙ スタッフ設定で' },
    { k: 'role', t: '操作する／しない' },
    { k: 'plan', t: '使う端末', d: '個人端末（自分のスマホ）／共有端末' },
    { k: 'mail', t: 'ログイン用メール', d: '後からでも可。入れたら「招待を送る」' },
    { k: 'ok', t: '追加する' },
  ], { crop: { x: 380, y: 40, w: 640, h: 900 }, top: true, colW: 4.8 });
  await annotated(A, '設定：端末・メール・所属店舗', '「設定」で後から変えられます', 'a4-edit.png', [
    { k: 'store', t: '所属店舗', d: '本店⇄三田店。変えるとスタッフ表ごと移り、担当・休日・頭数も移り先の店に' },
    { k: 'role', t: '操作する／しない' },
    { k: 'plan', t: '使う端末' },
    { k: 'mail', t: 'ログイン用メール' },
    { k: 'ok', t: '変更する' },
  ], { crop: { x: 380, y: 40, w: 640, h: 900 }, top: true, colW: 4.8 });
  await annotated(A, '招待を送る', '確認 → コードが発行され、本人にメールが届きます', 'a5b-invite-code.png', [
    { k: 'code', t: '招待コード', d: '画面にも同じコードが出ます（この写真はメール送信を止めた撮影環境のため「送れませんでした」と出ていますが、実際はメールも届きます）。1つのコードでスマホと店の PC の両方に登録できます' },
  ], { crop: { x: 150, y: 380, w: 1100, h: 560 }, top: true, layout: 'below', imgH: 3.0 });
  slideText(A, 'メールが届かない時', '2026年9月に直した内容と、それでも届かない時', [
    { n: 1, t: '迷惑メールを確認', d: '送信元は hubaniceday.system@gmail.com（GAS 経由）。件名「[DEV] ログインの登録をお願いします」または「ログインの登録をお願いします」。' },
    { n: 2, t: '画面のコードを伝える', d: '「招待を送る」を押した時に画面に出る6桁を、口頭・LINE で伝えれば登録できます（コードは押すたびに変わるので、伝えた後に押し直さない）。' },
    { n: 3, t: '「リンク」方式の上限', d: '「コードがない → リンク」は Firebase の無料枠で1日の送信数に上限があります。上限に当たると「本日の上限」と出るので、コード方式を使ってください。', tone: 'warn' },
  ]);
  await annotated(A, '登録端末（取り消し）', '誰のどの端末が登録されているか。退職・紛失時は「取り消し」', 'a6-devices.png', [
    { k: 'row', t: '端末の行', d: '名前・端末の種類（自分専用／共有）・機種・最後に使った日' },
    { k: 'revoke', t: '取り消し', d: 'その端末は次に開いた時に登録が外れます。本人が使い続ける場合はもう一度招待' },
    { k: 'devnames', t: '共有端末の一覧', d: '「＋ 追加 → 共有端末」で足した店の PC・タブレット' },
    { k: 'reload', t: '再読込' },
  ], { crop: { x: 150, y: 60, w: 1100, h: 890 }, top: true, colW: 4.6 });
  await annotated(A, '管理者', 'コンソールに入れる人。交代・追加はここで', 'a7-admins.png', [
    { k: 'list', t: '管理者の一覧', d: 'アドレスと名前。役割 admin の人' },
    { k: 'addAdmin', t: '管理者にする', d: 'スタッフの中から追加。管理者は最低2人にしておく' },
  ], { crop: { x: 150, y: 60, w: 1100, h: 700 }, top: true, colW: 4.6 });

  await annotated(AP, 'PC のスケジュール画面：管理者だけのボタン', '右上の自分の名前の横', 'p1-header.png', [
    { k: 'staffBtn', t: '⚙ スタッフ管理', d: 'バッジ・対応可能業務・番号（次ページ）' },
    { k: 'holidayBtn', t: '🏖 休業日設定', d: '定休日・第2火曜・臨時休業・臨時営業' },
    { k: 'restoreBtn', t: '🕒 復旧', d: 'バックアップから戻す（最後のページ）' },
    { k: 'logout', t: 'ログアウト' },
  ], { crop: { x: 900, y: 0, w: 600, h: 130 }, top: true, layout: 'below', imgH: 1.3 });
  await annotated(AP, 'スタッフ設定', '氏名・番号・バッジ・対応可能業務。新しい人は先にここで登録し、次にコンソールで役割を決めます', 'p2-staff-settings.png', [
    { k: 'newBtn', t: '＋ 新規登録', d: '新しい人の氏名・番号・店舗を登録。そのあとコンソールで役割を決めます' },
    { k: 'storeTabs', t: '本店／三田店', d: '店ごとのスタッフ表。共有／端末のタブは共有端末の登録' },
    { k: 'row', t: 'スタッフの行', d: 'クリックで右に編集欄。バッジ（検査員・整備士・事務など）・対応可能業務・番号を直せます。「削除」でスタッフ表から消す（過去の予約の名前は残る）' },
  ], { crop: { x: 420, y: 30, w: 660, h: 640 }, top: true, colW: 4.8 });
  await annotated(AP, '休業日設定', '店ごとの定休日と、日付を指定した休業・臨時営業', 'p3-holiday.png', [
    { k: 'tue', t: '毎週の定休日と第2火曜', d: '曜日を押して定休日に。第2火曜は両店共通の定休（自動）' },
    { k: 'ok', t: '確定して閉じる', d: 'カレンダーの日付をドラッグで臨時休業、第2火曜をクリックで臨時営業（通常営業に戻す）。休業日は予約が入れられず、スタッフ全員が休み扱い' },
  ], { crop: { x: 450, y: 190, w: 600, h: 600 }, top: true, colW: 5.0 });
  slideText(AP, '車検台数制限・月間休日数・7台目の承認', 'スケジュール画面で管理者だけができること', [
    { n: 1, t: '車検台数制限', d: 'カレンダー → ⚙設定 → 車検台数制限。日付と最大台数（0〜6）を決めて「確定」。制限を外す時は「制限解除」。' },
    { n: 2, t: '月間休日数', d: 'スタッフ休日設定の上にある「N月の休日 ○日」の「変更」（管理者4人だけ）。ここに入れた数が、各スタッフの「今月の枠」と翌月への繰り越しの元になります。' },
    { n: 3, t: '7台目の承認', d: '1日6台を超える車検は「承認待ち」で入ります。管理者がその行の「✓ 承認」を押すと確定。承認しない場合はカードを開いて削除。' },
    { n: 4, t: 'クイック編集', d: '予約カードの備考ボタン（Eオイル交換など）の文言は「クイック編集」で誰でも直せますが、全員に反映されるので管理者が整えてください。' },
  ]);
  await annotated(AP, '復旧（バックアップから戻す）', '毎日1回（90日）・毎時（48時間）の時点保存。戻す前に必ず「今すぐ時点保存を作る」', 'p4-restore.png', [
    { k: 'now', t: '今すぐ時点保存を作る', d: '戻す前の状態を残す（やり直せる）。1.6秒ほど' },
    { k: 'first', t: '時点を選ぶ', d: '日時と件数の要約。🔒は復旧直前の自動保存' },
    { k: 'add', t: '＋ 足す', d: '消えた予約だけを今のデータに足す（上書きしない）。一番安全' },
    { k: 'all', t: '全部この時点に戻す', d: 'その時点以降に入れた予約は消えます（直前の自動保存から戻せます）' },
    { k: 'list', t: '戻す範囲を選ぶ', d: '全部／店別（本店だけ・三田店だけ）' },
  ], { crop: { x: 250, y: 180, w: 1000, h: 500 }, top: true, layout: 'below', imgH: 3.2 });
  slideText(A, '運用の決まり', '2026年9月時点', [
    { t: '本番へ招待する前に', d: 'まず DEV で全員に使ってもらい、不具合を潰してから本番に招待する。本番のスタッフ表は DEV から写す（Claude 作業）。', tone: 'warn' },
    { t: 'アカウントは会社のもの', d: 'GitHub は Midorimotor-Inc、メールは hubaniceday.system@gmail.com。個人アカウントは使わない。' },
    { t: 'シークレット予定', d: '暗号化されていて管理者にも読めません。答えを忘れた人は本人が「リセット」（全消し）するしかありません。管理者が代わりに開くことはできません。' },
    { t: '問い合わせの時', d: 'バージョン（v' + VERSION + ' など）・画面名・時刻・操作を添えて。スクショがあると早い。' },
  ]);
  { const out = path.join(OUTDIR, 'Hub_管理者マニュアル_2026-09.pptx'); await pres.writeFile({ fileName: out }); console.log('出力: ' + out); await exportPdf(out); }
})();
