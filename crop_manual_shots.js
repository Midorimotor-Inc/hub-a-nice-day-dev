// マニュアル用に、スクリーンショットの一部を切り出す。
//   画面まるごとだとスライドでは字が小さすぎて読めない。説明したい所だけ拡大して見せる。
//   実行: node crop_manual_shots.js   （capture_manual_shots.js の後）
const path = require('path');
const fs = require('fs');
let sharp;
try { sharp = require('sharp'); }
catch (e) {
  try { sharp = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'sharp')); }
  catch (e2) { console.error('sharp が見つかりません。次を実行してください:\n  cd "%LOCALAPPDATA%\\Temp\\hub-verify" && npm i sharp'); process.exit(1); }
}

const DIR = path.join(__dirname, 'manual_shots');
// 元画像は 3000x1900（PC）/ 1170x2532（モバイル）
const CROPS = [
  // ヘッダーの操作ボタン列（一番よく使う所なので大きく見せる）
  { src: '04-schedule.png', out: 'c-header.png',    left: 0,    top: 0,   width: 3000, height: 190 },
  // 右上のアイコン群（全画面・スタッフ・設定・復旧・ログアウト）
  { src: '04-schedule.png', out: 'c-headright.png', left: 2180, top: 0,   width: 820,  height: 100 },
  // 日付の送りボタン
  { src: '04-schedule.png', out: 'c-datenav.png',   left: 1150, top: 195, width: 700,  height: 90 },
  // 車検の表（左側）
  { src: '04-schedule.png', out: 'c-insp.png',      left: 20,   top: 370, height: 700, width: 1500 },
  // タイムスケジュール（右側）
  { src: '04-schedule.png', out: 'c-sched.png',     left: 1510, top: 370, width: 1480, height: 700 },
  // 予約カードの上半分（氏名・担当・車種・コース）
  { src: '08-modal.png',    out: 'c-card-top.png',  left: 0,    top: 0,   width: 1120, height: 800 },
  // 予約カードの下半分（代車・特典・入庫・納車・備考）
  { src: '08-modal.png',    out: 'c-card-bot.png',  left: 0,    top: 790, width: 1120, height: 1100 },
];

(async () => {
  let n = 0;
  for (const c of CROPS) {
    const src = path.join(DIR, c.src);
    if (!fs.existsSync(src)) { console.log(`  － ${c.src} が無い`); continue; }
    const meta = await sharp(src).metadata();
    const left = Math.max(0, Math.min(c.left, meta.width - 1));
    const top = Math.max(0, Math.min(c.top, meta.height - 1));
    const width = Math.min(c.width, meta.width - left);
    const height = Math.min(c.height, meta.height - top);
    await sharp(src).extract({ left, top, width, height }).toFile(path.join(DIR, c.out));
    console.log(`  ✔ ${c.out}  (${width}x${height})`);
    n++;
  }
  console.log(`\n切り出し ${n} 枚`);
})();
