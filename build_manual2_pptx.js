// Hub a Nice Day 取扱説明書 2026-09 改訂版（基本操作／便利操作）を生成する。
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

(async () => {
  await loadDims();
  fs.mkdirSync(OUTDIR, { recursive: true });
  const B = { t: '基本操作', color: BLUE }, C = { t: '便利操作', color: ORANGE };

  slideTitle();
  slideToc();
  slideSection(1, '基本操作', '毎日の予約入力に必要な手順です', ['画面の見方', 'カレンダーから予約', '顧客リストから予約', 'タイムスケジュールに直接予約', '代車の付け方']);

  await annotated(B, '画面の見方', 'いちばん上の帯と、その下の日付の行。ここから全ての操作が始まります', 'b1-schedule.png', [
    { k: 'version', t: 'バージョン', d: '今使っている版の番号。新しい版が出ると帯でお知らせします。困った時はこの番号を添えて連絡を' },
    { k: 'navGroup', t: '画面の切替', d: 'カレンダー／スケジュール／代車管理／車両管理／検索／顧客リスト' },
    { k: 'storeGroup', t: '店舗の切替', d: '本店・三田店。表示中の店の予約が出ます' },
    { k: 'staffBar', t: '本日の出勤・休み', d: '出勤している人と休みの人。休みは 🏖 から設定' },
    { k: 'userMenu', t: 'ログイン中の人', d: '自分の名前。押すとログアウトできます' },
  ], { crop: { x: 0, y: 0, w: 1500, h: 270 }, top: true, layout: 'below', imgH: 2.3 });

  await annotated(B, 'タイムスケジュールに直接予約する', '空いている行の「クリックして追加」を押すと、予約カードが開きます', 'b1-schedule.png', [
    { k: 'inspAdd', t: '車検の予約（左の表）', d: '「クリックして追加」→ 車検予約カード。1日6台まで（7台目は承認が要ります）' },
    { k: 'schedAdd', t: '整備の予約（右の表）', d: '時間の行の「クリックして追加」→ 整備の予約カード。同じ時刻に複数入れるときは「同時刻に追加」' },
    { k: 'collapse', t: '畳む', d: '予約の無い時間帯を隠して見やすくします' },
  ]);

  await annotated(B, '車検予約カードに入力する', '＊の付いた項目は必須。それ以外は分かる範囲で', 'b2-insp-card.png', [
    { k: 'name', t: '氏名 ＊', d: 'お客様名' },
    { k: 'staff', t: '担当', d: '番号を打つか、ダブルクリックで一覧から選ぶ' },
    { k: 'car', t: '車種 ＊' },
    { k: 'phone', t: '電話・住所（任意）', d: '顧客リストから予約した時は自動で入ります' },
    { k: 'course', t: 'コース ＊', d: 'マッハ／クイック／レギュラー' },
    { k: 'loaner', t: '代車・レンタカー', d: '「選択」で管理表から空いている車を選びます' },
    { k: 'time', t: '入庫時間 ＊', d: 'Enter で一覧が開きます' },
  ], { crop: { x: 0, y: 0, w: 560, h: 950 }, top: true, colW: 4.2 });

  slideSection(2, '便利操作', '知っていると入力が早く・正確になります', ['カレンダー：休日設定・My予定・台数制限', 'スケジュール：代車の限定・入庫済み☑・検索・事前入庫／納車日・入庫制限・印刷', '代車管理・車両管理', '顧客リスト：検索・同期チェック・絞り込み']);

  await annotated(C, '予約カードの便利機能', '事前入庫・納車日・クイック編集', 'b2b-insp-card-bottom.png', [
    { k: 'entry', t: '事前入庫', d: '前日・前々日に車を預かる時にチェック → 入庫日を選ぶ。スケジュールの入庫日に「M/D 入庫」と出ます' },
    { k: 'delivery', t: '納車日', d: '決まっていれば入れておくと納車日の表に出ます' },
    { k: 'note', t: '備考とクイック編集', d: 'よく使う文言（Eオイル交換 など）はボタン1つ。「クイック編集」でボタンの文言を増やせます' },
  ], { crop: { x: 0, y: 0, w: 560, h: 950 }, top: true, colW: 4.2 });

  await annotated(C, 'カレンダーの便利機能', '右上の切替と「設定」から', 'b4b-calendar-gear.png', [
    { k: 'toggleOff', t: '休日カレンダー', d: 'スタッフの休日・有給を月で見る。個人を選ぶとその人の休みだけ枠が付きます' },
    { k: 'toggleMy', t: 'My予定', d: '自分の予定を入れる。公開（全員に見える）と 🔒シークレット（自分だけ）を選べます' },
    { k: 'limit', t: '車検台数制限', d: 'スタッフが少ない日に、その日の上限台数を決めます' },
    { k: 'staffOff', t: 'スタッフ休日設定', d: '自分の休日・有給を日付クリックで入れます。休みの日の ✎ でメモ' },
  ], { crop: { x: 700, y: 0, w: 800, h: 620 }, top: true, colW: 4.6 });

  await annotated(C, '顧客リストの絞り込みと同期チェック', '上の段のボタンで、見たいお客様だけに絞ります', 'b5-customers.png', [
    { k: 'search', t: '検索', d: '氏名・ナンバー・車種で絞り込み' },
    { k: 'fGroup', t: '絞り込みボタン', d: 'すべて／未予約／仮予約／本予約／キャンセル／初回。「初回」は初めて車検を受けるお客様' },
    { k: 'sync', t: 'スケジュール同期チェック', d: 'リストの予約とスケジュールの予約が食い違っていないか確かめます' },
    { k: 'book', t: '＋予約', d: 'その行のお客様の予約カードを開きます（電話・住所も自動で入ります）' },
    { k: 'import', t: 'Excelインポート', d: '月ごとの車検リストを取り込みます' },
  ], { crop: { x: 0, y: 0, w: 1500, h: 450 }, top: true, layout: 'below', imgH: 3.4 });

  await pres.writeFile({ fileName: OUT });
  console.log('出力: ' + OUT);
})();
