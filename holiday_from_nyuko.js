// 車検入庫表の備考にある「○○休み」（黄色の網掛け）を、スタッフ休日（{店}-dayoff）に写す。
//   node holiday_from_nyuko.js <入庫表.xlsx> [...] [--prod] [--write] [--clean]
//   ・本店は J列（備考）、三田は T列（備考）。「岡上休み江川休み」のように続けて書かれていても読む
//   ・呼び名（大介・カビン・両澤 …）はスタッフ表の氏名に直す。分からない呼び名は一覧に出して入れない
//   ・--clean を付けると、予約の備考に紛れ込んだ「○○休み」の行を消す（入庫表の備考をコピーした時の巻き添え）
const path = require('path'), fs = require('fs');
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
let chromium; for (const b of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) { try { chromium = require(path.join(b, 'node_modules', 'playwright')).chromium; break; } catch (e) {} }
const args = process.argv.slice(2);
const FILES = args.filter(a => !a.startsWith('--') && fs.existsSync(a));
const PROD = args.includes('--prod'), WRITE = args.includes('--write'), CLEAN = args.includes('--clean');
const P = PROD ? 'hub-v8-' : 'hub-v8-dev-';
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(process.env.HUB_FB_KEY || 'C:\\Users\\A\\Documents\\Hub重要書類\\firebase-admin.json', 'utf8'))) });
const db = admin.firestore();
const get = async k => { const d = await db.doc('kv/' + k).get(); return d.exists ? JSON.parse(d.data().v || 'null') : null; };
const set = async (k, v) => db.doc('kv/' + k).set({ v: JSON.stringify(v), u: admin.firestore.FieldValue.serverTimestamp() });
const jp = dk => { const [y, m, d] = dk.split('-').map(Number); return `${m}/${d}(${'日月火水木金土'[new Date(y, m - 1, d).getDay()]})`; };
// 呼び名 → スタッフ表の氏名（スタッフ表に無い呼び名だけ書く）
const NICK = { '大介': '見取大介', '岡上': '岡上秀一', '竹林': '竹林直行', '幸田': '幸田かつのり', '魚住': '魚住圭', '舟田': '舟田祥子', '江川': '江川京志',
  '藤原': '藤原昭人', '中井': '中井啓介', '両澤': '両澤ちよう', '野呂': '野呂遥奈', '勇一': '見取勇一', '見取': '見取大介' };
