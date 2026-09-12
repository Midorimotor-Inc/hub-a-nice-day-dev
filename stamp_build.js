// __APP_BUILD（自動アップデート検知の目印）を3ファイルまとめて今の時刻に更新する。
//   DEVへ push する前に必ず実行する： node stamp_build.js
//   これを忘れると、開きっぱなしの画面に「新しいバージョンがあります」の帯が出ない
//   （2026-09-03〜09-12 の間、DEVでは一度も更新されておらず帯が出なかった）。
//   ※ v2.27 からはバージョン番号の違いでも帯が出るので二重の保険だが、識別子も揃えておく。
//   本番は port_to_main.js が移植時に自動で更新する。
const fs = require('fs');
const path = require('path');
const stamp = 'build-' + Date.now();
let n = 0;
for (const f of ['index_dev.html', 'customers.html', 'mobile.html']) {
  const p = path.join(__dirname, f);
  const s = fs.readFileSync(p, 'utf8');
  const re = /__APP_BUILD='build-\d+'/;
  if (!re.test(s)) { console.error('  ✖ ' + f + ': __APP_BUILD が見つかりません'); process.exitCode = 1; continue; }
  fs.writeFileSync(p, s.replace(re, "__APP_BUILD='" + stamp + "'"), 'utf8');
  console.log('  ✔ ' + f + ' → ' + stamp); n++;
}
console.log(n === 3 ? '  3ファイルとも更新しました' : '  ⚠ 更新できなかったファイルがあります');
