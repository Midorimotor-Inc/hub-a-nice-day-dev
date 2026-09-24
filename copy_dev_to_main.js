// テスト版（hub-v8-dev-）のデータを メイン（hub-v8-）へ写す。
//   node copy_dev_to_main.js [--from 2026-9-22] [--write]
//   ・日付ごとのデータ（車検・タイムスケジュール・仮予約・スタッフ休日・メモ・台数制限）は
//     指定日以降だけを入れ替える（それより前はメインの中身をそのまま残す）。
//   ・日付を持たないもの（代車・レンタカー・車両・タイヤ・所在地・入力補助）は丸ごと写す。
//   ・休業日（cdate/cdow/override-open）・スタッフ表・認証まわり・マイスケジュールは触らない。
//   ・顧客ファイル（cf-*）は一覧とチャンクをまとめて写す。
//   ・書き込み前に メインの全キーを C:\Users\A\Documents\Hub重要書類\backup に控える。
const fs = require('fs'), path = require('path');
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const FROM = (args.includes('--from') ? args[args.indexOf('--from') + 1] : '2026-9-22');
// スタッフ休日・有給・休日メモは、もう少し前（9/1）からコピーする（2026-09-24 ユーザー指示）
const FROM_OFF = (args.includes('--from-off') ? args[args.indexOf('--from-off') + 1] : '2026-9-1');
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(process.env.HUB_FB_KEY || 'C:\\Users\\A\\Documents\\Hub重要書類\\firebase-admin.json', 'utf8'))) });
const db = admin.firestore();
const D = 'hub-v8-dev-', M = 'hub-v8-';
const num = dk => { const p = String(dk || '').split('-').map(Number); return (p.length === 3 && p[0] > 2000) ? p[0] * 10000 + p[1] * 100 + p[2] : null; };
const FROM_N = num(FROM), FROM_OFF_N = num(FROM_OFF);
const OFF_KEYS = ['honten-dayoff','sanda-dayoff','honten-pleave','sanda-pleave','honten-offnote','sanda-offnote'];
const fromOf = k => OFF_KEYS.includes(k) ? FROM_OFF_N : FROM_N;
// 日付ごとのデータ（キーの形で日付の取り出し方が違う）
const BY_DATE = {
  'insp': k => k, 'honten-sched': k => k, 'sanda-sched': k => k, 'inspLimits': k => k,
  'honten-memo': k => k, 'sanda-memo': k => k, 'schedRestrictions': k => k,
  'honten-dayoff': k => k, 'sanda-dayoff': k => k, 'honten-pleave': k => k, 'sanda-pleave': k => k,
  'custbk': k => String(k).split('::')[1],          // 氏名::YYYY-M-D
  'honten-offnote': k => String(k).split('::')[0],  // YYYY-M-D::氏名
  'sanda-offnote': k => String(k).split('::')[0],
};
// 丸ごと写すもの
const WHOLE = ['honten-cars', 'sanda-cars', 'rentalcars', 'vehicles', 'tiredata', 'rentaloc', 'honten-lres', 'sanda-lres', 'rres', 'setItems', 'mholidays'];
const KEEP = ['休業日（cdate/cdow/override-open）', 'スタッフ表', '認証・端末・招待', 'マイスケジュール', '通知メール', '過去の車検（insp-arch）'];
const get = async k => { const d = await db.doc('kv/' + k).get(); return d.exists ? d.data().v : null; };
const J = v => { try { return JSON.parse(v); } catch (e) { return null; } };
const cnt = o => o && typeof o === 'object' ? (Array.isArray(o) ? o.length : Object.keys(o).length) : 0;
(async () => {
  console.log(`対象：スケジュール ${FROM} 以降／スタッフ休日 ${FROM_OFF} 以降＋丸ごと写すもの　${WRITE ? '★書き込みます' : '（下見・書き込みなし）'}`);
  // 顧客ファイル
  const devIdx = J(await get(D + 'cf-index')) || [];
  const cfKeys = ['cf-index'];
  for (const f of devIdx) {
    cfKeys.push('cf-' + f.name + '-index');
    const idx = J(await get(D + 'cf-' + f.name + '-index'));
    for (let i = 0; i < ((idx && idx.chunks) || 0); i++) cfKeys.push('cf-' + f.name + '-chunk-' + i);
  }
  const plan = [];
  for (const k of Object.keys(BY_DATE)) {
    const dev = J(await get(D + k)) || {}, main = J(await get(M + k)) || {};
    const pick = BY_DATE[k];
    const fn = fromOf(k);
    const keepOld = Object.keys(main).filter(x => { const n = num(pick(x)); return n === null || n < fn; });
    const add = Object.keys(dev).filter(x => { const n = num(pick(x)); return n !== null && n >= fn; });
    const dropNew = Object.keys(main).filter(x => { const n = num(pick(x)); return n !== null && n >= fn; });
    const out = {}; keepOld.forEach(x => out[x] = main[x]); add.forEach(x => out[x] = dev[x]);
    plan.push({ k, kind: '日付', out, msg: `[${OFF_KEYS.includes(k)?FROM_OFF:FROM} 以降] メインに残す ${keepOld.length} ／ テスト版から入れる ${add.length} ／ 置き換わる ${dropNew.length}` });
  }
  for (const k of WHOLE.concat(cfKeys)) {
    const dev = await get(D + k);
    if (dev == null) { plan.push({ k, kind: '丸ごと', skip: true, msg: 'テスト版に無いので飛ばす' }); continue; }
    plan.push({ k, kind: '丸ごと', raw: dev, msg: `${cnt(J(dev))}件 → 丸ごと入れ替え（今のメイン ${cnt(J(await get(M + k)))}件）` });
  }
  console.log('\n■ そのまま残すもの：' + KEEP.join(' / '));
  console.log('\n■ 日付ごとのデータ（' + FROM + ' 以降だけ入れ替え）');
  plan.filter(p => p.kind === '日付').forEach(p => console.log('   ' + p.k.padEnd(20) + p.msg));
  console.log('\n■ 丸ごと写すもの');
  plan.filter(p => p.kind === '丸ごと').forEach(p => console.log('   ' + p.k.padEnd(24) + p.msg));
  if (!WRITE) { console.log('\n（下見だけです。書き込むには --write を付けてください）'); process.exit(0); }

  const q = await db.collection('kv').get();
  const back = {}; q.forEach(d => { if (d.id.startsWith(M) && !d.id.startsWith(D)) back[d.id] = d.data().v; });
  const dir = 'C:/Users/A/Documents/Hub重要書類/backup';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const bf = dir + '/main-kv-' + new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '') + '.json';
  fs.writeFileSync(bf, JSON.stringify(back));
  console.log('\n★メインの控え:', bf, '（' + Object.keys(back).length + 'キー）');

  let n = 0;
  for (const p of plan) {
    if (p.skip) continue;
    const v = p.raw !== undefined ? p.raw : JSON.stringify(p.out);
    await db.doc('kv/' + M + p.k).set({ v, u: admin.firestore.FieldValue.serverTimestamp() });
    n++; if (n % 10 === 0) console.log('  …' + n);
  }
  // 読み返し
  let ok = 0, ng = [];
  for (const p of plan) {
    if (p.skip) continue;
    const b = await get(M + p.k);
    const want = p.raw !== undefined ? p.raw : JSON.stringify(p.out);
    if (b === want) ok++; else ng.push(p.k);
  }
  console.log(`\n★書き込み完了：${n}本　読み返し一致 ${ok}本${ng.length ? ' ／ 不一致 ' + ng.length + '本：' + ng.slice(0, 5).join(', ') : ''}`);
  process.exit(ng.length ? 1 : 0);
})().catch(e => { console.error('エラー:', e.message); process.exit(1); });