(async () => {
  if (!FILES.length) { console.error('入庫表のファイルを指定してください'); process.exit(1); }
  const staff = {};
  for (const s of ['honten', 'sanda']) staff[s] = (await get(P + s + '-staff-v2') || []).map(x => x && x.name).filter(Boolean);
  const nameOf = (tok, store) => {
    const t = String(tok || '').replace(/[\s　]/g, '');
    if (!t) return '';
    const list = staff[store] || [];
    if (list.includes(t)) return t;
    if (NICK[t] && list.includes(NICK[t])) return NICK[t];
    const hit = list.find(n => n.startsWith(t)) || list.find(n => n.replace(/[\s　]/g, '').includes(t));
    if (hit) return hit;
    // もう一方の店にいる人（入庫表の欄を間違えている時）
    const other = store === 'honten' ? 'sanda' : 'honten';
    const h2 = (staff[other] || []).find(n => n === t || n.startsWith(t)) || (NICK[t] && (staff[other] || []).includes(NICK[t]) ? NICK[t] : '');
    return h2 ? '\u0001' + h2 + '\u0001' + other : '';   // 相手の店で見つかった印
  };
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');
  await page.addScriptTag({ url: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js' });
  const notes = [];
  for (const f of FILES) {
    const b64 = fs.readFileSync(f).toString('base64');
    const got = await page.evaluate(([b64]) => {
      const wb = XLSX.read(b64, { type: 'base64', cellDates: true, cellStyles: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const ref = XLSX.utils.decode_range(ws['!ref']);
      const out = []; let dk = '';
      for (let R = ref.s.r; R <= ref.e.r; R++) {
        const a0 = ws[XLSX.utils.encode_cell({ r: R, c: 0 })];
        if (a0 && a0.v instanceof Date && a0.v.getFullYear() > 2000) dk = a0.v.getFullYear() + '-' + (a0.v.getMonth() + 1) + '-' + a0.v.getDate();
        if (!dk) continue;
        for (const b of [{ s: 'honten', c: 9 }, { s: 'sanda', c: 19 }]) {   // J列 / T列（備考）
          const cell = ws[XLSX.utils.encode_cell({ r: R, c: b.c })];
          if (!cell || cell.v === undefined) continue;
          const t = String(cell.v);
          if (t.indexOf('休') < 0) continue;
          const fg = (cell.s && cell.s.fgColor && cell.s.fgColor.rgb) || '';
          out.push({ dk, store: b.s, text: t, yellow: /^(FF)?FFFF00$/i.test(fg) });
        }
      }
      return out;
    }, [b64]);
    console.log(path.basename(f) + '：休みの記載 ' + got.length + '件');
    notes.push(...got);
  }
  await browser.close();

  const off = { honten: (await get(P + 'honten-dayoff')) || {}, sanda: (await get(P + 'sanda-dayoff')) || {} };
  const added = [], unknown = {}, moved = [];
  for (const n of notes) {
    for (const m of n.text.matchAll(/([^\s　、,]+?)\s*休み/g)) {
      const raw = m[1].replace(/[\s　]/g, '');
      if (!raw) continue;
      let who = nameOf(raw, n.store), st = n.store;
      if (who && who[0] === '\u0001') { const p2 = who.split('\u0001'); who = p2[1]; st = p2[2]; moved.push(`${jp(n.dk)} ${raw}（${st === 'sanda' ? '三田' : '本店'}の人として入れます）`); }
      if (!who) { unknown[raw] = (unknown[raw] || 0) + 1; continue; }
      const cur = Array.isArray(off[st][n.dk]) ? off[st][n.dk] : [];
      if (!cur.includes(who)) { off[st][n.dk] = cur.concat([who]); added.push(`${jp(n.dk)} ${st === 'sanda' ? '三田' : '本店'} ${who}`); }
    }
  }
  console.log(`\n■ 入れる休日：${added.length}件`);
  added.slice(0, 20).forEach(x => console.log('   ' + x));
  if (moved.length) { console.log('\n■ 店の欄が入れ替わっていた分：' + moved.length + '件'); moved.slice(0, 8).forEach(x => console.log('   ' + x)); }
  if (Object.keys(unknown).length) { console.log('\n■ 誰か分からない呼び名（入れていません）'); Object.entries(unknown).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`   「${k}」${v}回`)); }
  // 予約の備考に紛れた「○○休み」を消す
  let cleaned = 0;
  const insp = await get(P + 'insp') || {};
  if (CLEAN) {
    for (const dk of Object.keys(insp)) for (const r of (insp[dk] || [])) {
      if (!r || !r.note) continue;
      const keep = String(r.note).split('\n').filter(line => !/休み/.test(line) || /[0-9:：]/.test(line));
      if (keep.length !== String(r.note).split('\n').length) { r.note = keep.join('\n'); cleaned++; }
    }
    console.log(`\n■ 予約の備考から「○○休み」を消す：${cleaned}件`);
  }
  if (!WRITE) { console.log('\n（下見だけです。書き込むには --write を付けてください）'); process.exit(0); }
  await set(P + 'honten-dayoff', off.honten);
  await set(P + 'sanda-dayoff', off.sanda);
  if (CLEAN && cleaned) await set(P + 'insp', insp);
  const h = await get(P + 'honten-dayoff'), s = await get(P + 'sanda-dayoff');
  console.log(`\n★書き込み完了：本店 ${Object.keys(h).length}日 ／ 三田 ${Object.keys(s).length}日${CLEAN ? ` ／ 備考の掃除 ${cleaned}件` : ''}`);
  process.exit(0);
})().catch(e => { console.error('エラー:', e.message); process.exit(1); });
