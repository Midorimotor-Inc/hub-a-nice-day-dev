// 「車検入庫表」の Excel（左＝本店／右＝三田）を読み、テスト版／メインの車検スケジュールの
// 入庫時間と備考を、入庫表に合わせる。
//   node sync_from_nyuko.js <入庫表.xlsx> [...] [--prod] [--write]
//   既定は下見（書き込みなし）。--write で Firestore に書く。
//   ・入庫表の並び：A=入庫日 B=曜　C〜K=本店（名前・車種・コース・代車・予約・担当・時間・備考・数）
//     　　　　　　　M〜U=三田（同じ並び）
//   ・氏名で突き合わせる（入庫表は姓だけのことが多いので、前方一致・部分一致も見る）
//   ・時間が入っていればスケジュールの入庫時間を入れ替え、備考があれば備考に入れる（元の備考は残して追記）
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
      const ws = wb.Sheets[wb.SheetNames[0]];   // 1枚目＝入庫票
      const g = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });   // 日付・時刻は Date で受け取る
      const pad = n => String(n).padStart(2, '0');
      const asTime = v => {
        if (v === null || v === undefined || v === '') return '';
        if (v instanceof Date) { if (isNaN(v.getTime())) return ''; return pad(v.getHours()) + ':' + pad(v.getMinutes()); }
        const s = String(v).trim();
        const m = s.match(/(\d{1,2}):(\d{2})/);
        if (m) return pad(Number(m[1])) + ':' + m[2];
        const n = Number(s);
        if (!isNaN(n) && n > 0 && n < 1) { const mins = Math.round(n * 24 * 60); return pad(Math.floor(mins / 60)) + ':' + pad(mins % 60); }
        return '';
      };
      const asDk = v => {
        if (v instanceof Date) { if (isNaN(v.getTime()) || v.getFullYear() < 2000) return ''; return v.getFullYear() + '-' + (v.getMonth() + 1) + '-' + v.getDate(); }
        const m = String(v || '').match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        return m ? `${m[1]}-${Number(m[2])}-${Number(m[3])}` : '';
      };
      const out = []; let dk = '';
      for (let i = 1; i < g.length; i++) {
        const r = g[i] || [];
        const d = asDk(r[0]); if (d) dk = d;
        if (!dk) continue;
        const blocks = [{ s: 'honten', c: 2 }, { s: 'sanda', c: 12 }];
        for (const b of blocks) {
          const name = String(r[b.c] || '').trim();
          if (!name || name === '名前') continue;
          out.push({ dk, store: b.s, name,
            carType: String(r[b.c + 1] || '').trim(), course: String(r[b.c + 2] || '').trim(),
            loaner: String(r[b.c + 3] || '').trim(), staff: String(r[b.c + 5] || '').trim(),
            time: asTime(r[b.c + 6]), note: String(r[b.c + 7] || '').trim() });
        }
      }
      return out;
    }, [b64]);
    console.log(path.basename(f) + '：' + got.length + '行');
    rows = rows.concat(got);
  }
  await browser.close();

  const insp = await get(P + 'insp') || {};
  const hit = [], miss = [], same = [];
  for (const x of rows) {
    const list = (insp[x.dk] || []).map((r, i) => ({ r, i })).filter(o => o.r && o.r.name && o.r.bookingStatus !== 'cancelled');
    const nx = norm(x.name);
    let m = list.find(o => norm(o.r.name) === nx)
      || list.find(o => norm(o.r.name).startsWith(nx) && nx.length >= 2)
      || list.find(o => nx.startsWith(norm(o.r.name)) && norm(o.r.name).length >= 2)
      || list.find(o => norm(o.r.name).includes(nx) && nx.length >= 2);
    if (!m) { miss.push(x); continue; }
    const curTime = m.r.bookingTime || m.r.time || '';
    const curNote = String(m.r.note || '');
    const wantTime = x.time || curTime;
    const addNote = x.note && !curNote.includes(x.note);
    if (wantTime === curTime && !addNote) { same.push(x); continue; }
    hit.push({ x, dk: x.dk, idx: m.i, name: m.r.name, curTime, wantTime, curNote, addNote });
  }
  console.log(`\n■ 入庫表 ${rows.length}行　→　直す ${hit.length}件 ／ すでに同じ ${same.length}件 ／ 見つからない ${miss.length}件`);
  const timeChange = hit.filter(h => h.wantTime !== h.curTime);
  console.log(`   時間を変える ${timeChange.length}件　　備考を足す ${hit.filter(h => h.addNote).length}件`);
  console.log('\n■ 時間を変える例（先頭15件）');
  timeChange.slice(0, 15).forEach(h => console.log(`   ${jp(h.dk).padEnd(9)} ${h.name.padEnd(12)} ${h.curTime} → ${h.wantTime}${h.addNote ? '　備考+「' + h.x.note.slice(0, 20) + '」' : ''}`));
  if (miss.length) {
    console.log('\n■ スケジュールに見つからなかった人（先頭20件）');
    miss.slice(0, 20).forEach(x => console.log(`   ${jp(x.dk).padEnd(9)} ${(x.store === 'sanda' ? '三田' : '本店')} ${x.name}　${x.carType}　${x.time || '時間なし'}`));
  }
  if (process.env.NYUKO_DUMP) { fs.writeFileSync(process.env.NYUKO_DUMP, JSON.stringify({ rows, hit, miss, same }, null, 1)); console.log('控え:', process.env.NYUKO_DUMP); }
  if (!WRITE) { console.log('\n（下見だけです。書き込むには --write を付けてください）'); process.exit(0); }
  let n = 0;
  for (const h of hit) {
    const r = insp[h.dk][h.idx];
    if (h.wantTime && h.wantTime !== h.curTime) { r.time = h.wantTime; r.bookingTime = h.wantTime; }
    if (h.addNote) r.note = (h.curNote ? h.curNote + '\n' : '') + h.x.note;
    n++;
  }
  await db.doc('kv/' + P + 'insp').set({ v: JSON.stringify(insp), u: admin.firestore.FieldValue.serverTimestamp() });
  console.log(`\n★書き込み完了：${n}件を直しました（${PROD ? 'メイン' : 'テスト版'}）`);
  process.exit(0);
})().catch(e => { console.error('エラー:', e.message); process.exit(1); });
