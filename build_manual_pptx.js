// Hub a Nice Day 取扱説明書（PowerPoint）を生成する。
//   素材: manual_shots/*.png （capture_manual_shots.js → crop_manual_shots.js で作成）
//   実行: node build_manual_pptx.js
//   出力: C:\Users\A\Documents\Hub取扱説明書\Hub_取扱説明書.pptx
//
// ※スクリーンショットのお客様氏名は架空名に置き換え済み。スタッフ名は実名。
const path = require('path');
const fs = require('fs');

let pptxgen; try { pptxgen = require('pptxgenjs'); } catch (e) {
  try { pptxgen = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'pptxgenjs')); }
  catch (e2) { console.error('pptxgenjs が必要です:  cd "%LOCALAPPDATA%\\Temp\\hub-verify" && npm i pptxgenjs'); process.exit(1); }
}
let sharp; try { sharp = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'sharp')); } catch (e) { sharp = null; }

const SHOTS = path.join(__dirname, 'manual_shots');
const OUTDIR = 'C:\\Users\\A\\Documents\\Hub取扱説明書';
const OUT_STAFF = path.join(OUTDIR, 'Hub_取扱説明書.pptx');           // 一般社員用
const OUT_ADMIN = path.join(OUTDIR, 'Hub_管理者マニュアル.pptx');       // 管理者用（別冊・配布注意）

// ── 配色：アプリ本体の色をそのまま持ち込む（青のヘッダー＋操作系のオレンジ）──
const NAVY = '12233F', BLUE = '1D4ED8', BLUE_L = 'E8EFFC', ORANGE = 'EA580C',
      ORANGE_L = 'FDEDE2', INK = '1B2735', MUTED = '5B6B7C', LINE = 'D8E0EA',
      PAPER = 'FFFFFF', SOFT = 'F4F7FB', GREEN = '15803D', GREEN_L = 'E6F3EA',
      RED = 'B91C1C', RED_L = 'FBECEC', WHITE = 'FFFFFF';
const F = 'Meiryo';                     // Windows標準。日本語が確実に出る

const W = 13.333, H = 7.5;
// 一般社員用と管理者用の2冊を作る。1ファイルにつき new pptxgen() が1つ必要。
//   管理者用を分ける理由（ユーザー指示・2026-09-02）:
//     ・管理者にだけ配りたい（一般には見せない操作が含まれる）
//     ・管理者は交代しうるので、資料に個人名を書かない
let pres;
function newDeck(title) {
  pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';          // ★スライドを足す前に必ず設定する
  pres.author = 'Hub a Nice Day';
  pres.title = title;
}

// 画像の寸法（縦横比を保って配置するため）
const dim = {};
async function loadDims() {
  if (!sharp) return;
  for (const f of fs.readdirSync(SHOTS).filter(x => x.endsWith('.png'))) {
    try { const m = await sharp(path.join(SHOTS, f)).metadata(); dim[f] = { w: m.width, h: m.height }; } catch (e) {}
  }
}
// 箱に収まる最大サイズで中央に置く
function fit(file, bx, by, bw, bh) {
  const d = dim[file] || { w: 3000, h: 1900 };
  const r = Math.min(bw / d.w, bh / d.h);
  const w = d.w * r, h = d.h * r;
  return { path: path.join(SHOTS, file), x: bx + (bw - w) / 2, y: by + (bh - h) / 2, w, h };
}
const shadow = () => ({ type: 'outer', color: '8A9AAD', blur: 10, offset: 2, angle: 90, opacity: 0.35 });

// ── 部品 ────────────────────────────────────────────────────
function pageTitle(s, title, sub) {
  s.addText(title, { x: 0.55, y: 0.34, w: 12.2, h: 0.62, fontFace: F, fontSize: 30, bold: true, color: INK, isTextBox: true, margin: 0 });
  if (sub) s.addText(sub, { x: 0.55, y: 1.0, w: 12.2, h: 0.42, fontFace: F, fontSize: 14, color: MUTED, isTextBox: true, margin: 0 });
}
function numCircle(s, n, x, y, d, fill) {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill || ORANGE }, line: { color: fill || ORANGE, width: 0 } });
  s.addText(String(n), { x, y, w: d, h: d, fontFace: F, fontSize: d > 0.4 ? 16 : 12, bold: true, color: WHITE, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
}
function card(s, x, y, w, h, opt) {
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: opt.bg || SOFT }, line: { color: opt.line || LINE, width: 1 }, shadow: opt.shadow ? shadow() : undefined });
}

function slideTitle() {
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addText('Hub a Nice Day', { x: 0.9, y: 2.25, w: 11.5, h: 0.9, fontFace: F, fontSize: 46, bold: true, color: WHITE, isTextBox: true, margin: 0 });
  s.addText('取扱説明書', { x: 0.9, y: 3.15, w: 11.5, h: 0.8, fontFace: F, fontSize: 34, bold: true, color: '9FC2FF', isTextBox: true, margin: 0 });
  s.addText('車検予約管理システム　／　はじめて使う方へ', { x: 0.9, y: 4.15, w: 11.5, h: 0.4, fontFace: F, fontSize: 15, color: 'C6D4E8', isTextBox: true, margin: 0 });
  s.addShape(pres.ShapeType.roundRect, { x: 0.9, y: 5.05, w: 3.05, h: 0.46, rectRadius: 0.2, fill: { color: '1E3A66' }, line: { color: '2F5590', width: 1 } });
  s.addText('本店・三田店 共通', { x: 0.9, y: 5.05, w: 3.05, h: 0.46, fontFace: F, fontSize: 12, color: 'C6D4E8', align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
  s.addText('緑モータース　2026年9月版（v2.37）', { x: 0.9, y: 6.5, w: 11.5, h: 0.35, fontFace: F, fontSize: 11, color: '7E92AE', isTextBox: true, margin: 0 });
  s.addNotes('この説明書は実際の画面を撮影して作っています。お客様のお名前は架空のものに置き換えてあります。');
  return s;
}

function slideSection(no, title, lead) {
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addText('第 ' + no + ' 部', { x: 0.9, y: 2.7, w: 11.5, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: 'F2A97C', isTextBox: true, margin: 0, charSpacing: 2 });
  s.addText(title, { x: 0.9, y: 3.15, w: 11.5, h: 0.85, fontFace: F, fontSize: 38, bold: true, color: WHITE, isTextBox: true, margin: 0 });
  if (lead) s.addText(lead, { x: 0.9, y: 4.1, w: 10.5, h: 0.5, fontFace: F, fontSize: 14, color: 'C6D4E8', isTextBox: true, margin: 0 });
  return s;
}

// 画像を大きく見せて、右（または下）に説明を並べる
function slideShot(title, sub, file, notes, opt) {
  opt = opt || {};
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, title, sub);
  const textW = opt.textW == null ? 3.55 : opt.textW;
  if (textW > 0) {
    const im = fit(file, 0.55 + textW + 0.3, 1.55, 12.2 - textW - 0.3, 5.35);
    s.addImage(Object.assign({}, im, { shadow: shadow() }));
    let y = 1.62;
    (notes || []).forEach((n, i) => {
      numCircle(s, i + 1, 0.55, y + 0.02, 0.3, BLUE);
      s.addText(n.t, { x: 0.98, y: y - 0.03, w: textW - 0.45, h: 0.3, fontFace: F, fontSize: 13, bold: true, color: INK, isTextBox: true, margin: 0 });
      if (n.d) s.addText(n.d, { x: 0.98, y: y + 0.27, w: textW - 0.45, h: 0.62, fontFace: F, fontSize: 11, color: MUTED, isTextBox: true, margin: 0 });
      y += n.d ? 0.98 : 0.52;
    });
  } else {
    const im = fit(file, 0.55, 1.5, 12.2, opt.imgH || 4.35);
    s.addImage(Object.assign({}, im, { shadow: shadow() }));
    let y = 1.5 + (opt.imgH || 4.35) + 0.18;
    const cols = Math.min(4, (notes || []).length) || 1;
    const cw = (12.2 - (cols - 1) * 0.22) / cols;
    (notes || []).forEach((n, i) => {
      const x = 0.55 + (i % cols) * (cw + 0.22);
      const yy = y + Math.floor(i / cols) * 0.95;
      numCircle(s, i + 1, x, yy, 0.28, ORANGE);
      s.addText(n.t, { x: x + 0.36, y: yy - 0.04, w: cw - 0.4, h: 0.28, fontFace: F, fontSize: 12, bold: true, color: INK, isTextBox: true, margin: 0 });
      if (n.d) s.addText(n.d, { x: x + 0.36, y: yy + 0.22, w: cw - 0.4, h: 0.5, fontFace: F, fontSize: 10, color: MUTED, isTextBox: true, margin: 0 });
    });
  }
  // 下部の注意書き（「今はこう、導入後はこう変わる」を同じページで示すため）
  if (opt.callout) {
    const cy = opt.calloutY || 6.35;
    card(s, 0.55, cy, 12.2, 0.92, { bg: opt.callout.tone === 'hi' ? ORANGE_L : BLUE_L, line: opt.callout.tone === 'hi' ? ORANGE : BLUE });
    s.addText(opt.callout.t, { x: 0.85, y: cy + 0.12, w: 11.6, h: 0.32, fontFace: F, fontSize: 13, bold: true, color: opt.callout.tone === 'hi' ? ORANGE : BLUE, isTextBox: true, margin: 0 });
    s.addText(opt.callout.d, { x: 0.85, y: cy + 0.44, w: 11.6, h: 0.42, fontFace: F, fontSize: 11.5, color: INK, isTextBox: true, margin: 0 });
  }
  if (opt.note) s.addNotes(opt.note);
  return s;
}

// 手順（丸数字＋見出し＋説明）
function slideSteps(title, sub, steps, opt) {
  opt = opt || {};
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, title, sub);
  const n = steps.length;
  const cols = n <= 4 ? n : Math.ceil(n / 2);
  const rows = Math.ceil(n / cols);
  const cw = (12.2 - (cols - 1) * 0.28) / cols;
  const ch = rows === 1 ? 3.5 : 2.42;
  steps.forEach((st, i) => {
    const x = 0.55 + (i % cols) * (cw + 0.28);
    const y = 1.62 + Math.floor(i / cols) * (ch + 0.3);
    card(s, x, y, cw, ch, { bg: SOFT, line: LINE });
    numCircle(s, i + 1, x + 0.28, y + 0.26, 0.46, i === n - 1 && opt.lastGreen ? GREEN : ORANGE);
    s.addText(st.t, { x: x + 0.28, y: y + 0.85, w: cw - 0.56, h: 0.5, fontFace: F, fontSize: 15, bold: true, color: INK, isTextBox: true, margin: 0 });
    s.addText(st.d, { x: x + 0.28, y: y + 1.35, w: cw - 0.56, h: ch - 1.55, fontFace: F, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0 });
  });
  if (opt.foot) s.addText(opt.foot, { x: 0.55, y: 6.35, w: 12.2, h: 0.9, fontFace: F, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0 });
  if (opt.note) s.addNotes(opt.note);
  return s;
}

