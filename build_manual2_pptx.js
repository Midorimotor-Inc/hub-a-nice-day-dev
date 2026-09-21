// Hub a Nice Day 取扱説明書 2026-09 改訂版（基本操作／便利機能）を生成する。
//   素材: manual2_shots/*.png と index.json（capture_manual2_shots.js が作る。各ボタンの座標入り）
//   実行: node build_manual2_pptx.js [--proto]   … --proto は試作（数枚だけ）
//   出力: C:\Users\A\Documents\Hub取扱説明書\Hub_取扱説明書_2026-09.pptx（試作は _試作.pptx）
//
//   作り方：画面写真の上に赤枠を描き、右の説明欄と線で結ぶ（ユーザー指示・2026-09-21）。
//   座標は撮影時に記録した要素の位置（CSS px）を、写真の縮尺に合わせて換算する。
const path = require('path'), fs = require('fs');
let pptxgen; try { pptxgen = require('pptxgenjs'); } catch (e) { pptxgen = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'pptxgenjs')); }
let sharp; try { sharp = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'sharp')); } catch (e) { sharp = null; }

const PROTO = process.argv.includes('--proto');
const SHOTS = path.join(__dirname, 'manual2_shots');
const META = {}; JSON.parse(fs.readFileSync(path.join(SHOTS, 'index.json'), 'utf8')).forEach(m => { META[m.file] = m; });
const OUTDIR = 'C:\\Users\\A\\Documents\\Hub取扱説明書';
const OUT = path.join(OUTDIR, PROTO ? 'Hub_取扱説明書_試作.pptx' : 'Hub_取扱説明書_2026-09.pptx');
const VERSION = (fs.readFileSync(path.join(__dirname, 'index_dev.html'), 'utf8').match(/const APP_VERSION = '([^']+)'/) || [])[1] || '';

const NAVY = '12233F', BLUE = '1D4ED8', BLUE_L = 'E8EFFC', ORANGE = 'EA580C', ORANGE_L = 'FDEDE2', INK = '1B2735', MUTED = '5B6B7C',
      LINE = 'D8E0EA', PAPER = 'FFFFFF', SOFT = 'F4F7FB', RED = 'E11D48', WHITE = 'FFFFFF', GREEN = '15803D';
