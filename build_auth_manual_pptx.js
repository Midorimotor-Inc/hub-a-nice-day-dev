// Hub a Nice Day ログイン登録手順書（PowerPoint）を生成する。
//   素材: manual_shots/auth-*.png（capture_auth_shots.js で作成。GASは模擬）
//   実行: node capture_auth_shots.js && node build_auth_manual_pptx.js
//   出力: C:\Users\A\Documents\Hub取扱説明書\Hub_ログイン登録手順書.pptx
//
// 方針（ユーザー指示 2026-09-16）：PC・iPhone・Android で手順を統一する。
//   ・PC … メールのリンクは Edge で開く（いつも使う Edge）
//   ・iPhone … Safari で登録し、ホーム画面に追加してアイコンから使う
//   ・Android … Chrome で登録し、ホーム画面に追加
//   配色・部品は build_manual_pptx.js（取扱説明書）と揃える。
const path = require('path');
const fs = require('fs');

let pptxgen; try { pptxgen = require('pptxgenjs'); } catch (e) {
  try { pptxgen = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'pptxgenjs')); }
  catch (e2) { console.error('pptxgenjs が必要です:  cd "%LOCALAPPDATA%\\Temp\\hub-verify" && npm i pptxgenjs'); process.exit(1); }
}
let sharp; try { sharp = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'sharp')); } catch (e) { sharp = null; }

const SHOTS = path.join(__dirname, 'manual_shots');
const OUTDIR = 'C:\\Users\\A\\Documents\\Hub取扱説明書';
const OUT = path.join(OUTDIR, 'Hub_ログイン登録手順書.pptx');

const NAVY = '12233F', BLUE = '1D4ED8', BLUE_L = 'E8EFFC', ORANGE = 'EA580C',
      ORANGE_L = 'FDEDE2', INK = '1B2735', MUTED = '5B6B7C', LINE = 'D8E0EA',
      PAPER = 'FFFFFF', SOFT = 'F4F7FB', GREEN = '15803D', GREEN_L = 'E6F3EA',
      RED = 'B91C1C', RED_L = 'FBECEC', WHITE = 'FFFFFF', INDIGO = '3730A3', INDIGO_L = 'EEF2FF';
const F = 'Meiryo';
const W = 13.333, H = 7.5;

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'Hub a Nice Day';
pres.title = 'Hub a Nice Day ログイン登録手順書';

const dim = {};
async function loadDims() {
  if (!sharp) return;
  for (const f of fs.readdirSync(SHOTS).filter(x => x.startsWith('auth-') && x.endsWith('.png'))) {
    try { const m = await sharp(path.join(SHOTS, f)).metadata(); dim[f] = { w: m.width, h: m.height }; } catch (e) {}
  }
}
function fit(file, bx, by, bw, bh) {
  const d = dim[file] || (file.indexOf('-ip-') > 0 ? { w: 780, h: 1688 } : { w: 1280, h: 760 });
  const r = Math.min(bw / d.w, bh / d.h);
  const w = d.w * r, h = d.h * r;
  return { path: path.join(SHOTS, file), x: bx + (bw - w) / 2, y: by + (bh - h) / 2, w, h };
}
const shadow = () => ({ type: 'outer', color: '8A9AAD', blur: 10, offset: 2, angle: 90, opacity: 0.35 });
const T = (s, text, o) => s.addText(text, Object.assign({ fontFace: F, isTextBox: true, margin: 0, color: INK }, o));