// カード並べ
function slideCards(title, sub, cards, opt) {
  opt = opt || {};
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, title, sub);
  const cols = opt.cols || 2;
  const rows = Math.ceil(cards.length / cols);
  const cw = (12.2 - (cols - 1) * 0.3) / cols;
  const ch = Math.min(2.5, (5.4 - (rows - 1) * 0.3) / rows);
  cards.forEach((c, i) => {
    const x = 0.55 + (i % cols) * (cw + 0.3);
    const y = 1.6 + Math.floor(i / cols) * (ch + 0.3);
    const tone = c.tone === 'ok' ? { bg: GREEN_L, line: GREEN, num: GREEN }
              : c.tone === 'ng' ? { bg: RED_L, line: RED, num: RED }
              : c.tone === 'hi' ? { bg: ORANGE_L, line: ORANGE, num: ORANGE }
              : { bg: SOFT, line: LINE, num: BLUE };
    card(s, x, y, cw, ch, { bg: tone.bg, line: tone.line });
    s.addText(c.t, { x: x + 0.3, y: y + 0.22, w: cw - 0.6, h: 0.45, fontFace: F, fontSize: 15, bold: true, color: c.tone === 'ng' ? RED : (c.tone === 'ok' ? GREEN : INK), isTextBox: true, margin: 0 });
    s.addText(c.d, { x: x + 0.3, y: y + 0.72, w: cw - 0.6, h: ch - 0.95, fontFace: F, fontSize: 12, color: INK, isTextBox: true, margin: 0 });
  });
  if (opt.foot) s.addText(opt.foot, { x: 0.55, y: 6.62, w: 12.2, h: 0.75, fontFace: F, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0 });
  if (opt.note) s.addNotes(opt.note);
  return s;
}

// 箇条書き（左）＋画像（右）
function slideList(title, sub, items, file, opt) {
  opt = opt || {};
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, title, sub);
  const listW = file ? 6.0 : 12.2;
  const rows = items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i !== items.length - 1, paraSpaceAfter: 8 } }));
  s.addText(rows, { x: 0.55, y: 1.6, w: listW, h: 5.2, fontFace: F, fontSize: 13.5, color: INK, isTextBox: true, margin: 0, valign: 'top' });
  if (file) { const im = fit(file, 6.75, 1.6, 6.0, 5.1); s.addImage(Object.assign({}, im, { shadow: shadow() })); }
  if (opt.note) s.addNotes(opt.note);
  return s;
}

