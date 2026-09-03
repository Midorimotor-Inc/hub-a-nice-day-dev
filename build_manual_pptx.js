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
  s.addText('緑モータース　2026年9月版（v2.18）', { x: 0.9, y: 6.5, w: 11.5, h: 0.35, fontFace: F, fontSize: 11, color: '7E92AE', isTextBox: true, margin: 0 });
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
  ], { cols: 4, foot: '画面の写真は実物です。お客様のお名前だけ、架空の名前に置き換えています。　※管理者向けの操作は別冊にまとめてあります。' });

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
      d: '認証の導入後は、自分専用として登録した端末は開くだけで使えるようになります。この名前を選ぶ画面が出るのは共有の端末だけです。　※現在は認証の導入前なので、すべての端末でこの画面が出ます。',
    },
    note: '認証導入後、この画面は共有端末だけのものになります。導入前の現在は、個人の端末でも同じ画面が出ます。',
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
    { t: '番号と名前', d: '今ログインしている人です。作業を始める前に、自分になっているか確認してください。' },
    { t: '人のアイコン ＝ スタッフ管理', d: 'スタッフの登録・編集をします。' },
    { t: '歯車 ＝ 休業日設定', d: '店の休業日を設定します。' },
    { t: '復旧', d: '管理者にだけ表示されます。データを過去の時点に戻します。' },
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
  ], { textW: 3.9 });

  slideCards('カレンダーの切り替えと、休み・台数の設定', 'カレンダー画面には2つの表示があります。休みと台数の設定もここから行います。', [
    { t: '車検 ⇄ スタッフ休日 の切り替え', d: 'カレンダー画面の切り替えボタンで、2つの表示を行き来します。\n・車検カレンダー … その日の車検の入り具合\n・スタッフ休日カレンダー … 誰がいつ休むか', tone: 'plain' },
    { t: 'スタッフ休日の登録', d: 'スタッフ休日カレンダーで日付を選び、休むスタッフを指定します。\n休日と有給を分けて登録できます。', tone: 'plain' },
    { t: '休業日の設定（歯車 ⚙）', d: 'ヘッダー右上の歯車から、店の休業日を決めます。\n休業日には新しい予約を入れられません（既存の予約は編集できます）。', tone: 'hi' },
    { t: '車検の台数制限', d: '日ごとに「その日は最大◯台まで」を決められます。上限に達すると、その日の車検は新規予約ができなくなります。\n制限を掛けていない日は、通常どおり6台＋7台目から承認待ちです。', tone: 'hi' },
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
  ], { cols: 2, foot: '万が一まとめて消えてしまった場合は、管理者が「復旧」で過去の時点に戻せます（第7部）。' });

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

  (() => {
    const s = pres.addSlide(); s.background = { color: NAVY };
    s.addText('Hub a Nice Day', { x: 0.9, y: 2.15, w: 11.5, h: 0.85, fontFace: F, fontSize: 42, bold: true, color: WHITE, isTextBox: true, margin: 0 });
    s.addText('管理者マニュアル', { x: 0.9, y: 3.0, w: 11.5, h: 0.8, fontFace: F, fontSize: 32, bold: true, color: 'F2A97C', isTextBox: true, margin: 0 });
    s.addText('管理者に設定された方だけが使える操作をまとめています。', { x: 0.9, y: 4.0, w: 11.5, h: 0.4, fontFace: F, fontSize: 15, color: 'C6D4E8', isTextBox: true, margin: 0 });
    card(s, 0.9, 4.7, 8.4, 0.85, { bg: '2A1A12', line: 'C4703A' });
    s.addText('取り扱い注意：この資料は管理者以外に配らないでください。', { x: 1.2, y: 4.7, w: 7.9, h: 0.85, fontFace: F, fontSize: 13, bold: true, color: 'F2A97C', valign: 'middle', isTextBox: true, margin: 0 });
    s.addText('緑モータース　2026年9月版（v2.18）　／　一般の操作は「取扱説明書」をご覧ください', { x: 0.9, y: 6.5, w: 11.5, h: 0.35, fontFace: F, fontSize: 11, color: '7E92AE', isTextBox: true, margin: 0 });
  })();

  slideCards('管理者だけができること', '一般のスタッフの画面には出てこない機能です。', [
    { t: 'スタッフの登録・編集', d: '入社・退社にあわせて、名前と番号を登録します。', tone: 'plain' },
    { t: 'ログインの招待', d: '（準備中）各スタッフのログイン用メールを登録し、端末を承認します。', tone: 'hi' },
    { t: '端末の取り消し', d: '（準備中）紛失・退職した人の端末を、その場で使えなくします。', tone: 'hi' },
    { t: 'データの復旧', d: 'まとめて消えたときに、過去の時点へ戻します。', tone: 'plain' },
    { t: '休業日・台数制限', d: '休業日の設定、日ごとの受付台数の上限。', tone: 'plain' },
    { t: '通知メールの登録', d: '保存に失敗したときの連絡先を設定します。', tone: 'plain' },
  ], { cols: 3, foot: '管理者は設定で決まります。交代した場合は、システム側の管理者設定も併せて変更してください。' });

  slideSteps('【準備中】ログイン招待の手順', 'スタッフ1人につき、この4段階です。管理者が①、本人が②③、以後は④。', [
    { t: 'メールを登録する', d: '管理者：スタッフ管理を開き、その人の「ログイン用メール」を入れて保存します。\n\nここに入っていない人はログインできません。' },
    { t: '本人がアドレスと端末の種類を選ぶ', d: '本人：ログイン画面で「＋ 追加」を押し、自分のメールアドレスを入れます。名前や番号は入力しません。\n\nあわせて、その端末が「自分専用」か「共有」かを選びます。' },
    { t: '届いた6桁を入れる', d: '本人：メールに届いた6桁の数字を入力します。\n\n本人にしか届かないので、これが本人確認になります。' },
    { t: '90日間そのまま使える', d: '自分専用の端末なら、以後は開くだけで使えます。共有の端末では名前を選びます。\n\n90日たつと、もう一度②③をお願いします。' },
  ], { lastGreen: true, foot:
    '■ ②③の代わりにQRコードでも登録できます … 確認済みのPC画面にQRを出し、それを自分のスマホで読むだけ。メールを待たずに済みます。\n' +
    '■ 端末の種類は、その端末で最初に登録する人が1回選べば、以後は固定です。2人目以降は選ぶ必要がありません。　※準備中の機能です。開始時にあらためて案内します。' });

  slideCards('端末の種類（自分専用／共有）', 'ログイン画面を出すかどうかは、ここで決まります。', [
    { t: '自分専用', d: 'その人だけが使う端末。自分のスマホ、個人に割り当てたPCなど。\n開くだけで使えます（ログイン画面なし）。', tone: 'ok' },
    { t: '共有', d: '複数のスタッフが使う端末。店のPCなど。\n名前を選ぶ画面が出ます（本人確認を済ませた人だけが並びます）。', tone: 'plain' },
    { t: '初期選択は「共有」', d: '迷ったらそのままで構いません。名前を選ぶ手間が増えるだけで、事故にはなりません。\n「自分専用」は意識して選ぶ形にしています。', tone: 'hi' },
    { t: '管理者は点検する側', d: '端末一覧に種類が出ます。店のPCが「自分専用」になっていたら、そこで気づいて直せます。\n設定し直しは、その端末の設定からできます。', tone: 'hi' },
  ], { cols: 2, foot: 'なぜ選ばせるのか：共有PCで最初の1人しか登録していない段階だと、自動判定では「専用」と誤認し、次に座った人が前の人の名義で入力してしまいます。それを防ぐためです。' });

  slideCards('【準備中】端末の取り消し', 'スマホを失くした・退職した、というときの操作です。', [
    { t: 'どこで', d: 'スタッフ管理の「登録済みの端末」一覧。誰のどの端末が、どの種類（自分専用／共有）で、いつまで有効かが並んでいます。', tone: 'plain' },
    { t: 'どうする', d: '該当の端末の「取り消し」を押すだけです。確認のうえ実行されます。', tone: 'hi' },
    { t: 'いつ効くか', d: 'すぐです。その端末は次の操作から一切使えなくなります。', tone: 'ok' },
    { t: '本人が困らないように', d: '機種変更の場合は、新しい端末で②③をやり直してもらえば元どおりです。データは何も失われません。', tone: 'plain' },
  ], { cols: 2 });

  slideCards('データの復旧', 'まとめて消えた・おかしくなった、というときの最後の手段です。', [
    { t: 'まず落ち着く', d: 'データは30分ごとに自動保存され、毎晩バックアップも取っています。ほとんどの場合、戻せます。', tone: 'ok' },
    { t: 'どこから', d: '画面右上の「復旧」ボタン（管理者にだけ表示）。', tone: 'plain' },
    { t: '選べる戻し方', d: '全部を過去の時点に戻す／消えた予約だけを足す／店舗ごとに戻す、の3通りがあります。', tone: 'plain' },
    { t: '迷ったら', d: '操作する前に、他のスタッフの入力を止めてください。戻した後の入力が消えることがあります。', tone: 'ng' },
  ], { cols: 2 });

  slideCards('管理者が交代するとき', '引き継ぎで漏れやすい項目です。', [
    { t: 'システム側の管理者設定', d: '「復旧」やスタッフ管理が使えるのは、システムに管理者として登録された人だけです。交代時は必ず入れ替えてください。', tone: 'hi' },
    { t: '通知メールの宛先', d: '保存失敗の通知先が前任者のままだと、誰も異常に気づけません。', tone: 'hi' },
    { t: 'この資料の受け渡し', d: '新しい管理者へ渡し、前任者の手元からは削除してください。', tone: 'plain' },
    { t: 'GitHub・Googleの管理', d: 'システムの配信元と保存先のアカウント情報。会社アカウントで一元管理します。', tone: 'plain' },
  ], { cols: 2 });

  (() => {
    const s = pres.addSlide(); s.background = { color: NAVY };
    s.addText('判断に迷ったら、実行前に相談を', { x: 0.9, y: 2.6, w: 11.5, h: 0.8, fontFace: F, fontSize: 32, bold: true, color: WHITE, isTextBox: true, margin: 0 });
    s.addText('復旧や端末の取り消しは、他のスタッフの作業に影響します。\n急いで実行するより、状況を確認してからのほうが安全です。',
      { x: 0.9, y: 3.5, w: 11.0, h: 1.0, fontFace: F, fontSize: 15, color: 'C6D4E8', isTextBox: true, margin: 0, lineSpacingMultiple: 1.4 });
    s.addText('Hub a Nice Day　管理者マニュアル　2026年9月版（v2.18）', { x: 0.9, y: 6.5, w: 11.5, h: 0.35, fontFace: F, fontSize: 11, color: '7E92AE', isTextBox: true, margin: 0 });
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
    s.addText('Hub a Nice Day　取扱説明書　2026年9月版（v2.18）', { x: 0.9, y: 6.5, w: 11.5, h: 0.35, fontFace: F, fontSize: 11, color: '7E92AE', isTextBox: true, margin: 0 });
  })();
}

(async () => {
  await loadDims();
  fs.mkdirSync(OUTDIR, { recursive: true });
  await buildStaff();
  await buildAdmin();
})();