function pageTitle(s, title, sub, tag) {
  if (tag) {
    s.addShape(pres.ShapeType.roundRect, { x: 0.55, y: 0.36, w: 1.55, h: 0.4, rectRadius: 0.2, fill: { color: tag.bg }, line: { color: tag.bg, width: 0 } });
    T(s, tag.t, { x: 0.55, y: 0.36, w: 1.55, h: 0.4, fontSize: 12, bold: true, color: WHITE, align: 'center', valign: 'middle' });
    T(s, title, { x: 2.25, y: 0.3, w: 10.5, h: 0.55, fontSize: 26, bold: true });
  } else {
    T(s, title, { x: 0.55, y: 0.3, w: 12.2, h: 0.55, fontSize: 26, bold: true });
  }
  if (sub) T(s, sub, { x: 0.55, y: 0.92, w: 12.2, h: 0.4, fontSize: 13, color: MUTED });
}
function numCircle(s, n, x, y, d, fill) {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill || ORANGE }, line: { color: fill || ORANGE, width: 0 } });
  T(s, String(n), { x, y, w: d, h: d, fontSize: d > 0.4 ? 16 : 12, bold: true, color: WHITE, align: 'center', valign: 'middle' });
}
function card(s, x, y, w, h, opt) {
  opt = opt || {};
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: opt.bg || SOFT }, line: { color: opt.line || LINE, width: 1 }, shadow: opt.shadow ? shadow() : undefined });
}
function callout(s, x, y, w, h, title, body, tone) {
  const c = tone === 'hi' ? { bg: ORANGE_L, line: ORANGE, fg: ORANGE } : tone === 'ok' ? { bg: GREEN_L, line: GREEN, fg: GREEN }
        : tone === 'ng' ? { bg: RED_L, line: RED, fg: RED } : { bg: BLUE_L, line: BLUE, fg: BLUE };
  card(s, x, y, w, h, { bg: c.bg, line: c.line });
  T(s, title, { x: x + 0.25, y: y + 0.1, w: w - 0.5, h: 0.32, fontSize: 13, bold: true, color: c.fg });
  T(s, body, { x: x + 0.25, y: y + 0.42, w: w - 0.5, h: h - 0.5, fontSize: 11.5, color: INK, valign: 'top' });
}
// 左に手順、右に画面
function stepsAndShot(s, steps, file, opt) {
  opt = opt || {};
  const textW = opt.textW || 4.6;
  let y = opt.y || 1.5;
  steps.forEach((n, i) => {
    numCircle(s, i + 1, 0.55, y + 0.02, 0.34, n.color || ORANGE);
    T(s, n.t, { x: 1.02, y: y - 0.02, w: textW - 0.5, h: 0.36, fontSize: 14, bold: true });
    if (n.d) T(s, n.d, { x: 1.02, y: y + 0.34, w: textW - 0.5, h: n.h || 0.62, fontSize: 11, color: MUTED });
    y += (n.d ? (n.h || 0.62) + 0.36 : 0.5) + 0.12;
  });
  if (file) {
    const im = fit(file, 0.55 + textW + 0.25, 1.4, 12.2 - textW - 0.25, 5.6);
    s.addImage(Object.assign({}, im, { shadow: shadow() }));
  }
}

const TAG_PC = { t: 'PC', bg: BLUE }, TAG_IP = { t: 'iPhone', bg: INDIGO }, TAG_AN = { t: 'Android', bg: GREEN }, TAG_ALL = { t: '共通', bg: ORANGE };