// ════════════════════════════════════════════════════════════
//  ① 一般社員用
// ════════════════════════════════════════════════════════════
async function buildStaff() {
  newDeck('Hub a Nice Day 取扱説明書');

  // ══ 表紙・目次 ══
  slideTitle();
  slideCards('この説明書の使い方', '全7部・約36ページ。必要なところだけ読んでも構いません。', [
    { t: '第1部　はじめに', d: 'どんなシステムか。開けるようにする設定とログイン。' },
    { t: '第2部　画面の見方', d: 'ボタンの役割、カレンダー、スケジュール表。' },
    { t: '第3部　予約を入れる', d: 'スケジュールから／顧客リストから。代車の付け方。' },
    { t: '第4部　日々の操作', d: '入庫チェック、事前入庫、納車日、空き枠検索。' },
    { t: '第5部　管理まわり', d: '代車管理、車両管理、顧客リスト取り込み、店舗切替。' },
    { t: '第6部　スマホで使う', d: '外出先や工場からスマホで操作する。' },
    { t: '第7部　困ったとき', d: 'エラーの見方と、不具合の伝え方。' },
  ], { cols: 4, foot: '画面の写真は実物です。お客様のお名前だけ、架空の名前に置き換えています。　※管理者だけができる操作には（管理者のみ）と付けています。詳しい手順は別冊「管理者マニュアル」。' });

  // ══ 第1部 ══
  slideSection(1, 'はじめに', 'これが何をするシステムか。そして、すぐ開けるようにする準備。');
  slideCards('Hub a Nice Day でできること', '紙の予約台帳を置き換えるシステムです。全員が同じ画面を見ます。', [
    { t: '車検の予約を管理する', d: '1日6台までの車検枠を、日付ごとに登録・変更します。7台目は承認待ちになります。' },
    { t: '一般整備の予定を入れる', d: '時間ごとのタイムスケジュールに、整備や点検の予定を入れます。' },
    { t: '代車・レンタカーを割り当てる', d: '空いている代車を選んで予約に紐づけます。重複はシステムが警告します。' },
    { t: '顧客リストから予約する', d: '取り込んだ顧客ファイルから、満期のお客様を探して予約に変えます。' },
    { t: '2つの店舗を切り替える', d: '本店と三田店を、画面右上のボタンで切り替えます。' },
    { t: 'スマホからも使える', d: '工場や外出先から、同じ予定を見て入力できます。' },
  ], { cols: 3, foot: '入力した内容はすぐ全員に共有されます。自分のPCだけに保存される、ということはありません。' });

  // ── 自分の端末からすぐ開けるようにする（ブックマーク／ショートカット）──
  (() => {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, 'まず、開けるようにする', '毎回URLを打つ必要はありません。1回だけ設定しておきます。');

    // URLを大きく見せる
    card(s, 0.55, 1.5, 12.2, 1.05, { bg: BLUE_L, line: BLUE });
    s.addText('アプリのURL', { x: 0.9, y: 1.62, w: 3.0, h: 0.3, fontFace: F, fontSize: 11.5, bold: true, color: BLUE, isTextBox: true, margin: 0 });
    s.addText('https://midorimotor-inc.github.io/hub-a-nice-day/', { x: 0.9, y: 1.92, w: 11.5, h: 0.48, fontFace: F, fontSize: 19, bold: true, color: INK, isTextBox: true, margin: 0 });

    const ways = [
      ['パソコン｜お気に入りに入れる',
       'URLを開いた状態で、アドレス欄の右にある ☆ を押します。\n名前を「Hub」などに変えて保存すれば、次からはお気に入りから1クリックです。'],
      ['パソコン｜デスクトップにアイコンを作る',
       'Edge … 右上の「…」→ アプリ →「このサイトをアプリとしてインストール」\nChrome … 右上の「⋮」→ その他のツール →「ショートカットを作成」\nデスクトップのアイコンをダブルクリックで開けます。'],
      ['iPhone｜ホーム画面に追加',
       'Safari でURLを開き、下の「共有」ボタン（□に↑）→「ホーム画面に追加」。\nアプリのように、ホーム画面のアイコンから開けます。'],
      ['Android｜ホーム画面に追加',
       'Chrome でURLを開き、右上の「⋮」→「ホーム画面に追加」。\n同じくアイコンから開けます。'],
    ];
    const cw = (12.2 - 0.3) / 2;
    ways.forEach((w, i) => {
      const x = 0.55 + (i % 2) * (cw + 0.3);
      const y = 2.8 + Math.floor(i / 2) * 2.1;
      card(s, x, y, cw, 1.9, { bg: SOFT, line: LINE });
      numCircle(s, i + 1, x + 0.26, y + 0.24, 0.36, ORANGE);
      s.addText(w[0], { x: x + 0.72, y: y + 0.22, w: cw - 1.0, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: INK, isTextBox: true, margin: 0 });
      s.addText(w[1], { x: x + 0.26, y: y + 0.72, w: cw - 0.52, h: 1.05, fontFace: F, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0 });
    });

    s.addText('※ ブックマークが古いURLを指していると、直したはずの不具合がそのまま出ます。上のURLと違っていたら入れ直してください。',
      { x: 0.55, y: 7.0, w: 12.2, h: 0.35, fontFace: F, fontSize: 11, color: MUTED, isTextBox: true, margin: 0 });
    s.addNotes('スマホは「ホーム画面に追加」をしておくと、アプリのように使えます。通知は出ません。');
  })();

  slideShot('ログインする（共有PC）', 'みんなで使うPCでは、自分の名前を選んで入ります。', '01-login.png', [
    { t: '自分の名前を押す', d: '一覧から自分を選びます。番号を入れる方式ではありません。' },
    { t: '店舗を選ぶ', d: '本店か三田店か。あとから切り替えられます。' },
    { t: '交代するとき', d: '右上の「→|」でログアウトし、次の人が自分の名前を選び直します。' },
  ], {
    textW: 3.9,
    callout: {
      tone: 'hi',
      t: '自分専用の端末（個人PC・自分のスマホ）では、この画面は出ません',
      d: '自分専用として登録した端末は、開くだけで自分として使えます。この名前を選ぶ画面が出るのは共有の端末（店のPC）だけです。端末の登録の仕方は別冊「ログイン登録手順書」を見てください。番号を打つ方式はなくなりました。',
    },
    note: '本番はまだ移行期間のため、登録していない端末でも今までどおり名前を選んで入れます。',
  });

  // ══ 第2部 ══
  slideSection(2, '画面の見方', '上に並ぶ6つのボタンを覚えれば、ほぼ迷いません。');
  (() => {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, '画面のいちばん上（共通）', 'どの画面にいても、ここから移動します。');
    const im = fit('c-header.png', 0.5, 1.55, 12.33, 1.0);
    s.addImage(Object.assign({}, im, { shadow: shadow() }));
    const marks = [
      { f: 0.065, n: 1 }, { f: 0.321, n: 2 }, { f: 0.391, n: 3 }, { f: 0.461, n: 4 },
      { f: 0.531, n: 5 }, { f: 0.604, n: 6 }, { f: 0.677, n: 7 }, { f: 0.909, n: 8 },
    ];
    marks.forEach(m => numCircle(s, m.n, im.x + m.f * im.w - 0.14, im.y + im.h + 0.06, 0.28, ORANGE));
    const items = [
      ['1', 'ロゴ／版数', '今どの版かが出ます。困ったとき最初に見る所です。'],
      ['2', 'カレンダー', '1か月分を一覧します。空き状況の把握に。'],
      ['3', 'スケジュール', '1日分の予定表。いちばん使う画面です。'],
      ['4', '代車管理', '代車の空き状況と予約を見ます。'],
      ['5', '車両管理', '代車・レンタカーの車両そのものを登録します。'],
      ['6', '空き枠検索', '「来月の火曜で空いている日」を探せます。'],
      ['7', '顧客リスト', '取り込んだ顧客ファイルを見る・予約する。'],
      ['8', '本店／三田店', '店舗の切り替え。今どちらを見ているか色で分かります。'],
    ];
    const cw = (12.2 - 3 * 0.25) / 4;
    items.forEach((it, i) => {
      const x = 0.55 + (i % 4) * (cw + 0.25);
      const y = 3.35 + Math.floor(i / 4) * 1.75;
      card(s, x, y, cw, 1.55, { bg: SOFT, line: LINE });
      numCircle(s, it[0], x + 0.22, y + 0.2, 0.34, BLUE);
      s.addText(it[1], { x: x + 0.66, y: y + 0.18, w: cw - 0.9, h: 0.36, fontFace: F, fontSize: 14, bold: true, color: INK, isTextBox: true, margin: 0 });
      s.addText(it[2], { x: x + 0.22, y: y + 0.68, w: cw - 0.44, h: 0.75, fontFace: F, fontSize: 11, color: MUTED, isTextBox: true, margin: 0 });
    });
  })();

  slideShot('右上のアイコン', '左から順に、全画面・自分の名前・スタッフ管理・休業日設定・復旧・ログアウトです。', 'c-headright.png', [
    { t: '全画面', d: '画面を広く使います。もう一度押すと戻ります。' },
    { t: '頭文字と名前', d: '今ログインしている人です。作業を始める前に、自分になっているか確認してください。番号はなくなりました。' },
    { t: '人のアイコン ＝ スタッフ管理', d: 'スタッフの登録・編集をします。（管理者のみ）' },
    { t: '歯車 ＝ 休業日設定', d: '店の休業日を設定します。（管理者のみ）' },
    { t: '復旧', d: 'データを過去の時点に戻します。（管理者のみ）' },
    { t: '→| ＝ ログアウト', d: '別の人に交代するときに押します。' },
  ], { textW: 4.6 });

  slideShot('日付の動かし方', 'スケジュール画面の上にある、この帯で日付を移動します。', 'c-datenav.png', [
    { t: '‹ 前日　／　翌日 ›', d: '1日ずつ移動します。いちばんよく使います。' },
    { t: '« 前週　／　翌週 »', d: '1週間ずつ移動します。' },
    { t: '«« 先月　／　翌月 »»', d: 'およそ1か月ずつ移動します。' },
    { t: '真ん中の日付', d: '押すとカレンダーが開き、見たい日付を直接選べます。遠い日付はこちらが早いです。' },
  ], { textW: 4.6 });

  slideShot('カレンダー画面', '1か月の予約状況を一覧します。', '03-calendar.png', [
    { t: '日付の数字', d: '押すとその日のスケジュールへ移動します。' },
    { t: '色の付いた日', d: '休業日です。予約は入れられません。' },
    { t: '台数の表示', d: 'その日に何台入っているかが分かります。' },
    { t: '月の切り替え', d: '上の矢印で前月・翌月へ。' },
    { t: '車検の台数を制限する', d: 'スタッフが少ない日など、その日の車検を6台より少なくしたいとき。右上の「設定」→「🚗 台数制限設定」→ 日付と最大台数（0〜6。0は受付停止）→「✓ 台数制限を設定」。解除は同じ画面の一覧から。' },
  ], { textW: 4.4 });

  slideCards('カレンダーの切り替えと、休み・台数の設定', 'カレンダー画面には2つの表示があります。休みと台数の設定もここから行います。', [
    { t: '車検 ⇄ スタッフ休日 の切り替え', d: 'カレンダー画面の切り替えボタンで、2つの表示を行き来します。\n・車検カレンダー … その日の車検の入り具合\n・スタッフ休日カレンダー … 誰がいつ休むか', tone: 'plain' },
    { t: 'スタッフ休日の登録', d: 'スタッフ休日カレンダーで日付を選び、休むスタッフを指定します。\n休日と有給を分けて登録できます。自分の休日は誰でも登録できます。他の人の休日と今月の休日数の変更は（管理者のみ）。', tone: 'plain' },
    { t: '休業日の設定（歯車 ⚙）（管理者のみ）', d: 'ヘッダー右上の歯車から、店の休業日を決めます。\n休業日には新しい予約を入れられません（既存の予約は編集できます）。', tone: 'hi' },
    { t: '車検の台数制限（誰でも可）', d: 'カレンダー画面の「設定」→「🚗 台数制限設定」。日付と最大台数（0〜6台。0で受付停止）を選んで「✓ 台数制限を設定」。上限に達すると、その日の車検は新規予約ができなくなります。\n制限を掛けていない日は、通常どおり6台＋7台目から承認待ちです。', tone: 'hi' },
  ], { cols: 2, foot: '台数制限を掛けた日は、上限に達した時点で「🚫 台数制限に達しているため予約できません」と出ます。承認待ちにもなりません。' });

  slideShot('スケジュール（左）＝ 車検の表', '1日6台までの車検枠です。ここが予約の中心になります。', 'c-insp.png', [
    { t: 'No.', d: '1〜6が通常枠。7台目以降は承認待ちになります。ここを押すと入庫済みチェックが付きます。' },
    { t: '氏名', d: 'お客様のお名前と、下に担当スタッフ名。' },
    { t: 'コース', d: 'マッハ／クイック／レギュラーの3種類。色で見分けます。' },
    { t: '代車', d: '割り当てた代車。鍵マークは代車管理から選んだものです。' },
    { t: '入庫', d: '入庫予定の時刻。「事前入庫」の場合は日付が出ます。' },
    { t: 'クリックして追加', d: '空いている行を押すと、新しい予約カードが開きます。' },
  ], { textW: 4.3 });

  slideShot('スケジュール（右）＝ タイムスケジュール', '一般整備や点検など、時間で管理する予定です。', 'c-sched.png', [
    { t: '時間', d: '30分刻み。ここを押すと入庫済みチェックが付きます。' },
    { t: 'クリックして追加', d: '空いている時間を押すと入力画面が開きます。' },
    { t: '緑の行', d: '納車予定です。車検予約で納車日を設定すると自動で出ます。' },
    { t: '入庫制限', d: '右上のボタン。時間帯ごとに受付を止められます。' },
    { t: '印刷', d: 'その日の予定表を紙に出します。' },
  ], { textW: 4.3 });

  // ══ 第3部 ══
  slideSection(3, '予約を入れる', 'いちばん大事な操作です。入り口は2つあります。');
  slideSteps('予約を入れる ─ 全体の流れ', '入り口は2つ。どちらでも、できあがる予約は同じです。', [
    { t: '入り口を選ぶ', d: 'お客様から電話 → スケジュールから直接入れる。\n満期のお客様に案内 → 顧客リストから入れる。' },
    { t: '予約カードに入力', d: 'お名前とコースは必須。車種・入庫時間などは分かる範囲で。' },
    { t: '代車を付ける', d: '必要なら「選択」ボタンから空いている代車を選びます。' },
    { t: '保存する', d: '画面にすぐ反映されます。他のPCにも数秒で伝わります。' },
  ], { lastGreen: true, foot: '保存に失敗したときは、はっきり警告が出ます。何も出なければ成功しています。' });

  slideShot('① スケジュールから予約する', '車検の表の「クリックして追加」を押すと、この予約カードが開きます。', 'c-card-top.png', [
    { t: '氏名（必須）', d: 'お客様のお名前。ここが空だと保存できません。' },
    { t: '担当', d: 'ログイン中の自分が最初から入っています。変えたいときだけ触ります。番号入力・ダブルクリックで一覧も出せます。' },
    { t: '車種', d: '任意。分かれば入れておくと、当日の準備が楽です。' },
    { t: 'コース（必須）', d: 'マッハ／クイック／レギュラーから1つ。レギュラーは1日3台までです。' },
  ], { textW: 4.6 });

  slideShot('① 予約カード（続き）', '下半分は、代車・特典・入庫日・納車日・備考です。', 'c-card-bot.png', [
    { t: '代車・レンタカー', d: '「選択」を押すと代車管理が開き、空いている車から選べます。' },
    { t: '特典', d: '1ヶ月前予約・2ヶ月前予約・なし。該当すれば選びます。' },
    { t: '入庫時間', d: 'その日の何時に入庫するか。' },
    { t: '入庫日（事前入庫）', d: '前日などに預かる場合にチェック。その日の予定表にも出ます。' },
    { t: '納車日', d: '決まっていれば入れておくと、納車日の予定表に自動で出ます。' },
    { t: '備考', d: 'よく使う内容はボタンで足せます（Eオイル交換など）。' },
  ], { textW: 4.6 });

  slideShot('② 顧客リストから入れる', '満期のお客様を探して、そのまま予約にします。', '09-customers.png', [
    { t: '「顧客リスト」をクリック', d: '画面いちばん上の緑のボタンです。' },
    { t: 'お客様を検索して選ぶ', d: '名前・車種・ナンバーなどで探せます。' },
    { t: '予約カードに入力', d: 'お名前や車種は引き継がれます。コースと入庫時間を入れます。' },
    { t: '代車を付ける', d: '必要なら「選択」から空いている代車を選びます。ここで「🔒 限定」も付けられます。' },
    { t: '保存する', d: '保存すると、そのお客様には予約済みの印が付きます。二重に案内せずに済みます。' },
  ], { textW: 4.3 });

  slideShot('代車・レンタカーを付ける', '予約カードの「選択」から、この画面で選びます。', '05-loaner.png', [
    { t: '車を選ぶ', d: '縦が車、横が日付です。空いているところをドラッグして期間を選びます。' },
    { t: '重なりは選べない', d: '他の予約で埋まっている期間は選べません。理由も表示されます。' },
    { t: '予約確定', d: '押すと、その代車が予約に紐づきます。' },
    { t: '二重取りの警告', d: '同じ日に同じ車が2件入ると、上部に警告が出ます（v2.12から）。' },
  ], { textW: 4.1 });

  slideCards('代車の「限定」（🔒）', 'その車でないと困る予約に印を付けます。あとで説明する「最適化」で入れ替えられなくなります。', [
    { t: 'どんなときに使うか', d: 'お客様の駐車場に高さ制限があってアルトしか停められない、など\n「この車でないとダメ」という事情があるとき。', tone: 'hi' },
    { t: '付け方（2か所どちらでも）', d: '① スケジュールの予約カード … 代車欄の横の「🔓 限定」\n② 顧客リストの予約画面 … 代車を選ぶと同じボタンが出ます\n「🔒 限定中」に変わればOK。もう一度押すと解除されます。', tone: 'plain' },
    { t: '見え方', d: 'スケジュールの代車欄に 🔒 が付きます。代車管理の帯、スマホの画面にも同じ印が出ます。\n限定していない代車には、何も付きません。', tone: 'plain' },
    { t: '何が変わるか', d: '代車の「最適化」を実行しても、この予約の車は動きません。\n限定を付けていない予約だけが並べ替えの対象になります。', tone: 'ok' },
  ], { cols: 2, foot: '限定は「動かさない」だけの印です。予約そのものは、いつもどおり変更・削除できます。' });

  slideCards('代車の印の見分け方', '2つの記号が出てきます。意味が違うので、ここで覚えてください。', [
    { t: '🔒 が付いている', d: '限定した代車です。「この車でないとダメ」という印で、最適化しても入れ替わりません。', tone: 'hi' },
    { t: '何も付いていない', d: 'ふつうの代車です。最適化を実行すると、空き具合に応じて別の車に入れ替わることがあります。', tone: 'plain' },
    { t: '🔑 が付いている', d: '代車ではなく「レンタカー」です。別の管理表になります。', tone: 'plain' },
    { t: '迷ったら', d: '鍵マーク（🔑）はレンタカー、南京錠マーク（🔒）は限定。形で見分けてください。', tone: 'ok' },
  ], { cols: 2, foot: 'スケジュール・代車管理・スマホのどの画面でも、この規則は同じです。' });

  slideCards('予約を直す・日付を変える・消す', '入れたあとの操作です。慌てず、この3つを覚えてください。', [
    { t: '内容を直す', d: '予約の行をクリックすると、同じカードが開きます。直して保存し直すだけです。', tone: 'plain' },
    { t: '日付を変える', d: 'カードの中で日付を変えて保存します。元の日からは消えます。\n★代車は一緒に移動しません。元の日の代車予約は外れるので、新しい日付で入れ直してください。', tone: 'hi' },
    { t: '消す', d: '削除ボタンから消します。消した枠は空きに戻り、承認待ちの人が繰り上がります。', tone: 'ng' },
    { t: '取り消せません', d: '削除の取り消し機能はありません。消す前に、本当にその予約かをお名前で確かめてください。', tone: 'ng' },
  ], { cols: 2, foot: '万が一まとめて消えてしまった場合は、「復旧」で過去の時点に戻せます（管理者のみ・第7部）。' });

  // ══ 第4部 ══
  slideSection(4, '日々の操作', '毎日つかう、細かいけれど大事な機能です。');
  slideCards('入庫チェック', 'お客様の車が入ってきたら、その場でチェックします。', [
    { t: '車検の場合', d: '左端の「No.」の数字を押します。黄色くなって赤いチェックが付きます。', tone: 'hi' },
    { t: '一般整備の場合', d: '「時間」の欄を押します。同じく黄色＋チェックになります。', tone: 'hi' },
    { t: 'もう一度押すと解除', d: '間違えて押しても、もう一度押せば元に戻ります。', tone: 'plain' },
    { t: '反応は即時です', d: '押した瞬間に色が変わります。変わらないときは、少し待ってから画面を更新してください。', tone: 'plain' },
  ], { cols: 2, foot: '氏名の欄を押すと予約カードが開きます。チェックだけしたいときは、No.か時間の欄を押してください。' });

  slideCards('事前入庫と納車日', '「前の日に預かる」「いつ返す」を記録できます。', [
    { t: '事前入庫とは', d: '車検日の前日などに車を預かること。予約カードの「事前入庫にする」にチェックし、預かる日を選びます。', tone: 'plain' },
    { t: 'どこに出るか', d: '預かる日のタイムスケジュールに、オレンジ色の行として自動で出ます。二重に予約を作る必要はありません。', tone: 'plain' },
    { t: '納車日とは', d: '車をお返しする日。任意ですが、入れておくと当日の段取りが楽になります。', tone: 'plain' },
    { t: 'どこに出るか', d: '納車日のタイムスケジュールに、緑色の行として自動で出ます。', tone: 'ok' },
  ], { cols: 2 });

  slideShot('空き枠検索', '「来月の火曜で空いている日」をまとめて探せます。', '07-search.png', [
    { t: '種類を選ぶ', d: '車検か、タイムスケジュールか。' },
    { t: '曜日で絞る', d: 'お客様の希望曜日を選びます。選ばなければ全曜日。' },
    { t: '検索する', d: '3ヶ月先まで、最大30件の空きを一覧します。' },
    { t: 'そのまま予約', d: '出てきた日を押すと、その日のスケジュールへ移動できます。' },
  ], { textW: 3.9 });

  // ══ 第5部 ══
  slideSection(5, '管理まわり', '毎日ではないけれど、必要になる操作です。');
  slideShot('代車管理', '代車とレンタカーの空き状況を、カレンダーで見る画面です。', '05-loaner.png', [
    { t: '見方', d: '縦が車、横が日付。帯が伸びている期間は予約が入っています。' },
    { t: '帯を押す', d: '代車の貸し出し内容（期間など）を編集できます。ここから予約カードは開きません。予約そのものを直すときは、スケジュール画面から開いてください。' },
    { t: '空きを探す', d: '帯が無い所が空きです。長期で借りたい時はここで確かめます。' },
    { t: '注意', d: '1台につき1日1本の帯しか描けません。重なっている場合は上部の警告で気づいてください。' },
  ], { textW: 4.5 });

  slideSteps('代車の最適化（✨）', 'すき間を詰めて車を集約し、まとまった空きを作る機能です。', [
    { t: '基準日を決める', d: 'カレンダーの日付の見出しをクリックすると、その日が基準日になります（紫で強調）。\n\n初期値は今日です。' },
    { t: '「✨ 最適化」を押す', d: '変更案が一覧で出ます。\n\nこの時点では、まだ何も変わっていません。' },
    { t: '内容を確認する', d: 'どの予約が、どの車に移るかが並びます。\n\n納得できなければ、閉じれば何も起きません。' },
    { t: '「✓ この内容で最適化する」', d: 'ここで初めて反映されます。\n\nやり直したいときは「↶ 戻す」で1手前に戻せます。' },
  ], { lastGreen: true, foot:
    '■ 動かさないもの … ①返却済み（基準日より前に返った分）　②貸出中（基準日をまたいでいる分）　③🔒 限定を付けた予約\n' +
    '■ 動かすもの … 基準日以降に貸し出す、限定なしの予約だけ。「直前の返却がいちばん近い車」へ順に詰め直します。\n' +
    '■ ★「駐車場に高さ制限があってアルトしかダメ」のような予約には、必ず 🔒 限定 を付けてください。付けておけばその車に固定され、最適化で別の車に入れ替わることはありません。' });

  slideShot('車両管理', '代車・レンタカーの車そのものを登録・変更します。', '06-vehicles.png', [
    { t: '車を足す', d: '新しい代車を入れたら、ここで登録します。' },
    { t: '車を直す', d: 'ナンバーや車種が変わったときに直します。' },
    { t: '使わなくなった車', d: '外すと、以後の予約では選べなくなります。' },
    { t: '注意', d: '過去の予約に紐づいた車を消すと、その記録の見え方が変わることがあります。管理者に相談してください。' },
  ], { textW: 4.1 });

  slideCards('顧客リストの取り込み', 'Excelの顧客ファイルを月ごとに取り込みます。', [
    { t: '誰か1人がやれば全員に届く', d: '取り込みは全員共有です。他のPCで開くだけで同じものが見えます。自分のPCでもう一度取り込む必要はありません。', tone: 'ok' },
    { t: '「読めませんでした」と出たら', d: 'まず「サーバーから再読み込み」を押してください。多くはこれで直ります。Excelを選び直す必要はありません。', tone: 'hi' },
    { t: '時間がかかります', d: '取り込みは数十秒かかることがあります。画面を閉じずに待ってください。', tone: 'plain' },
    { t: '取り込む単位', d: '「2026年10月満期」のように月ごとのファイルを入れます。', tone: 'plain' },
  ], { cols: 2 });

  slideCards('店舗の切り替え', '右上の「本店」「三田店」ボタンで切り替えます。', [
    { t: '今どちらを見ているか', d: 'ボタンの色が変わります。予約を入れる前に必ず確認してください。', tone: 'hi' },
    { t: 'データは別々', d: '本店と三田店では、予約も代車もスタッフも別々に管理されています。', tone: 'plain' },
    { t: '休業日も別', d: '三田店は水曜が定休です。店舗ごとに設定されています。', tone: 'plain' },
    { t: 'よくある間違い', d: '本店のつもりで三田店に予約を入れてしまう事故が起きがちです。日付より先に店舗を見る習慣を。', tone: 'ng' },
  ], { cols: 2 });

  // ══ 第6部 ══
  slideSection(6, 'スマホで使う', '工場や外出先から、同じ予定を見て入力できます。');
  slideShot('スマホの開き方', '同じURLをスマホで開くと、スマホ用の画面になります。', '10-mobile-login.png', [
    { t: 'URLは同じ', d: 'PCと同じURLです。ホーム画面に追加しておくと便利です。' },
    { t: '番号でログイン', d: 'PCと違い、自分の番号を入れて入ります。番号は名札やスタッフ一覧で確認できます。' },
    { t: '見えるものは同じ', d: 'PCで入れた予約は、そのままスマホにも出ます。' },
  ], { textW: 5.6 });

  (() => {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, 'スマホの画面', '下のタブで3つの画面を行き来します。');
    const files = ['11-mobile-schedule.png', '12-mobile-calendar.png', '13-mobile-loaner.png'];
    const labels = [['スケジュール', 'その日の予定。ここから予約も入れられます。'],
                    ['カレンダー', '月の空き状況。日付を押すと移動します。'],
                    ['代車', '代車の空き状況を確認します。']];
    files.forEach((f, i) => {
      const bx = 0.9 + i * 4.1;
      const im = fit(f, bx, 1.55, 3.4, 4.25);
      s.addImage(Object.assign({}, im, { shadow: shadow() }));
      s.addText(labels[i][0], { x: bx, y: 5.9, w: 3.4, h: 0.32, fontFace: F, fontSize: 14, bold: true, color: INK, align: 'center', isTextBox: true, margin: 0 });
      s.addText(labels[i][1], { x: bx, y: 6.2, w: 3.4, h: 0.5, fontFace: F, fontSize: 10.5, color: MUTED, align: 'center', isTextBox: true, margin: 0 });
    });
    // スマホでできないこと（ユーザー指摘・2026-09-02）
    card(s, 0.9, 6.72, 11.55, 0.6, { bg: ORANGE_L, line: ORANGE });
    s.addText('スマホには顧客リストがありません。顧客リストからの予約は、PCで行ってください。',
      { x: 1.15, y: 6.72, w: 11.05, h: 0.6, fontFace: F, fontSize: 12.5, bold: true, color: ORANGE, valign: 'middle', isTextBox: true, margin: 0 });
  })();

  addTrouble();
  await pres.writeFile({ fileName: OUT_STAFF });
  console.log('出力（一般社員用）: ' + OUT_STAFF);
}