const F = 'Meiryo';
const W = 13.333, H = 7.5;

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; pres.author = 'Hub a Nice Day'; pres.title = 'Hub a Nice Day 取扱説明書';

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
  T(s, '車検予約管理システム　／　基本操作 と 便利機能', { x: 0.9, y: 4.0, w: 11.5, h: 0.4, fontSize: 15, color: 'C6D4E8' });
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
  pageTitle(s, null, 'この説明書の構成', '「基本操作」は毎日使う手順、「便利機能」は知っていると助かる機能です');
  const cols = [
    { t: '第1部　基本操作', c: BLUE, bg: BLUE_L, items: ['画面の見方（バージョン・接続状態・店舗）', 'カレンダーから予約する', '顧客リストから予約する', 'タイムスケジュールに直接予約する', '代車・レンタカーの付け方'] },
    { t: '第2部　便利機能', c: ORANGE, bg: ORANGE_L, items: ['カレンダー：スタッフ休日設定・My予定・車検台数制限', 'スケジュール：代車の限定・入庫済み☑・検索・事前入庫／納車日・入庫制限・印刷', '代車管理：最適化・タイヤ設定・レンタカーの所在地', '車両管理：代車・社用車の点検アラート', '顧客リスト：検索・同期チェック・絞り込みボタン'] },
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

(async () => {
  await loadDims();
  fs.mkdirSync(OUTDIR, { recursive: true });
  const B = { t: '基本操作', color: BLUE }, C = { t: '便利機能', color: ORANGE };
  const ver = 'v' + VERSION;

  slideTitle();
  slideToc();

  // ═══════════ 第1部 基本操作 ═══════════
  slideSection(1, '基本操作', '毎日の予約入力に必要な手順です', ['画面の見方（バージョン・接続状態・店舗）', 'カレンダーから予約', '顧客リストから予約', 'タイムスケジュールに直接予約', '代車・レンタカーの付け方']);

  await annotated(B, '画面の見方', 'いちばん上の帯（ヘッダー）。ここから全ての操作が始まります', 'b1-schedule.png', [
    { k: 'version', t: 'バージョン', d: '今使っている版。新しい版が出ると帯でお知らせします。困った時はこの番号を添えて連絡を' },
    { k: 'gas', t: '接続ランプ', d: '緑＝サーバー（保存先）と繋がっています。赤なら通信を確認。保存先は Firebase（Google のクラウド）、メール送信だけ GAS' },
    { k: 'navGroup', t: '画面の切替', d: 'カレンダー／スケジュール／代車管理／車両管理／検索／顧客リスト' },
    { k: 'storeGroup', t: '店舗の切替', d: '本店・三田店。表示中の店の予約が出ます' },
    { k: 'staffBar', t: '本日の出勤・休み', d: '出勤している人と休みの人（右端）。休みは 🏖 から' },
    { k: 'userMenu', t: 'ログイン中の人', d: '自分の名前。右の ⏏ でログアウト（共有PCでは交代時に）' },
  ], { crop: { x: 0, y: 0, w: 1500, h: 270 }, top: true, layout: 'below', imgH: 2.3 });

  slideText(B, 'バージョンと保存先について', '「GAS」の表示の意味が 2026年9月 から変わりました', [
    { n: 1, t: 'バージョン番号', d: 'スケジュール・顧客リスト・スマホ版は同じ番号で揃えています。開きっぱなしの画面に「新しい版があります」の帯が出たら、押して読み込み直してください（入力中の内容は保存してから）。\n問い合わせの時は「v' + VERSION + ' で〜」のように番号を添えると原因がすぐ分かります。' },
    { n: 2, t: '保存先は Firebase', d: '予約・休日・顧客リストなど全てのデータは Firebase（Google のクラウド）に保存されます。保存した瞬間に他の PC・スマホへ反映されます（数秒待つ必要はありません）。\n毎日自動で時点保存（バックアップ）を取っており、管理者は「復旧」から戻せます。' },
    { n: 3, t: '「GAS接続済」のランプ', d: '緑＝正常。GAS はメール送信（招待コード・保存失敗の通知）だけに使っています。\n赤や黄色になったら通信（Wi-Fi）を確認し、直らなければ管理者へ。入力した内容は端末に控えが残り、繋がった時に再送できます。', tone: 'warn' },
  ]);

  await annotated(B, 'カレンダーから予約する', 'カレンダーで日を選ぶと、その日のスケジュールが開きます', 'b4-calendar.png', [
    { k: 'monthNav', t: '月の移動', d: '‹ › で前後の月へ' },
    { k: 'dayCell', t: '日をクリック', d: 'その日のスケジュール画面が開きます。マス目の色は車検の種類（マ／ク／レ）、数字は台数' },
    { k: 'toggleGroup', t: '表示の切替', d: '🚗車検（予約の一覧）／🏖休日／📝予定' },
    { k: 'gear', t: '設定', d: '車検台数制限・スタッフ休日設定（便利機能で説明）' },
  ], { colW: 4.0 });

  await annotated(B, 'タイムスケジュール／車検表に直接予約する', '空いている行の「クリックして追加」を押すと予約カードが開きます', 'b1-schedule.png', [
    { k: 'dateNav', t: '日付の移動', d: '‹ › で前後の日、« » で1週間、«« »» で1ヶ月。日付を押すとカレンダーで選べます' },
    { k: 'inspAdd', t: '車検の予約（左の表）', d: '「クリックして追加」→ 車検予約カード。1日6台まで。7台目は承認待ちになります' },
    { k: 'schedAdd', t: '整備の予約（右の表）', d: '時間の行の「クリックして追加」→ 整備の予約カード。同じ時刻に2件目は「同時刻に追加」' },
    { k: 'collapse', t: '畳む', d: '予約の無い時間帯を隠して見やすく' },
  ]);

  await annotated(B, '車検予約カードに入力する', '＊の付いた項目は必須。それ以外は分かる範囲で。Enter で次の項目へ移れます', 'b2-insp-card.png', [
    { k: 'name', t: '氏名 ＊', d: 'お客様名（姓と名の間は全角スペース）' },
    { k: 'staff', t: '担当', d: '番号を打つか、ダブルクリックで一覧から。空欄なら自分' },
    { k: 'car', t: '車種 ＊' },
    { k: 'phone', t: '電話・住所（任意）', d: '顧客リストから予約した時は自動で入ります' },
    { k: 'course', t: 'コース ＊', d: 'マッハ／クイック／レギュラー（レギュラーは1日3台まで）' },
    { k: 'loaner', t: '代車・レンタカー', d: '「選択」で管理表から空いている車を選びます（次ページ）' },
    { k: 'time', t: '入庫時間 ＊', d: 'Enter で一覧が開きます' },
  ], { crop: { x: 0, y: 0, w: 560, h: 950 }, top: true, colW: 4.2 });

  await annotated(B, '車検予約カード（下半分）と保存', '特典・入庫日・納車日・備考。最後に「保存」', 'b2b-insp-card-bottom.png', [
    { k: 'entry', t: '入庫日（事前入庫）', d: '前日・前々日に車を預かる時にチェック → 入庫日を選ぶ' },
    { k: 'delivery', t: '納車日', d: '決まっていれば入れておくと納車日の表に出ます' },
    { k: 'note', t: '備考', d: 'よく使う文言はボタン1つ。自由入力もできます' },
    { k: 'quick', t: 'クイック編集', d: '備考ボタンの文言を増やす・直す（全員に反映）' },
    { k: 'del', t: '削除', d: '予約を消します。確認が出ます' },
  ], { crop: { x: 0, y: 0, w: 560, h: 950 }, top: true, colW: 4.2 });

  await annotated(B, 'タイムスケジュール（整備）の予約カード', '車検以外の作業はこちら。作業内容は必須', 'b3-sched-card.png', [
    { k: 'name', t: '氏名 ＊' },
    { k: 'car', t: '車種 ＊' },
    { k: 'phone', t: '電話（任意）' },
    { k: 'work', t: '作業 ＊', d: 'Q クイック整備／12ヶ月点検／M12・M6 メンパ／N1・N6 新車点検／鈑金／商談／保険／試乗／納車／その他' },
    { k: 'loaner', t: '代車・レンタカー', d: '車検と同じ「選択」で' },
    { k: 'shimi', t: '指示書・見積', d: '指／見／両方' },
    { k: 'content', t: '内容', d: '作業の中身をひとこと' },
  ], { crop: { x: 0, y: 0, w: 560, h: 950 }, top: true, colW: 4.2 });

  await annotated(B, '顧客リストから予約する（1）お客様を探す', '「未予約」で絞ると、まだ予約の無いお客様だけになります', 'c10-list-row.png', [
    { k: 'fNone', t: '未予約で絞る', d: '状態のボタン（すべて／未予約／仮予約／本予約／キャンセル／初回）' },
    { k: 'book', t: '＋予約', d: 'その行のお客様の予約カードが開きます' },
    { k: 'row', t: 'お客様の行', d: '満期日・氏名・No.・車種・連絡先・投函／予約の記録が並びます' },
  ], { crop: { x: 0, y: 0, w: 1500, h: 470 }, top: true, layout: 'below', imgH: 3.5 });

  await annotated(B, '顧客リストから予約する（2）予約カード', '入庫日と時間を入れて「本予約」。日が決まっていなければ「仮予約」', 'c11-list-modal.png', [
    { k: 'time', t: '入庫時間' },
    { k: 'store', t: '店舗', d: '本店／三田店' },
    { k: 'staff', t: '担当' },
    { k: 'course', t: '車検コース' },
    { k: 'loaner', t: '代車', d: '必要なら選ぶ' },
    { k: 'tokuten', t: '特典', d: '①1ヶ月前予約／②2ヶ月前予約' },
    { k: 'temp', t: '仮予約', d: 'リストに「仮」で残す（スケジュールには載せない）' },
    { k: 'confirm', t: '✓ 本予約', d: 'スケジュールに載ります。氏名・車種・電話・住所は自動で入ります' },
  ], { crop: { x: 310, y: 30, w: 880, h: 900 }, top: true, colW: 4.2 });

  await annotated(B, '代車・レンタカーの付け方', '予約カードの「選択」→ 管理表が選択モードで開きます', 'c4-loaner-pick.png', [
    { k: 'banner', t: '選び方', d: '空いているマスをクリック → 右へスライド → 離すと日数が決まります' },
    { k: 'carName', t: '車を選ぶ', d: '上が代車（店ごと）、下がレンタカー（両店共通）。色のついたマスは他の予約' },
    { k: 'dateHead', t: '日付', d: '今日の列に印。前後にスクロールできます' },
    { k: 'back', t: '予約カードに戻る', d: '選び終わると自動で戻り、代車欄に車名が入ります。やめる時もこのボタン' },
  ], { crop: { x: 0, y: 90, w: 1500, h: 480 }, top: true, layout: 'below', imgH: 3.3 });

  // ═══════════ 第2部 便利機能 ═══════════
  slideSection(2, '便利機能', '', ['カレンダー：スタッフ休日設定・My予定・車検台数制限', 'スケジュール：代車の限定・入庫済み☑・検索・事前入庫／納車日・入庫制限・印刷', '代車管理：最適化・タイヤ設定・レンタカーの所在地', '車両管理：代車・社用車の点検アラート', '顧客リスト：検索・同期チェック・絞り込みボタン']);

  await annotated(C, 'カレンダーの便利機能', '右上の切替と「設定」から', 'b4b-calendar-gear.png', [
    { k: 'toggleOff', t: '🏖 休日カレンダー', d: 'スタッフの休日・有給を月で見る。個人を選ぶとその人の休みに枠が付き、月の集計と翌月への繰り越しが出ます' },
    { k: 'toggleMy', t: '📝 予定（My予定）', d: '自分の予定を入れる。公開（全員に見える）と 🔒シークレット（自分だけ）を選べます' },
    { k: 'limit', t: '車検台数制限', d: 'スタッフが少ない日に、その日の上限台数を決めます' },
    { k: 'staffOff', t: 'スタッフ休日設定', d: '自分の休日・有給を入れる画面を開きます' },
  ], { crop: { x: 700, y: 0, w: 800, h: 620 }, top: true, colW: 4.6 });

  await annotated(C, 'スタッフ休日設定', '自分の名前を選び、日付をクリックで休日・有給を付け外し。押した瞬間に保存されます', 'c7-staff-cal.png', [
    { k: 'mhol', t: '会社の今月の休日数', d: '会社が決めた日数（管理者が入力）。繰り越し計算の元になります' },
    { k: 'me', t: 'スタッフ', d: '自分の名前を選ぶ（一般スタッフは自分だけ。管理者は全員分）。「全員表示」で全員の休みを見る' },
    { k: 'type', t: '種類', d: '🏖 休日／📋 有給 を選んでから日付をクリック' },
    { k: 'cell', t: '日付のマス', d: 'クリックで付け外し。休みの日の ✎ でメモ（午後休・前月分 など）' },
    { k: 'summary', t: '月の集計', d: '休日・有給の日数と、枠（会社の日数＋前月からの繰越）・残り日数→翌月へ' },
    { k: 'close', t: '確定して閉じる' },
  ], { colW: 4.0 });

  await annotated(C, 'My予定（マイスケジュール）', 'カレンダーの「📝 予定」で日をクリック → 予定を追加', 'c9-mysched.png', [
    { k: 'title', t: '件名', d: '例：○○社と打合せ' },
    { k: 'time', t: '時刻（任意）' },
    { k: 'memo', t: 'メモ（任意）' },
    { k: 'kind', t: '公開 ／ 🔒 シークレット', d: '公開＝他のスタッフにも見える（名前付き）。🔒＝自分だけ。他のスタッフ・管理者・サーバー管理者にも中身は見えません' },
    { k: 'add', t: '追加' },
    { k: 'secret', t: 'シークレットの準備', d: '初回だけ「ヒント」と「答え」を決めます。以後、施錠中はヒント→答えで開きます。答えを忘れると復元できません（リセット＝全消し）' },
  ], { crop: { x: 440, y: 150, w: 620, h: 560 }, top: true, colW: 4.8 });

  await annotated(C, '車検台数制限', 'スタッフが少ない日は、その日の車検の上限を下げておきます', 'c8-limit.png', [
    { k: 'date', t: '制限する日付' },
    { k: 'count', t: '最大台数', d: '0＝車検不可（全禁止）、6＝通常どおり。制限を外すときは「制限解除」' },
    { k: 'ok', t: '✓ 確定', d: '保存して閉じます。設定した日は一覧に残ります' },
  ], { crop: { x: 480, y: 260, w: 540, h: 480 }, top: true, colW: 5.0, mask: [{ k: 'date', text: '2026/09/21' }] });

  await annotated(C, 'スケジュール画面の便利機能', '予約の行と右上のボタン', 'c1-schedule-row.png', [
    { k: 'timeCell', t: '入庫済み ☑', d: '車が入庫したら時刻の欄をクリック → ✓ が付きます（もう一度で外す）。氏名の欄はカードが開くので、時刻の欄で' },
    { k: 'loanerCell', t: '代車の限定 🔒', d: '予約カードで代車を選んだ後「🔓 限定」を押すと 🔒 が付き、最適化で動かなくなります（この車でないとダメ、の印）' },
    { k: 'navSearch', t: '🔍 検索', d: '氏名・車種・No・電話で車検／整備／顧客を横断検索（次ページ）' },
    { k: 'restrict', t: '入庫制限', d: 'その日の時間帯を制限（次ページ）' },
    { k: 'print', t: '印刷', d: 'その日のスケジュールを印刷用に整えて出します' },
  ], { crop: { x: 0, y: 100, w: 1500, h: 480 }, top: true, layout: 'below', imgH: 3.5 });

  await annotated(C, '検索の使い方', '3ヶ月先までの車検・整備の予約と、顧客リストをまとめて探せます', 'c3-find.png', [
    { k: 'input', t: '検索の言葉', d: '氏名の一部・車種・ナンバー・電話番号のどれでも。ひらがな／カタカナ／全角半角の違いは無視' },
    { k: 'tabs', t: '絞り込み', d: '全て／車検／整備／顧客。結果をクリックすると、その日のスケジュール（顧客はリスト）へ移動します' },
  ], { crop: { x: 380, y: 60, w: 740, h: 620 }, top: true, colW: 4.8 });

  await annotated(C, '入庫制限', '朝の混雑時間などに、整備の予約を入れられないようにします', 'c2-restrict.png', [
    { k: 'title', t: '対象の日', d: '開いている日に対して設定します' },
    { k: 'inputs', t: '制限時間', d: '開始〜終了。この時間帯は「クリックして追加」が制限されます' },
    { k: 'save', t: '保存', d: '制限解除項目にチェックした作業（例：クイック整備）は制限時間内でも入れられます' },
  ], { crop: { x: 490, y: 190, w: 520, h: 560 }, top: true, colW: 5.0 });

  await annotated(C, '代車管理の便利機能', '上のボタン群。表は代車（店ごと）とレンタカー（両店共通）', 'c5-loaner.png', [
    { k: 'optimize', t: '✨ 最適化', d: '基準日以降の代車の割り当てを詰め直します（過去・貸出中・🔒限定は動かしません）。基準日は日付の見出しをクリックで変更' },
    { k: 'undo', t: '↶ 戻す', d: '最適化の直前に戻します' },
    { k: 'tire', t: '☀❄ タイヤ', d: '夏／冬タイヤの種別を一括設定。行の左の印に出ます' },
    { k: 'location', t: '📍 所在地', d: 'レンタカーの置き場所（本／三など）を一括設定' },
    { k: 'settings', t: '設定', d: '代車・レンタカーの台数・名前・番号' },
    { k: 'carName', t: '車の行', d: '色のついたマスが予約。クリックで内容の確認・削除' },
  ], { crop: { x: 0, y: 100, w: 1500, h: 560 }, top: true, layout: 'below', imgH: 3.3 });

  await annotated(C, '車両管理：代車・社用車の点検アラート', '車検証を読み込んで登録した車の点検日を管理。期限が近づくと赤く知らせます', 'c6-vehicles.png', [
    { k: 'alert', t: 'アラート件数', d: '90日以内に点検が来る車の数。ヘッダーの「車両管理」にも数字が出ます' },
    { k: 'filter', t: '絞り込み', d: '全て／レンタカー／その他。「アラートのみ」で期限の近い車だけ' },
    { k: 'row', t: '車を選ぶ', d: 'クリックで右に詳細（次ページ）' },
    { k: 'importBtn', t: '車検証ファイル読込', d: '車検証の PDF から登録' },
    { k: 'addBtn', t: '手動追加' },
    { k: 'banner', t: 'アラート一覧', d: '画面の下にも期限の近い点検が並びます' },
  ], { crop: { x: 0, y: 100, w: 1500, h: 850 }, top: true, colW: 3.8 });

  await annotated(C, '車両管理：点検日の登録と完了', '車を選ぶと右に点検の一覧。予定日を入れておくとアラートが出ます', 'c6b-vehicle-edit.png', [
    { k: 'head', t: '車の情報', d: '名前・ナンバー・区分・登録日・車検証ファイル。「編集」で直せます' },
    { k: 'add', t: '＋ 追加', d: '点検（12ヶ月点検・車検 など）と予定日を足します' },
    { k: 'card', t: '点検の項目', d: '予定日までの残り日数。90日以内は黄色、過ぎると赤' },
    { k: 'done', t: '✓ 完了', d: '点検が済んだら押します。アラートが消えます' },
  ], { crop: { x: 290, y: 195, w: 1210, h: 260 }, top: true, layout: 'below', imgH: 2.6 });

  await annotated(C, '顧客リストの検索・絞り込み・同期チェック', '上の段のボタンで、見たいお客様だけに絞ります', 'b5-customers.png', [
    { k: 'search', t: '検索', d: '氏名・ナンバー・車種で絞り込み' },
    { k: 'fGroup', t: '絞り込みボタン', d: 'すべて／未予約／仮予約／本予約／キャンセル／初回。「初回」は初めて車検を受けるお客様' },
    { k: 'sync', t: 'スケジュール同期チェック', d: 'リストの予約とスケジュールの予約が食い違っていないか確かめ、直せます' },
    { k: 'import', t: 'Excelインポート', d: '月ごとの車検リストを取り込みます（見出しに「自宅」「携帯」「住所」があれば連絡先も入ります）' },
    { k: 'stats', t: '集計', d: '総件数・本予約・仮予約・未予約・キャンセル・初回・獲得率・DM後予約・特典' },
  ], { crop: { x: 0, y: 0, w: 1500, h: 450 }, top: true, layout: 'below', imgH: 3.4 });

  slideText(C, '絞り込みボタンの意味', '顧客リストの状態は、お客様ごとに次の5つ', [
    { t: 'すべて', d: '取り込んだ全員。', tone: 'ok' },
    { t: '未予約', d: 'まだ予約が無い人。DM の投函・電話の対象。' },
    { t: '仮予約', d: '日にちが決まっていない・確定前の人。リストには載るがスケジュールには載らない。' },
    { t: '本予約', d: '入庫日と時間が決まり、スケジュールに載っている人。' },
    { t: 'キャンセル', d: '取り消した人。「↩ 復活」で戻せる。' },
    { t: '初回', d: '初めて車検を受けるお客様（初回車検）。獲得率の集計に使う。' },
  ]);

  await pres.writeFile({ fileName: OUT });
  console.log('出力: ' + OUT);
})();
