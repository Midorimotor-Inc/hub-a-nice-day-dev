// 車検入庫表にあってスケジュールに無い分を、スケジュール（insp）に足す。
//   node add_from_nyuko.js <入庫表.xlsx> [...] [--prod] [--write]
//   ・sync_from_nyuko.js と同じ読み方（左＝本店／右＝三田）。氏名で突き合わせ、無い人だけ足す
//   ・コース マ=マッハ(1) ク=クイック(2) レ=レギュラー(3) 未/空=未定(null)
//   ・備考に「キャンセル」とあればキャンセル扱い（赤）で入れる
//   ・代車欄（○/要）は「代車あり」と備考に残すだけ。実際の代車の割り当てはしない
//   ・名前が「休み」等・車種が空の行は入れない
const path = require('path'), fs = require('fs');
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
let chromium; for (const b of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) { try { chromium = require(path.join(b, 'node_modules', 'playwright')).chromium; break; } catch (e) {} }
const args = process.argv.slice(2);
const FILES = args.filter(a => !a.startsWith('--') && fs.existsSync(a));
const PROD = args.includes('--prod'), WRITE = args.includes('--write');
const P = PROD ? 'hub-v8-' : 'hub-v8-dev-';
const KEY_FILE = process.env.HUB_FB_KEY || 'C:\\Users\\A\\Documents\\Hub重要書類\\firebase-admin.json';
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
const db = admin.firestore();
const get = async k => { const d = await db.doc('kv/' + k).get(); return d.exists ? JSON.parse(d.data().v || 'null') : null; };
const norm = s => String(s || '').replace(/[\s　]/g, '').replace(/[（(].*?[)）]/g, '');
const jp = dk => { const [y, m, d] = dk.split('-').map(Number); return `${m}/${d}(${'日月火水木金土'[new Date(y, m - 1, d).getDay()]})`; };
const COURSE = { 'マ': 1, 'ク': 2, 'レ': 3 };
(async () => {
  if (!FILES.length) { console.error('入庫表のファイルを指定してください'); process.exit(1); }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');
  await page.addScriptTag({ url: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js' });
  let rows = [];
  for (const f of FILES) {
    const b64 = fs.readFileSync(f).toString('base64');
    const got = await page.evaluate(([b64]) => {
      const wb = XLSX.read(b64, { type: 'base64', cellDates: true });
      const g = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
      const pad = n => String(n).padStart(2, '0');
      const asTime = v => {
        if (v === null || v === undefined || v === '') return '';
        if (v instanceof Date) return isNaN(v.getTime()) ? '' : pad(v.getHours()) + ':' + pad(v.getMinutes());
        const m = String(v).match(/(\d{1,2}):(\d{2})/); if (m) return pad(Number(m[1])) + ':' + m[2];
        const n = Number(v); if (!isNaN(n) && n > 0 && n < 1) { const mi = Math.round(n * 1440); return pad(Math.floor(mi / 60)) + ':' + pad(mi % 60); }
        return '';
      };
      const asDk = v => {
        if (v instanceof Date) return (isNaN(v.getTime()) || v.getFullYear() < 2000) ? '' : v.getFullYear() + '-' + (v.getMonth() + 1) + '-' + v.getDate();
        const m = String(v || '').match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/); return m ? `${m[1]}-${Number(m[2])}-${Number(m[3])}` : '';
      };
      const out = []; let dk = '';
      for (let i = 1; i < g.length; i++) {
        const r = g[i] || [];
        const d = asDk(r[0]); if (d) dk = d;
        if (!dk) continue;
        for (const b of [{ s: 'honten', c: 2 }, { s: 'sanda', c: 12 }]) {
          const name = (r[b.c] instanceof Date) ? '' : String(r[b.c] || '').trim();
          if (!name || name === '名前') continue;
          out.push({ dk, store: b.s, name, carType: String(r[b.c + 1] || '').trim(), course: String(r[b.c + 2] || '').trim(),
            loaner: String(r[b.c + 3] || '').trim(), staff: String(r[b.c + 5] || '').trim(), time: asTime(r[b.c + 6]), note: String(r[b.c + 7] || '').trim() });
        }
      }
      return out;
    }, [b64]);
    console.log(path.basename(f) + '：' + got.length + '行');
    rows = rows.concat(got);
  }
  await browser.close();

  const insp = await get(P + 'insp') || {};
  const add = [];
  for (const x of rows) {
    if (!x.carType || /休/.test(x.name)) continue;                    // 「休み」や車種なしの行は入れない
    const list = (insp[x.dk] || []).filter(r => r && r.name && r.bookingStatus !== 'cancelled');
    const nx = norm(x.name);
    const found = list.some(r => norm(r.name) === nx || (nx.length >= 2 && (norm(r.name).startsWith(nx) || nx.startsWith(norm(r.name)) || norm(r.name).includes(nx))));
    if (!found) add.push(x);
  }
  const byDay = {}; add.forEach(x => (byDay[x.dk] = byDay[x.dk] || []).push(x));
  const days = Object.keys(byDay).sort((a, b) => new Date(a) - new Date(b));
  const cancels = add.filter(x => /キャンセル/.test(x.note));
  console.log(`\n■ 足す予約：${add.length}件（${days.length}日）　うちキャンセル扱い ${cancels.length}件`);
  const bs = {}; add.forEach(x => bs[x.store] = (bs[x.store] || 0) + 1);
  console.log(`   本店 ${bs.honten || 0} ／ 三田 ${bs.sanda || 0}　　時間なし ${add.filter(x => !x.time).length}件（9:00 にします）`);
  console.log('\n■ 最初の8日ぶん');
  days.slice(0, 8).forEach(dk => console.log(`   ${jp(dk).padEnd(9)} ${byDay[dk].map(x => x.name + '(' + (x.store === 'sanda' ? '三田' : '本店') + ' ' + (x.time || '09:00') + ')').join('、')}`));
  if (!WRITE) { console.log('\n（下見だけです。書き込むには --write を付けてください）'); process.exit(0); }
  let seq = Date.now();
  for (const dk of days) {
    const list = Array.isArray(insp[dk]) ? insp[dk].slice() : [];
    for (const x of byDay[dk]) {
      const cancelled = /キャンセル/.test(x.note);
      const notes = [x.note, /[○〇要]/.test(x.loaner) ? '代車あり（入庫表）' : ''].filter(Boolean).join('\n');
      list.push({
        name: x.name, carType: x.carType, course: COURSE[x.course] || null, store: x.store,
        staff: x.staff || '', tokuten: '', note: notes, no: '', phone: '', address: '',
        bookingStatus: cancelled ? 'cancelled' : 'confirmed', custId: '',
        bookingTime: x.time || '09:00', time: x.time || '09:00', entryDate: '', deliveryDate: '', deliveryTime: '',
        loaner: '', loanerId: null, rentalLabel: '', rentalCarId: null,
        approved: true, seq: seq++, bookingKey: `insp-${dk}-${list.length}`,
      });
    }
    insp[dk] = list;
  }
  await db.doc('kv/' + P + 'insp').set({ v: JSON.stringify(insp), u: admin.firestore.FieldValue.serverTimestamp() });
  const back = await get(P + 'insp');
  const n = days.reduce((a, dk) => a + (back[dk] || []).filter(r => r && r.approved && !r.custId).length, 0);
  console.log(`\n★書き込み完了：${add.length}件（読み返し確認 ${n}件）`);
  process.exit(0);
})().catch(e => { console.error('エラー:', e.message); process.exit(1); });