// ════════════════════════════════════════════════════════════
//  ② 管理者用（別冊。個人名は書かない＝交代しても使えるように）
// ════════════════════════════════════════════════════════════
async function buildAdmin() {
  newDeck('Hub a Nice Day 管理者マニュアル');
  const VER = 'v2.37';
  const INDIGO = '3730A3';
  const T = (s, text, o) => s.addText(text, Object.assign({ fontFace: F, isTextBox: true, margin: 0, color: INK }, o));
  const callout = (s, x, y, w, h, title, body, tone) => {
    const c = tone === 'hi' ? { bg: ORANGE_L, line: ORANGE, fg: ORANGE } : tone === 'ok' ? { bg: GREEN_L, line: GREEN, fg: GREEN }
          : tone === 'ng' ? { bg: RED_L, line: RED, fg: RED } : { bg: BLUE_L, line: BLUE, fg: BLUE };
    card(s, x, y, w, h, { bg: c.bg, line: c.line });
    T(s, title, { x: x + 0.25, y: y + 0.1, w: w - 0.5, h: 0.32, fontSize: 13, bold: true, color: c.fg });
    T(s, body, { x: x + 0.25, y: y + 0.42, w: w - 0.5, h: h - 0.5, fontSize: 11.5, valign: 'top' });
  };
  // 左に手順、右に画面
  const stepsShot = (title, sub, steps, file, opt) => {
    opt = opt || {};
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, title, sub);
    const textW = opt.textW || 4.6;
    let y = 1.55;
    steps.forEach((n, i) => {
      numCircle(s, i + 1, 0.55, y + 0.02, 0.34, n.color || ORANGE);
      T(s, n.t, { x: 1.02, y: y - 0.02, w: textW - 0.5, h: 0.36, fontSize: 14, bold: true });
      if (n.d) T(s, n.d, { x: 1.02, y: y + 0.34, w: textW - 0.5, h: n.h || 0.62, fontSize: 11, color: MUTED });
      y += (n.d ? (n.h || 0.62) + 0.36 : 0.5) + 0.12;
    });
    if (file) { const im = fit(file, 0.55 + textW + 0.25, 1.45, 12.2 - textW - 0.25, 5.6); s.addImage(Object.assign({}, im, { shadow: shadow() })); }
    if (opt.note) s.addNotes(opt.note);
    return s;
  };

  // 1 表紙
  (() => {
    const s = pres.addSlide(); s.background = { color: NAVY };
    T(s, 'Hub a Nice Day', { x: 0.9, y: 2.15, w: 11.5, h: 0.85, fontSize: 42, bold: true, color: WHITE });
    T(s, '管理者マニュアル', { x: 0.9, y: 3.0, w: 11.5, h: 0.8, fontSize: 32, bold: true, color: 'F2A97C' });
    T(s, 'スタッフの招待・端末の管理・本番とDEV・復旧　— 管理者だけが行う操作', { x: 0.9, y: 4.0, w: 11.5, h: 0.4, fontSize: 15, color: 'C6D4E8' });
    card(s, 0.9, 4.7, 8.4, 0.85, { bg: '2A1A12', line: 'C4703A' });
    T(s, '取り扱い注意：この資料は管理者以外に配らないでください。', { x: 1.2, y: 4.7, w: 7.9, h: 0.85, fontSize: 13, bold: true, color: 'F2A97C', valign: 'middle' });
    T(s, '緑モータース　2026年9月版（' + VER + '）　／　一般の操作は「取扱説明書」、登録は「ログイン登録手順書」をご覧ください', { x: 0.9, y: 6.5, w: 11.5, h: 0.35, fontSize: 11, color: '7E92AE' });
  })();

  // 2 管理者だけができること
  slideCards('管理者だけができること', '一般スタッフの画面には出てこない操作です。管理者かどうかは「管理者名簿」で決まります。', [
    { t: 'ログイン用メールの登録と招待', d: 'スタッフごとに会社のメールを登録し、招待メールを送ります。本人はリンクと6桁だけで登録できます。', tone: 'hi' },
    { t: '端末の確認と取り消し', d: '誰がどの端末で登録済みかを見る。紛失・退職のときは、その場で使えなくします。', tone: 'hi' },
    { t: '管理者名簿', d: '管理者を足す・外す。名簿に載っている人だけが、このコンソールと管理操作を使えます。', tone: 'plain' },
    { t: '休業日・台数制限・他の人の休日', d: '一般スタッフは自分の休日だけ。休業日や他の人の休日、日ごとの台数上限は管理者だけ。', tone: 'plain' },
    { t: 'データの復旧', d: 'まとめて消えた・おかしくなったときに、過去の時点へ戻します。', tone: 'plain' },
    { t: '本番とDEVの切り替え', d: '同じコンソールで、テスト環境（DEV）と本番を切り替えて扱います。', tone: 'plain' },
  ], { cols: 3, foot: '端末の登録は「端末ごと」です。管理者も、自分のPCとスマホでそれぞれ登録します。共有端末（店のPC）で開いた時は、誰であっても管理者扱いになりません（誰が座っているか分からないため）。' });

  // 3 開き方
  stepsShot('管理者コンソールの開き方', 'スケジュール画面とは別のページです。自分の端末（自分専用のPC・スマホ）から開きます。', [
    { t: 'URLを開く', d: 'DEV：midorimotor-inc.github.io/hub-a-nice-day-dev/admin.html\n（本番はこの中で切り替えます。10ページ参照）', h: 0.75, color: BLUE },
    { t: '管理者のメールアドレスを入れる', d: '管理者名簿に載っているアドレスだけ通ります。', color: BLUE },
    { t: '届いた6桁を入れる', d: 'これでこの端末が「管理者として本人確認済み」になり、スケジュール画面にもそのまま入れます。', color: BLUE },
    { t: '2回目からはログイン不要', d: '同じブラウザで開けば、そのまま入れます。本番とDEVのどちらにも入れます。別のブラウザ・別の窓は未登録扱いです。', color: BLUE },
  ], 'admin-1-login.png', { textW: 5.0 });

  // 4 本番／DEV（画面の見方の前に。まずどちらを触っているかを知る）
  (() => {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, '本番とDEVの切り替えと、画面の違い', '1つのコンソールの中に本番とDEVがあります。緑＝DEV（テスト環境）、青＝本番。ログインは1回だけ。');
    const im1 = fit('admin-2-staff.png', 0.55, 1.5, 6.0, 3.4); s.addImage(Object.assign({}, im1, { shadow: shadow() }));
    const im2 = fit('admin-8-prod-staff.png', 6.8, 1.5, 6.0, 3.4); s.addImage(Object.assign({}, im2, { shadow: shadow() }));
    T(s, 'DEV（緑）— 開いたときはいつもこちら', { x: 0.55, y: 4.95, w: 6.0, h: 0.35, fontSize: 13, bold: true, color: GREEN });
    T(s, '本番（青）— 「本番に切り替える」で入る', { x: 6.8, y: 4.95, w: 6.0, h: 0.35, fontSize: 13, bold: true, color: BLUE });
    callout(s, 0.55, 5.4, 4.0, 1.7, '切り替え方', 'ヘッダー右（ログイン画面にもあります）の「本番に切り替える」。確認が1回出ます。戻るときは「DEVに戻る」。', '');
    callout(s, 4.65, 5.4, 4.0, 1.7, '開き直すと必ずDEVに戻る', '本番を記憶しません。押し間違いで本番のスタッフに招待が飛ぶ事故を防ぐためです。', 'hi');
    callout(s, 8.75, 5.4, 4.0, 1.7, 'ログインは1回で両方', 'どちらでログインしても、本番とDEVの両方に入れます（切り替えてもメール→6桁は聞かれません）。ただしスタッフ表・端末台帳・招待は環境ごとに別のデータです。', 'ok');
  })();

  // 4 画面の見方
  stepsShot('画面の見方', '上の帯と左上の色で、いま「DEV（緑）」か「本番（青）」かが分かります。', [
    { t: '本人認証の進み具合', d: '「登録済み／招待したが未登録／メール未入力／操作しない」の人数。全員が登録済みになれば、名前を選ぶだけのログインを止められます。', h: 0.9 },
    { t: 'スタッフと招待', d: '一人ずつ「操作するか」「メール」「使う端末」を決め、招待を送る場所。' },
    { t: '登録端末', d: '本人確認を済ませた端末の一覧。取り消しもここ。' },
    { t: '管理者', d: '管理者名簿の追加・削除。' },
    { t: '行の色（左端の縦線）', d: '緑＝登録済み、橙＝招待したが未登録、灰＝メール未入力。' },
  ], 'admin-2-staff.png', { textW: 4.8 });

  // 5 招待の手順
  slideSteps('スタッフを招待する　— 全体の流れ', '管理者が①〜③、本人が④、確認が⑤。本人の作業は「ログイン登録手順書」に沿って1〜2分です。', [
    { t: 'スタッフを登録する', d: '新しい人が入ったら、まずスケジュール画面の「⚙️ スタッフ設定 → 新規登録」で氏名・バッジ・対応業務を登録します（番号は自動で付きます）。' },
    { t: 'メールと「使う端末」を決める', d: 'コンソールの行の「設定」を開き、会社のメールアドレスと、使う端末（個人端末／共有PC）を決めて保存。' },
    { t: '「招待を送る」', d: '送る前にアドレスの読み合わせが出ます。本人に、印つきのリンクと6桁が届きます（6桁は24時間有効、リンクは30日）。' },
    { t: '本人が登録する', d: 'リンクを開いて6桁を入れるだけ。PCとスマホは別々に1回ずつ。' },
    { t: '「登録端末」で確認', d: '本人の端末が並べば完了。一人がPCとスマホで2行になるのは正常です。' },
  ], { lastGreen: true, foot: '複数人にまとめて送る場合は「未登録のN人にまとめて招待」。同じアドレスへの送信は1時間に5通までです（連打しても止まります）。' });

  // 6 設定ダイアログ
  stepsShot('「設定」— メールと使う端末', '本人が迷わないよう、管理者が先に決めておきます。', [
    { t: 'ログイン用メール', d: '会社のアドレス。1人1つ。PCもスマホも同じアドレスで登録します。カンマ・空白が混じると保存できません。', h: 0.75 },
    { t: '使う端末：個人端末', d: '本人専用のPC・スマホ。登録すると開くだけで本人として入れる。', color: GREEN },
    { t: '使う端末：共有PC1 など', d: '店の共有端末。名前を選んで使う端末。端末名は「登録端末」タブの「＋ 共有端末を追加」で先に作っておく。', h: 0.75 },
    { t: '両方に印を付けると', d: '本人の登録時に「どちらの端末か」を聞きます。何も決めていなければ、本人が自分で選びます。', h: 0.62 },
  ], 'admin-3-edit.png', { textW: 5.0 });

  // 7 招待の確認
  stepsShot('「招待を送る」— 送る前の読み合わせ', '打ち間違いのアドレスに送ると、本人に届かないまま気づけません。ここで必ず確認します。', [
    { t: 'アドレスを声に出して確認', d: 'midori-m.com の綴り、名前の部分、ドット・ハイフンの位置。' },
    { t: '「送る」', d: '本人のメールに、印つきリンク・6桁・手順が届きます。' },
    { t: '届かないと言われたら', d: '迷惑メールフォルダ → アドレスの綴り → もう一度「招待を送る」。1時間5通の上限に当たると「送信が続いています」と出ます。', h: 0.85 },
    { t: '状態が「招待したが未登録」のまま', d: '本人がまだ登録していないだけ。手順書を渡して案内してください。' },
  ], 'admin-4-invite.png', { textW: 5.0 });

  // 8 共有端末の名前
  stepsShot('「登録端末」— 共有端末の名前', '店のPC・タブレットは「端末」として登録します。人と同じくメールで本人確認します。', [
    { t: '「＋ 共有端末を追加」', d: '端末名（共有PC1 など）と店舗、登録用のメール（店の共用アドレス）を入れます。' },
    { t: '「招待を送る」', d: 'その端末の前で、届いたリンク → 6桁 で登録。以後その端末では、操作する人を名前で選ぶだけ。', h: 0.62 },
    { t: 'ここで決めた名前が選択肢になる', d: 'スタッフの「設定」→「使う端末」に、この名前が並びます。書き方がばらつきません。', h: 0.62 },
    { t: '個人のスマホには付けない', d: '自分専用の端末は名前を持ちません。ここに登録する必要もありません。' },
  ], 'admin-5-devnames.png', { textW: 5.0 });

  // 9 登録端末タブ
  stepsShot('「登録端末」— 誰が、どの端末で', '本人確認を済ませた端末が並びます。ここが台帳です。', [
    { t: '端末・種類', d: 'Windows／iPhone などと、自分専用・共有・端末名。' },
    { t: '登録日・最終利用・失効まで', d: '期限は「最後に使った日から90日」。毎日使う人は切れません。3か月放置した端末（買い替え前のPCなど）だけ自然に失効します。', h: 0.85 },
    { t: '同じ人が2行', d: 'PCとスマホで1行ずつ＝正常。同じPCで登録し直した分は自動で置き換わり、増えません。', h: 0.62 },
    { t: '「取り消し」', d: '押した瞬間から、その端末は使えなくなります。本人が使い続ける場合は登録し直してもらえば元どおり（データは消えません）。', h: 0.75 },
  ], 'admin-5-devices.png', { textW: 5.0 });

  // 9 取り消し・登録解除・退職
  slideCards('取り消し・登録解除・退職・機種変更', '場面ごとに押すボタンが違います。', [
    { t: 'スマホを失くした', d: '「登録端末」でその端末を「取り消し」。即時に無効。本人は新しいスマホで登録し直せば元どおり。', tone: 'hi' },
    { t: '退職した', d: '「スタッフと招待」の行の「登録解除」。その人の端末を全部取り消し、ログイン用メールを消します。スタッフ表の名前と過去の予約は残ります。\n退職日に必ず押してください（期限では自動で切れません）。', tone: 'ng' },
    { t: '機種変更・PCの入れ替え', d: '本人が新しい端末で登録（招待メールのリンク → 送り直す → 6桁）。古い端末の行は管理者が「取り消し」。', tone: 'plain' },
    { t: '共有PCが「自分専用」になっていた', d: '「登録端末」の種類で気づけます。そのPCでもう一人が登録すると自動で共有に戻ります。急ぐなら取り消して登録し直し。', tone: 'plain' },
  ], { cols: 2, foot: '「登録解除できませんでした」と出たら：この端末の管理者登録が無効になっています（別の端末から取り消された等）。画面がログインに戻るので、ログインし直してから同じ操作をしてください。' });

  // 10 管理者名簿
  stepsShot('「管理者」— 名簿の追加と削除', '管理者はプログラムに書かれているのではなく、この名簿で決まります。交代のときはここを変えます。', [
    { t: '追加', d: 'メールアドレスと、スタッフ表の誰かを選んで「追加」。その人は次のログインから管理者です。' },
    { t: '削除', d: '最後の1人は削除できません（誰も入れなくなるため）。' },
    { t: '管理者になると', d: 'コンソールに入れる／休業日・他人の休日・台数制限・復旧・スタッフ設定が使える。予約や代車は全員が使えます。', h: 0.75 },
    { t: '共有端末では管理者扱いにならない', d: '店のPCでは誰が座っているか分からないため。管理者の作業は自分の端末かこのコンソールから。', h: 0.62 },
  ], 'admin-6-admins.png', { textW: 5.0 });

  // 12 認証を必須にする
  slideSteps('本人認証を「必須」にする　— 順番を守ってください', '今は移行期間（本番）：登録していない人も今までどおり名前を選んで入れます。必須にする作業はシステム担当と一緒に行います。', [
    { t: '全員が「登録済み」か確認', d: 'コンソールの進み具合バーが全員「登録済み」（操作しない人は除く）。PCとスマホの両方を使う人は両方。' },
    { t: '画面側を必須に切り替える', d: 'システム担当の作業（AUTH_REQUIRED を true にして配信）。この瞬間から、登録していない端末では「この端末にスタッフを追加」画面が先に出ます。' },
    { t: 'サーバー側のスイッチを入れる', d: 'システム担当の作業（GAS の HUB_AUTH_ENFORCE）。URLを知っているだけの人は一切操作できなくなります。反映は最大60秒。' },
    { t: '困ったらスイッチを戻す', d: '症状が出たら、まず③のスイッチを消すのが最速（60秒で元どおり）。②は配信し直しになるので、③から戻します。' },
  ], { lastGreen: false, foot: '逆の順番（先にサーバーのスイッチ）で入れると、登録していない人が全員入れなくなります。DEVで先に同じ手順を試してから本番に入れます（DEVはすでに②まで済み）。' });

  // 13 復旧
  slideCards('データの復旧', 'まとめて消えた・おかしくなった、というときの最後の手段です。', [
    { t: 'まず落ち着く', d: 'データは30分ごとに自動保存され、毎晩バックアップも取っています。ほとんどの場合、戻せます。', tone: 'ok' },
    { t: 'どこから', d: 'スケジュール画面右上の「復旧」ボタン（管理者にだけ表示）。', tone: 'plain' },
    { t: '選べる戻し方', d: '全部を過去の時点に戻す／消えた予約だけを足す／店舗ごとに戻す、の3通り。', tone: 'plain' },
    { t: '迷ったら', d: '操作する前に、他のスタッフの入力を止めてください。戻した後の入力が消えることがあります。', tone: 'ng' },
  ], { cols: 2 });

  // 14 困ったとき（管理者向け）
  (() => {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, '困ったとき（管理者向け）', '一般スタッフ向けの「困ったとき」は取扱説明書・登録手順書にあります。');
    const rows = [
      ['「登録解除できませんでした」', 'この端末の管理者登録が無効（別端末から取り消された等）。ログイン画面に戻るので、ログインし直して同じ操作を。'],
      ['「読み込んでいます…」のまま長い', 'サーバー（Google）が混んでいます。40秒×3回まで自動で送り直し、だめなら「もう一度読み込む」が出ます。時間をおいて再度。'],
      ['同じ人の行が増えた', 'PC＋スマホの2行は正常。LINEやメールの中のブラウザで登録すると別の行になります。使っていない行は「取り消し」。'],
      ['招待メールが届かない', '迷惑メール → 綴り → もう一度「招待を送る」。同じアドレスは1時間5通まで。'],
      ['本人が「期限切れ」と言う', '6桁は24時間。本人の画面の「コードを送り直す」で新しい6桁が届きます（管理者の操作は不要）。'],
      ['スマホのアイコンから開くと登録画面が出る', 'iPhone は Safari とホーム画面のアイコンで保管場所が別。登録手順書の「ホーム画面に追加」の手順（30分以内）をやり直してもらう。'],
      ['共有PCで管理操作ができない', '仕様です。共有端末では管理者扱いになりません。自分の端末かコンソールから。'],
    ];
    const y0 = 1.45, rh = 0.76;
    rows.forEach((r, i) => {
      const y = y0 + i * rh;
      s.addShape(pres.ShapeType.rect, { x: 0.55, y, w: 12.2, h: rh, fill: { color: i % 2 ? WHITE : SOFT }, line: { color: LINE, width: 0.5 } });
      T(s, r[0], { x: 0.75, y: y + 0.08, w: 4.3, h: rh - 0.16, fontSize: 12, bold: true, valign: 'middle' });
      T(s, r[1], { x: 5.2, y: y + 0.08, w: 7.4, h: rh - 0.16, fontSize: 11, valign: 'middle' });
    });
  })();

  // 15 交代
  slideCards('管理者が交代するとき', '引き継ぎで漏れやすい項目です。', [
    { t: '管理者名簿', d: 'コンソールの「管理者」タブで、新しい人を追加してから前任者を削除（最後の1人は消せません）。', tone: 'hi' },
    { t: '通知メールの宛先', d: '保存失敗の通知先が前任者のままだと、誰も異常に気づけません。', tone: 'hi' },
    { t: 'この資料の受け渡し', d: '新しい管理者へ渡し、前任者の手元からは削除してください。', tone: 'plain' },
    { t: 'GitHub・Googleの管理', d: 'システムの配信元と保存先。会社アカウント（hubaniceday.system@gmail.com）で一元管理します。', tone: 'plain' },
  ], { cols: 2 });

  // 16 結び
  (() => {
    const s = pres.addSlide(); s.background = { color: NAVY };
    T(s, '判断に迷ったら、実行前に相談を', { x: 0.9, y: 2.6, w: 11.5, h: 0.8, fontSize: 32, bold: true, color: WHITE });
    T(s, '取り消し・登録解除・復旧・本番の操作は、他のスタッフの作業に影響します。\n急いで実行するより、状況を確認してからのほうが安全です。',
      { x: 0.9, y: 3.5, w: 11.0, h: 1.0, fontSize: 15, color: 'C6D4E8', lineSpacingMultiple: 1.4 });
    T(s, 'Hub a Nice Day　管理者マニュアル　2026年9月版（' + VER + '）', { x: 0.9, y: 6.5, w: 11.5, h: 0.35, fontSize: 11, color: '7E92AE' });
  })();

  await pres.writeFile({ fileName: OUT_ADMIN });
  console.log('出力（管理者用）　: ' + OUT_ADMIN);
}

