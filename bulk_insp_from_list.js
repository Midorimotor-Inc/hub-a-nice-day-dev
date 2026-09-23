// 顧客リスト（取り込み済み）の入庫日から、車検スケジュール（insp）の予約をまとめて作る。
//   node bulk_insp_from_list.js [--prod] [--write] [--time 09:00]
//   既定は下見（書き込みなし）。--write で Firestore に書く。
//   ・入庫日があり、状態が「本予約（confirm）」の顧客が対象（キャンセルは除く）
//   ・その日の指定時刻（既定 9:00）で1行ずつ足す。代車は空
//   ・すでに同じ日に同じ人（custId か 氏名）の行があれば飛ばす（二重登録しない）
//   ・1日6台（レギュラー3台）を超える分も入れる。承認済み(approved)にして「承認待ち」を出さない
const fs = require('fs'), path = require('path');
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const KEY_FILE = process.env.HUB_FB_KEY || 'C:\\Users\\A\\Documents\\Hub重要書類\\firebase-admin.json';
const args = process.argv.slice(2);
const PROD = args.includes('--prod');
const WRITE = args.includes('--write');
const TIME = (args[args.indexOf('--time') + 1] && args.includes('--time')) ? args[args.indexOf('--time') + 1] : '09:00';
const P = PROD ? 'hub-v8-' : 'hub-v8-dev-';
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
const db = admin.firestore();
const get = async k => { const d = await db.doc('kv/' + k).get(); return d.exists ? JSON.parse(d.data().v || 'null') : null; };
const set = async (k, v) => db.doc('kv/' + k).set({ v: JSON.stringify(v), u: admin.firestore.FieldValue.serverTimestamp() });
const toDk = s => { const m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? `${m[1]}-${Number(m[2])}-${Number(m[3])}` : ''; };
const jp = dk => { const [y, m, d] = dk.split('-').map(Number); return `${m}/${d}(${'日月火水木金土'[new Date(y, m - 1, d).getDay()]})`; };
(async () => {
  console.log(`対象：${PROD ? 'メイン（本番）' : 'テスト版'}　入庫時刻 ${TIME}　${WRITE ? '★書き込みます' : '（下見・書き込みなし）'}`);
  const idx = await get(P + 'cf-index') || [];
  const insp = await get(P + 'insp') || {};
  // 既存の予約（custId / 氏名）を日別に控える
  const have = {};
  for (const dk of Object.keys(insp)) {
    have[dk] = new Set();
    for (const r of (insp[dk] || [])) { if (r && r.bookingStatus !== 'cancelled') { if (r.custId) have[dk].add('id:' + r.custId); if (r.name) have[dk].add('nm:' + r.name); } }
  }
  // 顧客を集める
  const cands = [];
  for (const f of idx) {
    for (let i = 0; i < 30; i++) {
      const c = await get(P + 'cf-' + f.name + '-chunk-' + i);
      if (!c) break;
      for (const x of c) {
        if (!x || !x.entryDate || !x.name) continue;
        if (x.status === 'cancel') continue;
        const dk = toDk(x.entryDate);
        if (!dk) continue;
        cands.push({ ...x, dk, file: f.name });
      }
    }
  }
  cands.sort((a, b) => (a.dk === b.dk ? (a.rowIdx || 0) - (b.rowIdx || 0) : (new Date(a.dk) - new Date(b.dk))));
  const add = [], skip = [];
  for (const c of cands) {
    const h = have[c.dk] || new Set();
    if ((c.custId && h.has('id:' + c.custId)) || h.has('nm:' + c.name)) { skip.push(c); continue; }
    h.add('id:' + c.custId); h.add('nm:' + c.name); have[c.dk] = h;
    add.push(c);
  }
  // 日別の集計
  const byDay = {};
  add.forEach(c => { (byDay[c.dk] = byDay[c.dk] || []).push(c); });
  const days = Object.keys(byDay).sort((a, b) => new Date(a) - new Date(b));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const past = add.filter(c => new Date(c.dk) < today).length;
  const store = { honten: 0, sanda: 0, '': 0 };
  add.forEach(c => { store[c.store || ''] = (store[c.store || ''] || 0) + 1; });
  const over = days.filter(dk => (byDay[dk].length + (insp[dk] || []).filter(r => r && r.name && r.bookingStatus !== 'cancelled').length) > 6);
  console.log(`\n■ 入れる予約：${add.length}件（${days.length}日）　※すでに入っていて飛ばす分 ${skip.length}件`);
  console.log(`   過去の日 ${past}件 ／ これから ${add.length - past}件　　本店 ${store.honten} ／ 三田 ${store.sanda}${store[''] ? ' ／ 店舗なし ' + store[''] : ''}`);
  console.log(`   6台を超える日：${over.length}日${over.length ? '　' + over.slice(0, 12).map(dk => jp(dk) + (byDay[dk].length + (insp[dk] || []).filter(r => r && r.name).length) + '台').join(' ') : ''}`);
  console.log('\n■ 月ごと');
  const byMonth = {};
  add.forEach(c => { const k = c.dk.split('-').slice(0, 2).join('-'); byMonth[k] = (byMonth[k] || 0) + 1; });
  Object.keys(byMonth).sort((a, b) => new Date(a + '-1') - new Date(b + '-1')).forEach(k => console.log(`   ${k.replace('-', '年')}月：${byMonth[k]}件`));
  console.log('\n■ 最初の10日ぶん');
  days.slice(0, 10).forEach(dk => console.log(`   ${jp(dk).padEnd(9)} ${byDay[dk].length}台　${byDay[dk].map(c => c.name + '(' + (c.store === 'sanda' ? '三田' : '本店') + ')').join('、')}`));
  if (!WRITE) { console.log('\n（下見だけです。書き込むには --write を付けてください）'); process.exit(0); }

  // 書き込み
  let seq = Date.now();
  for (const dk of days) {
    const rows = Array.isArray(insp[dk]) ? insp[dk].slice() : [];
    for (const c of byDay[dk]) {
      rows.push({
        name: c.name, carType: c.carType || '', course: c.course || null, store: c.store || 'honten',
        staff: c.staff || '', tokuten: c.tokuten && c.tokuten !== '-' ? c.tokuten : '', note: c.note || '',
        no: c.no ?? '', phone: c.phoneMobile || c.phoneHome || '', address: c.address || '',
        bookingStatus: 'confirmed', custId: c.custId || '',
        bookingTime: TIME, time: TIME, entryDate: '', deliveryDate: '', deliveryTime: '',
        loaner: '', loanerId: null, rentalLabel: '', rentalCarId: null,
        approved: true,                       // 6台を超えた分も「承認済み」で確定にする
        seq: seq++, bookingKey: `insp-${dk}-${rows.length}`,
      });
    }
    insp[dk] = rows;
  }
  await set(P + 'insp', insp);
  const back = await get(P + 'insp');
  const okCount = days.reduce((a, dk) => a + (back[dk] || []).filter(r => r && r.bookingTime === TIME && r.approved).length, 0);
  console.log(`\n★書き込み完了：${add.length}件（読み返し確認 ${okCount}件）`);
  process.exit(0);
})().catch(e => { console.error('エラー:', e.message); process.exit(1); });