async function build() {
  await loadDims();

  // 1 表紙
  {
    const s = pres.addSlide(); s.background = { color: NAVY };
    T(s, 'Hub a Nice Day', { x: 0.9, y: 2.1, w: 11.5, h: 0.9, fontSize: 46, bold: true, color: WHITE });
    T(s, 'ログイン登録手順書', { x: 0.9, y: 3.0, w: 11.5, h: 0.8, fontSize: 34, bold: true, color: '9FC2FF' });
    T(s, 'PC・iPhone・Android　共通　／　はじめて登録する方へ', { x: 0.9, y: 4.0, w: 11.5, h: 0.4, fontSize: 15, color: 'C6D4E8' });
    const pills = ['所要 1〜2分', '端末ごとに1回だけ', '番号は要りません'];
    pills.forEach((p, i) => {
      s.addShape(pres.ShapeType.roundRect, { x: 0.9 + i * 3.2, y: 4.9, w: 3.0, h: 0.46, rectRadius: 0.2, fill: { color: '1E3A66' }, line: { color: '2F5590', width: 1 } });
      T(s, p, { x: 0.9 + i * 3.2, y: 4.9, w: 3.0, h: 0.46, fontSize: 12, color: 'C6D4E8', align: 'center', valign: 'middle' });
    });
    T(s, '緑モータース　2026年9月版（v2.35）', { x: 0.9, y: 6.5, w: 11.5, h: 0.35, fontSize: 11, color: '7E92AE' });
  }

  // 2 考え方と全体の流れ
  {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, '登録の考え方　— 3つだけ覚えてください', 'この登録が済むと、以後は端末を開くだけで自分として使えます');
    const items = [
      ['📱', '登録は「端末ごと」', 'PCとスマホは別々に登録します。PCで済ませても、スマホはスマホで1回登録します。'],
      ['✉️', 'メールアドレスは1人1つ', 'PCもスマホも同じアドレス（会社のメール）で登録します。スマホ用の別アドレスは要りません。'],
      ['🔢', '番号は要りません', '本人確認はメールで行います。スタッフ番号を打つ場面はもうありません。'],
    ];
    items.forEach((it, i) => {
      const x = 0.55 + i * 4.15;
      card(s, x, 1.55, 3.9, 2.05, { bg: SOFT });
      T(s, it[0], { x: x + 0.25, y: 1.7, w: 0.7, h: 0.6, fontSize: 28 });
      T(s, it[1], { x: x + 0.95, y: 1.72, w: 2.8, h: 0.5, fontSize: 15, bold: true });
      T(s, it[2], { x: x + 0.25, y: 2.35, w: 3.4, h: 1.15, fontSize: 11.5, color: MUTED });
    });
    // 流れ
    T(s, '全体の流れ（どの端末でも同じ）', { x: 0.55, y: 3.95, w: 12, h: 0.4, fontSize: 15, bold: true });
    const flow = [
      ['1', '招待メールが届く', '管理者が送ります。中に「確認コード（6桁）」と「リンク」があります。'],
      ['2', 'リンクを開く', 'PCは Edge、iPhone は Safari、Android は Chrome で開きます。'],
      ['3', '6桁を入れる', 'メールの6桁をそのまま入力。メールアドレスは打ちません。'],
      ['4', '端末の種類を選ぶ', '自分専用 か みんなで使う（共有）か。最初の1人が1回だけ。'],
      ['5', '完了', 'スマホはこのあと「ホーム画面に追加」。次からアイコンを押すだけ。'],
    ];
    flow.forEach((f, i) => {
      const x = 0.55 + i * 2.48;
      card(s, x, 4.45, 2.3, 2.3, { bg: i === 4 ? GREEN_L : BLUE_L, line: i === 4 ? GREEN : BLUE });
      numCircle(s, f[0], x + 0.18, 4.62, 0.42, i === 4 ? GREEN : BLUE);
      T(s, f[1], { x: x + 0.7, y: 4.62, w: 1.5, h: 0.42, fontSize: 13, bold: true, valign: 'middle' });
      T(s, f[2], { x: x + 0.18, y: 5.15, w: 1.95, h: 1.5, fontSize: 10.5, color: INK });
      if (i < 4) T(s, '▶', { x: x + 2.3, y: 5.35, w: 0.2, h: 0.4, fontSize: 12, color: MUTED, align: 'center' });
    });
  }

  // 3 招待メールの見方
  {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, '招待メールの見方', '件名「みどりモータース スケジュールシステム【Hub a Nice Day】ログインの登録をお願いします」', TAG_ALL);
    // メールの模擬
    card(s, 0.55, 1.5, 7.6, 5.5, { bg: WHITE, line: LINE, shadow: true });
    T(s, '差出人：Hub a Nice Day（自動送信・返信不要）', { x: 0.85, y: 1.65, w: 7, h: 0.3, fontSize: 10.5, color: MUTED });
    T(s, '見取大介 さん\n\nHub a Nice Day のログイン用アドレスとして、\nこのアドレス（daisuke@midori-m.com）が登録されました。', { x: 0.85, y: 2.0, w: 7, h: 1.1, fontSize: 11.5, color: INK });
    T(s, '▼ 確認コード（24時間有効）', { x: 0.85, y: 3.15, w: 7, h: 0.3, fontSize: 11.5, color: INK });
    s.addShape(pres.ShapeType.roundRect, { x: 1.15, y: 3.48, w: 2.4, h: 0.6, rectRadius: 0.08, fill: { color: ORANGE_L }, line: { color: ORANGE, width: 1.5 } });
    T(s, '4 8 3 9 2 0', { x: 1.15, y: 3.48, w: 2.4, h: 0.6, fontSize: 22, bold: true, color: ORANGE, align: 'center', valign: 'middle' });
    T(s, '▼ 使いはじめる手順\n1. 使いたい端末で、このリンクを開く', { x: 0.85, y: 4.25, w: 7, h: 0.6, fontSize: 11.5, color: INK });
    s.addShape(pres.ShapeType.roundRect, { x: 1.15, y: 4.9, w: 6.7, h: 0.42, rectRadius: 0.06, fill: { color: BLUE_L }, line: { color: BLUE, width: 1.5 } });
    T(s, 'https://midorimotor-inc.github.io/hub-a-nice-day/?inv=●●●●●●●●', { x: 1.25, y: 4.9, w: 6.5, h: 0.42, fontSize: 11, color: BLUE, valign: 'middle', underline: true });
    T(s, '2. 上の6桁を入れれば完了です\n\n※ リンクをその端末で開けない時（店のPCなど）は…（略）\n※ スマホは、LINEやメールの中で開いた場合、先に「Safariで開く」を選んでから登録してください。', { x: 0.85, y: 5.4, w: 7, h: 1.5, fontSize: 10.5, color: MUTED });
    // 右：ポイント
    const pts = [
      ['6桁の「確認コード」', 'これを画面に打ちます。24時間で切れますが、切れても画面の「送り直す」で新しい6桁が届きます。', 'hi'],
      ['リンク（?inv=…）', 'このリンクは「あなた宛」の印つきです。開くだけで誰の登録か伝わるので、メールアドレスは打ちません。', ''],
      ['登録したい端末で開く', 'PCで登録するならPCで、スマホならスマホでこのメールを開いてリンクを押します。両方なら両方で。', 'ok'],
    ];
    pts.forEach((p, i) => callout(s, 8.45, 1.5 + i * 1.85, 4.3, 1.7, p[0], p[1], p[2]));
  }

  // 4 PC①
  {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, 'PC　①リンクを開いて、6桁を入れる', 'メールのリンクは Edge で開きます（いつも Hub を使っている Edge の窓で）', TAG_PC);
    stepsAndShot(s, [
      { t: 'メールのリンクをクリック', d: 'Edge が開き、右の画面になります。メールアドレスを打つ欄はありません。', color: BLUE },
      { t: 'メールの6桁を入れる', d: 'ハイフン6つの欄に、招待メールの「確認コード」を入力。', color: BLUE },
      { t: '「確認する」を押す', d: '確認に 10〜30秒 かかることがあります。押したら待ってください（二度押し不要）。', color: BLUE },
      { t: '6桁が切れていたら', d: '「メールが見つからない → コードを送り直す」を押すと、同じアドレスに新しい6桁が届きます。', h: 0.8 },
    ], 'auth-pc-2-code-filled.png');
  }
  // 5 PC②
  {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, 'PC　②端末の種類を選んで、完了', '最初に登録する人が1回選ぶだけ。2人目からは聞かれません', TAG_PC);
    const im1 = fit('auth-pc-3-kind.png', 0.55, 1.45, 6.0, 3.6); s.addImage(Object.assign({}, im1, { shadow: shadow() }));
    const im2 = fit('auth-pc-4-done.png', 6.8, 1.45, 6.0, 3.6); s.addImage(Object.assign({}, im2, { shadow: shadow() }));
    callout(s, 0.55, 5.2, 6.0, 1.85, '自分に割り当てられたPC → 「自分専用」', '次から開くだけで自分として入れます。他の人も使うPCで選ぶと、その人の名義で予約が入ってしまうので注意。', 'ok');
    callout(s, 6.8, 5.2, 6.0, 1.85, '店の共有PC → 「みんなで使う（共有）」', '端末の名前（共有PC1 など）を選びます。以後は開いたときに名前を選んで使います。迷ったらこちら。', '');
  }
  // 6 PCの注意
  {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, 'PC　注意すること', '登録は「そのブラウザ」に入ります。別のブラウザ・別の窓では未登録扱いになります', TAG_PC);
    const notes = [
      ['✅', 'いつも使う Edge で開く', 'メールのリンクは Edge で開くのが標準です。Chrome など別のブラウザで Hub を開くと、そちらは未登録なので登録画面が出ます。', 'ok'],
      ['⛔', 'InPrivate（プライベート）窓は使わない', '閉じると登録が消えます。毎回登録し直しになります。', 'ng'],
      ['⛔', 'Edge のプロファイルを切り替えない', '右上のアイコンで「仕事用／個人用」を切り替えると、別の人のブラウザ扱いです。', 'ng'],
      ['⛔', '「終了時に閲覧データを削除」をオンにしない', 'Edge の設定でこれがオンだと、閉じるたびに登録が消えます。設定 → プライバシー → 閲覧データをクリア を確認。', 'ng'],
      ['💡', '登録画面がまた出たら', '慌てず「メールアドレスを入れて進む」→ アドレス → 「コードを送り直す」→ 届いた6桁で登録し直せます。使い続けている限り、登録は切れません（3か月開かなかった端末だけ失効）。', ''],
    ];
    notes.forEach((n, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 0.55 + col * 6.25, y = 1.5 + row * 1.85, w = i === 4 ? 12.2 : 6.0;
      const c = n[3] === 'ok' ? { bg: GREEN_L, line: GREEN } : n[3] === 'ng' ? { bg: RED_L, line: RED } : { bg: BLUE_L, line: BLUE };
      card(s, x, y, w, 1.65, c);
      T(s, n[0], { x: x + 0.2, y: y + 0.15, w: 0.5, h: 0.5, fontSize: 20 });
      T(s, n[1], { x: x + 0.75, y: y + 0.15, w: w - 1.0, h: 0.4, fontSize: 14, bold: true });
      T(s, n[2], { x: x + 0.75, y: y + 0.58, w: w - 1.0, h: 1.0, fontSize: 11, color: INK });
    });
  }

  // 7 iPhone①
  {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, 'iPhone　①メールのリンクを Safari で開く', 'iPhone は Safari で登録します（ホーム画面にアプリとして追加できるのは Safari だけ）', TAG_IP);
    stepsAndShot(s, [
      { t: 'メールのリンクをタップ', d: 'iPhone の標準設定なら Safari が開きます。右の画面（6桁の欄）が出ればOK。', color: INDIGO },
      { t: 'LINE や Gmail アプリの中で開いてしまったら', d: '画面の右上または右下の「…」「⋮」→「Safariで開く」を選んでください。アプリの中のブラウザで登録すると、あとでもう一度登録が必要になります。', h: 1.0, color: INDIGO },
      { t: 'メールの6桁を入れて「確認する」', d: '10〜30秒かかることがあります。', color: INDIGO },
    ], 'auth-ip-1-code.png', { textW: 6.2 });
  }
  // 8 iPhone②
  {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, 'iPhone　②「自分専用」を選び、スマホ版を開く', '自分のスマホなので「自分専用」。完了画面の「スマホ版を開く」を必ず押します', TAG_IP);
    const im1 = fit('auth-ip-2-kind.png', 0.55, 1.4, 3.0, 5.7); s.addImage(Object.assign({}, im1, { shadow: shadow() }));
    const im2 = fit('auth-ip-3-done.png', 3.8, 1.4, 3.0, 5.7); s.addImage(Object.assign({}, im2, { shadow: shadow() }));
    const steps = [
      ['「自分専用」をタップ', '自分のスマホなので自分専用。開くだけで自分として使えるようになります。'],
      ['「スマホ版を開く →」をタップ', 'スマホ用の画面（カレンダー・スケジュール・代車）に移ります。登録はそのまま引き継がれます。'],
      ['次のページで「ホーム画面に追加」', 'ここが大事。アプリのように使えるようにします。'],
    ];
    steps.forEach((st, i) => {
      const y = 1.6 + i * 1.6;
      numCircle(s, i + 1, 7.2, y, 0.38, INDIGO);
      T(s, st[0], { x: 7.7, y: y - 0.02, w: 5.1, h: 0.4, fontSize: 14, bold: true });
      T(s, st[1], { x: 7.7, y: y + 0.4, w: 5.1, h: 0.9, fontSize: 11, color: MUTED });
    });
    callout(s, 7.2, 6.05, 5.6, 1.0, '「このままPC版を使う」は押さない', 'スマホでPC版を使うと画面が小さく、ホーム画面への追加も引き継がれません。', 'hi');
  }
  // 9 iPhone③
  {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, 'iPhone　③ホーム画面に追加する', 'スマホ版が開いたら、30分以内にこの操作。以後はホーム画面のアイコンをタップするだけ', TAG_IP);
    const im = fit('auth-ip-4-mobile-hint.png', 0.55, 1.4, 3.2, 5.7); s.addImage(Object.assign({}, im, { shadow: shadow() }));
    const steps = [
      ['画面下の「共有」ボタン（□↑）をタップ', 'Safari の下にある、四角から矢印が出ているボタンです。'],
      ['下にスクロールして「ホーム画面に追加」', 'メニューの中ほどにあります。'],
      ['右上の「追加」', 'ホーム画面に「Hub」のアイコンができます。'],
      ['アイコンから開く', 'ログインなしでそのまま自分の画面が開けば完了です。上に出ていた青い案内は ✕ で閉じてOK。'],
    ];
    steps.forEach((st, i) => {
      const y = 1.5 + i * 1.12;
      numCircle(s, i + 1, 4.1, y, 0.38, INDIGO);
      T(s, st[0], { x: 4.6, y: y - 0.02, w: 8.2, h: 0.4, fontSize: 14, bold: true });
      T(s, st[1], { x: 4.6, y: y + 0.4, w: 8.2, h: 0.6, fontSize: 11, color: MUTED });
    });
    callout(s, 4.1, 6.05, 8.7, 1.0, 'なぜ30分以内？', 'iPhone は Safari とホーム画面のアイコンで保管場所が別です。登録を渡す「印」が30分だけ有効なので、その間に追加してください。過ぎたら Safari で Hub を開き直せば印が新しくなります。', '');
  }

  // 10 Android
  {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, 'Android　Chrome で登録して、ホーム画面に追加', '手順は iPhone と同じ。ブラウザが Chrome、追加の操作がメニュー（⋮）になるだけ', TAG_AN);
    const im = fit('auth-ip-3-done.png', 0.55, 1.4, 3.0, 5.7); s.addImage(Object.assign({}, im, { shadow: shadow() }));
    const steps = [
      ['メールのリンクをタップ → Chrome が開く', 'Gmail アプリの中で開いた場合は、右上の「⋮」→「Chromeで開く」。'],
      ['6桁 → 「自分専用」→ 「スマホ版を開く」', 'iPhone と同じです。'],
      ['右上の「⋮」→「ホーム画面に追加」', '機種によっては「アプリをインストール」と出ます。どちらでもOK。'],
      ['「追加」→ アイコンから開く', 'ログインなしで自分の画面が開けば完了。'],
    ];
    steps.forEach((st, i) => {
      const y = 1.5 + i * 1.12;
      numCircle(s, i + 1, 3.9, y, 0.38, GREEN);
      T(s, st[0], { x: 4.4, y: y - 0.02, w: 8.4, h: 0.4, fontSize: 14, bold: true });
      T(s, st[1], { x: 4.4, y: y + 0.4, w: 8.4, h: 0.6, fontSize: 11, color: MUTED });
    });
    callout(s, 3.9, 6.05, 8.9, 1.0, 'Android の機種はさまざまです', 'メニューの名前が違うことがあります。「ホーム画面に追加」「アプリをインストール」「ショートカットを作成」のどれかを探してください。', '');
  }

  // 11 困ったとき
  {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, '困ったとき', 'ほとんどは「送り直す」か「開き直す」で解決します', TAG_ALL);
    const rows = [
      ['6桁を入れたら「期限切れ」と出た', '「メールが見つからない → コードを送り直す」を押す。同じアドレスに新しい6桁が届く（24時間有効）。'],
      ['「この招待リンクは期限切れです」と出た', 'リンクの印は30日で切れます。画面の指示どおりメールアドレスを入れ、「コードを送り直す」で続けられます。'],
      ['登録したのに、また登録画面が出た', '別のブラウザ／別の窓で開いています。PC：いつもの Edge で。iPhone：Safari かホーム画面のアイコンで。LINEの中のブラウザは使わない。'],
      ['ホーム画面のアイコンで登録画面が出た', '30分を過ぎてから追加した可能性。Safari で Hub を開く → 一度アイコンを削除 → もう一度「ホーム画面に追加」。'],
      ['「このアドレスは登録されていません」', '管理者がログイン用メールをまだ登録していないか、綴りが違います。管理者に確認。'],
      ['スマホを機種変更した／PCを入れ替えた', '新しい端末で最初から登録（招待メールのリンク → 送り直す → 6桁）。古い端末は管理者が「取り消し」。'],
      ['確認に時間がかかる', '10〜30秒は正常です。二度押しせず待つ。1分以上なら、同じ6桁で「確認する」をもう一度。'],
    ];
    const y0 = 1.45, rh = 0.76;
    rows.forEach((r, i) => {
      const y = y0 + i * rh;
      s.addShape(pres.ShapeType.rect, { x: 0.55, y, w: 12.2, h: rh, fill: { color: i % 2 ? WHITE : SOFT }, line: { color: LINE, width: 0.5 } });
      T(s, r[0], { x: 0.75, y: y + 0.08, w: 4.3, h: rh - 0.16, fontSize: 12, bold: true, valign: 'middle' });
      T(s, r[1], { x: 5.2, y: y + 0.08, w: 7.4, h: rh - 0.16, fontSize: 11, color: INK, valign: 'middle' });
    });
  }

  // 12 管理者の方へ
  {
    const s = pres.addSlide(); s.background = { color: PAPER };
    pageTitle(s, '管理者の方へ　— 招待の送り方', '管理者コンソール（admin.html）の「スタッフと招待」タブから', { t: '管理者', bg: NAVY });
    const steps = [
      ['ログイン用メールを入れる', 'スタッフの行の「ログイン用メール」欄に会社のアドレスを入力して保存。1人1つ。'],
      ['「使う端末」を決める', '個人端末／共有PC1 など。決めておくと本人は端末の種類を聞かれません。'],
      ['「招待を送る」', '送る前にアドレスの読み合わせが出ます。本人に印つきリンクと6桁が届きます。'],
      ['「🔑 端末」タブで確認', '登録が済むと端末が並びます。同じ人が PC と スマホ で2行になるのは正常。紛失・退職は「取り消し」。'],
    ];
    steps.forEach((st, i) => {
      const x = 0.55 + i * 3.1;
      card(s, x, 1.5, 2.9, 2.6, { bg: SOFT });
      numCircle(s, i + 1, x + 0.2, 1.7, 0.42, NAVY);
      T(s, st[0], { x: x + 0.2, y: 2.25, w: 2.5, h: 0.6, fontSize: 13.5, bold: true });
      T(s, st[1], { x: x + 0.2, y: 2.9, w: 2.5, h: 1.15, fontSize: 11, color: MUTED });
    });
    callout(s, 0.55, 4.35, 6.0, 1.3, '同じ人の行が増えたら', '同じPC・同じブラウザで登録し直した分は自動で置き換わります。増えるのは別ブラウザ（LINEの中など）で登録した時。使っていない行は取り消してOK。', '');
    callout(s, 6.75, 4.35, 6.0, 1.3, '本番／DEV の切り替え', 'コンソール右上の「本番に切り替える」。本番は青、DEVは緑。開き直すと必ずDEVに戻ります。', 'hi');
    T(s, 'このページは管理者だけに配ってください。', { x: 0.55, y: 5.9, w: 12, h: 0.35, fontSize: 11, color: RED, bold: true });
  }

  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });
  await pres.writeFile({ fileName: OUT });
  console.log('✔ 出力: ' + OUT);
}
build().catch(e => { console.error(e); process.exit(1); });