// ════════════════════════════════════════════════════════════
//  第7部「困ったとき」＝ 一般社員用の最後に付ける
// ════════════════════════════════════════════════════════════
function addTrouble() {
  slideSection(7, '困ったとき', 'よくある症状と、正しい伝え方。');
  slideCards('「保存できていません」と出たら', 'この警告は、本当に保存されていないときにだけ出ます。', [
    { t: 'まず、もう一度保存', d: '同じ予約をもう一度開いて保存し直してください。多くはこれで入ります。', tone: 'hi' },
    { t: '画面を強制リロード', d: 'Ctrl キーと Shift キーを押しながら R。スマホは一度閉じて開き直します。', tone: 'plain' },
    { t: 'それでも駄目なら', d: '管理者に連絡してください。同じ内容のメールが自動で管理者にも届いています。', tone: 'plain' },
    { t: 'やってはいけない', d: '警告を無視して次の作業に進むこと。その予約は入っていません。', tone: 'ng' },
  ], { cols: 2 });

  slideCards('表示がおかしいと感じたら', '「直したはずなのに直っていない」の多くは、古い画面のままです。', [
    { t: '① バージョンを見る', d: '画面左上、ロゴの右の「v2.18」。ここが最新かどうかが最初の手掛かりです。', tone: 'hi' },
    { t: '② 強制リロード', d: 'Ctrl + Shift + R。古い画面が残っていると、直したはずの不具合がそのまま出ます。', tone: 'hi' },
    { t: '③ URLを確かめる', d: 'ブックマークが古いURLを指していないか。正しくは midorimotor-inc.github.io です。', tone: 'plain' },
    { t: '④ それでも変なら報告', d: '次のページの書き方で伝えてください。原因を早く特定できます。', tone: 'plain' },
  ], { cols: 2 });

  slideCards('不具合・改善要望の伝え方', 'この5つが揃っていると、原因の特定が一気に早くなります。', [
    { t: '1　いつ', d: '「9月1日の10時ごろ」。だいたいで構いません。時間が分かると記録を追えます。', tone: 'plain' },
    { t: '2　どの画面で', d: '「スケジュール画面」「顧客リスト」「スマホの代車」など。PCかスマホかも。', tone: 'plain' },
    { t: '3　何をしたら', d: '「3行目に沖田さんを保存したら」。押した順番が分かるのが理想です。', tone: 'hi' },
    { t: '4　どうなった', d: '「4行目にも同じ名前が出た」。期待と違った点を、見たままに。', tone: 'hi' },
    { t: '5　バージョン', d: '画面左上の「v2.18」。古い画面が原因のことが本当に多いので、必ず。', tone: 'ok' },
    { t: '＋　写真かスクリーンショット', d: 'できれば添えてください。その画面をスマホで撮る、またはスクリーンショットを送るのが、いちばん確実です。文章より早いこともあります。', tone: 'ok' },
  ], { cols: 3, foot: '「動かない」「おかしい」だけだと、どこを調べればよいか分からず、確認のやり取りが増えてしまいます。' });

  (() => {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, '報告のひな形', 'これをコピーして、埋めて送ってください。');
    card(s, 0.55, 1.55, 6.05, 4.6, { bg: SOFT, line: LINE });
    s.addText('■ 良い例', { x: 0.85, y: 1.75, w: 5.4, h: 0.35, fontFace: F, fontSize: 15, bold: true, color: GREEN, isTextBox: true, margin: 0 });
    s.addText(
      '9月1日 10時ごろ\nPCのスケジュール画面（本店・v2.18）\n\n9/1の車検3行目に「沖田」を保存したら、\n4行目にも同じ「沖田」が出ました。\n数秒で消えましたが、毎回起きます。\n\n2台目の「西田」でも同じでした。',
      { x: 0.85, y: 2.2, w: 5.45, h: 3.7, fontFace: F, fontSize: 12.5, color: INK, isTextBox: true, margin: 0, lineSpacingMultiple: 1.3 });

    card(s, 6.9, 1.55, 5.85, 4.6, { bg: RED_L, line: RED });
    s.addText('■ 困る例', { x: 7.2, y: 1.75, w: 5.2, h: 0.35, fontFace: F, fontSize: 15, bold: true, color: RED, isTextBox: true, margin: 0 });
    s.addText(
      '「予約がバグってる」\n「なんか変」\n「昨日から使えない」\n\n→ どの画面か、何をしたか、\n　 いつのことかが分からないため、\n　 まず聞き返すところから始まります。\n\n→ 原因にたどり着くまでに\n　 何往復もかかってしまいます。',
      { x: 7.2, y: 2.2, w: 5.25, h: 3.7, fontFace: F, fontSize: 12.5, color: INK, isTextBox: true, margin: 0, lineSpacingMultiple: 1.3 });

    s.addText('改善の要望も同じです。「こうしたい」だけでなく「今こうしていて、こう困っている」まで書いていただけると、より良い形で実現できます。',
      { x: 0.55, y: 6.4, w: 12.2, h: 0.6, fontFace: F, fontSize: 12, color: MUTED, isTextBox: true, margin: 0 });
  })();

  (() => {
    const s = pres.addSlide(); s.background = { color: NAVY };
    s.addText('困ったら、遠慮なく', { x: 0.9, y: 2.6, w: 11.5, h: 0.8, fontFace: F, fontSize: 34, bold: true, color: WHITE, isTextBox: true, margin: 0 });
    s.addText('操作を間違えても、データはほとんどの場合すぐ元に戻せます。\n分からないまま進めるより、聞いてください。',
      { x: 0.9, y: 3.5, w: 11.0, h: 1.0, fontFace: F, fontSize: 15, color: 'C6D4E8', isTextBox: true, margin: 0, lineSpacingMultiple: 1.4 });
    s.addText('Hub a Nice Day　取扱説明書　2026年9月版（v2.37）', { x: 0.9, y: 6.5, w: 11.5, h: 0.35, fontFace: F, fontSize: 11, color: '7E92AE', isTextBox: true, margin: 0 });
  })();
}

(async () => {
  await loadDims();
  fs.mkdirSync(OUTDIR, { recursive: true });
  const only = process.argv[2];
  if (!only || only === 'staff') await buildStaff();
  if (!only || only === 'admin') await buildAdmin();
})();
