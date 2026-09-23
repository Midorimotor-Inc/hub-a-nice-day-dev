// タイムスケジュール（{店}-sched）に予定をまとめて足す。読み上げ→文字にした内容をこちらで JSON にして渡す。
//   node add_sched.js <entries.json> [--prod] [--write]
//   entries.json: [{ "dk":"2026-10-5", "store":"honten", "time":"09:30", "name":"山田太郎",
//                    "carType":"ハスラー", "work":"Q", "content":"オイル交換", "staff":"", "shimi":"" }, ...]
//   ・time は 09:00〜18:00 の30分刻み、または 午前 / 午後 / 未定
//   ・同じ時刻にすでに予定があれば `09:30__1` のように枝番で足す（既存は消さない）
//   ・work は Q ⑫ M12 M6 N1 N6 B R 商 保 試 納 他
const path = require('path'), fs = require('fs');
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const args = process.argv.slice(2);
const FILE = args.find(a => !a.startsWith('--'));
const PROD = args.includes('--prod'), WRITE = args.includes('--write');
const P = PROD ? 'hub-v8-' : 'hub-v8-dev-';
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(process.env.HUB_FB_KEY || 'C:\\Users\\A\\Documents\\Hub重要書類\\firebase-admin.json', 'utf8'))) });
const db = admin.firestore();
const get = async k => { const d = await db.doc('kv/' + k).get(); return d.exists ? JSON.parse(d.data().v || 'null') : null; };
const WORKS = ['Q', '⑫', 'M12', 'M6', 'N1', 'N6', 'B', 'R', '商', '保', '試', '納', '他'];
const SLOTS = (() => { const s = ['午前', '午後', '未定']; for (let h = 9; h <= 18; h++) { s.push(String(h).padStart(2, '0') + ':00'); if (h < 18) s.push(String(h).padStart(2, '0') + ':30'); } return s; })();
const jp = dk => { const [y, m, d] = dk.split('-').map(Number); return `${m}/${d}(${'日月火水木金土'[new Date(y, m - 1, d).getDay()]})`; };
(async () => {
  if (!FILE || !fs.existsSync(FILE)) { console.error('entries.json を指定してください'); process.exit(1); }
  const list = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const bad = [];
  list.forEach((e, i) => {
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(e.dk || '')) bad.push(`${i + 1}行目：日付が変です（${e.dk}）`);
    if (!['honten', 'sanda'].includes(e.store)) bad.push(`${i + 1}行目：店が変です（${e.store}）`);
    if (!SLOTS.includes(e.time)) bad.push(`${i + 1}行目：時間が枠にありません（${e.time}）`);
    if (!e.name) bad.push(`${i + 1}行目：氏名がありません`);
    if (e.work && !WORKS.includes(e.work)) bad.push(`${i + 1}行目：作業が変です（${e.work}）`);
  });
  if (bad.length) { console.error('■ 直すところ\n  ' + bad.join('\n  ')); process.exit(1); }
  const sched = { honten: (await get(P + 'honten-sched')) || {}, sanda: (await get(P + 'sanda-sched')) || {} };
  const plan = [];
  for (const e of list) {
    const day = sched[e.store][e.dk] || {};
    let key = e.time, n = 0;
    while (day[key]) { n++; key = e.time + '__' + n; }          // 同時刻は枝番で足す
    day[key] = {
      name: e.name, staff: e.staff || '', carType: e.carType || '', phone: e.phone || '',
      work: e.work || '', loaner: '', loanerId: null, rentalLabel: '', rentalCarId: null,
      shimi: e.shimi || '', content: e.content || '', entryDate: '', deliveryDate: '', deliveryTime: '',
      bookingStatus: 'new',
    };
    sched[e.store][e.dk] = day;
    plan.push(`${jp(e.dk).padEnd(9)} ${e.store === 'sanda' ? '三田' : '本店'} ${key.padEnd(8)} ${e.name}　${e.carType || ''}　${e.work || ''}　${e.content || ''}`);
  }
  console.log(`■ 足す予定：${list.length}件`);
  plan.forEach(x => console.log('   ' + x));
  if (!WRITE) { console.log('\n（下見だけです。書き込むには --write を付けてください）'); process.exit(0); }
  for (const s of ['honten', 'sanda']) await db.doc('kv/' + P + s + '-sched').set({ v: JSON.stringify(sched[s]), u: admin.firestore.FieldValue.serverTimestamp() });
  const back = { honten: await get(P + 'honten-sched'), sanda: await get(P + 'sanda-sched') };
  const ok = list.filter(e => Object.values(back[e.store][e.dk] || {}).some(r => r && r.name === e.name)).length;
  console.log(`\n★書き込み完了：${list.length}件（読み返し確認 ${ok}件）`);
  process.exit(0);
})().catch(e => { console.error('エラー:', e.message); process.exit(1); });
