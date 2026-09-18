// GAS（スプレッドシート）→ Firestore へデータを写す移行スクリプト（2026-09-18）
//   使い方:
//     node fb_migrate.js                 … DEV(hub-v8-dev-) を調べるだけ（キー一覧とサイズ。書かない）
//     node fb_migrate.js --write         … DEV を Firestore へ書く（既存ドキュメントは上書き）
//     node fb_migrate.js --prod          … 本番(hub-v8-) を調べるだけ
//     node fb_migrate.js --prod --write  … 本番を Firestore へ書く
//     node fb_migrate.js --verify        … Firestore と GAS の現在値を突き合わせる（書かない）
//   前提:
//     ・サービスアカウント鍵 … 環境変数 HUB_FB_KEY か、既定の C:\Users\A\Documents\Hub重要書類\firebase-admin.json
//       （リポジトリには絶対に入れない）
//     ・firebase-admin は %LOCALAPPDATA%\Temp\hub-verify\node_modules から読む
//   キーの集め方（GASにはキー一覧の機能が無いため）:
//     ① 日次スナップショット（kind=daily は cf-* と insp-arch を含む全キー）の最新1件のキー名
//     ② 手動スナップショット（cf-* と insp-arch 以外の全キー。いま作る）のキー名
//     ③ cf-index に載っている顧客ファイルのチャンク名
//     ④ アプリが使う既知のキー名
//     の和集合を、GAS から今の値で読み直して Firestore に書く（スナップショットの古い値は使わない）。
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const WRITE = args.includes('--write'), PROD = args.includes('--prod'), VERIFY = args.includes('--verify');
const PREFIX = PROD ? 'hub-v8-' : 'hub-v8-dev-';
const KEY_FILE = process.env.HUB_FB_KEY || 'C:\\Users\\A\\Documents\\Hub重要書類\\firebase-admin.json';
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');

// GAS の URL と APIキーは index_dev.html から読む（DEV・本番で同一）
const src = fs.readFileSync(path.join(__dirname, 'index_dev.html'), 'utf8');
const GAS_URL = (src.match(/const GAS_URL = '([^']+)'/) || [])[1];
const GAS_API_KEY = (src.match(/const HUB_BASE_KEY = '([^']+)'/) || [])[1];
if (!GAS_URL || !GAS_API_KEY) { console.error('GAS_URL / GAS_API_KEY が index_dev.html から読めません'); process.exit(1); }

const STORES = ['honten', 'sanda'];
// 写さないキー: 6桁コードの控え（GAS認証の内部・読めない）、時点保存の索引（時点保存は当面GASのまま）
const SKIP = ['auth-codes', 'snap-index'];
const KNOWN = ['insp', 'insp-arch', 'custbk', 'rres', 'cf-index', 'locks', 'cust-updates', 'notify-emails', 'staff', 'closed-days', 'auth-devices', 'auth-admins', 'cars', 'loaners', 'rentals']
  .concat(...STORES.map(s => ['sched', 'lres', 'memo', 'loaners', 'cars', 'closed'].map(b => `${s}-${b}`)));

const gasGet = async (params) => {
  const u = GAS_URL + '?' + new URLSearchParams(Object.assign({ apiKey: GAS_API_KEY }, params)).toString();
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u, { cache: 'no-store' });
      const t = await r.text();
      if (t.startsWith('<!DOCTYPE') || t.startsWith('<html')) throw new Error('HTML error page');
      return t;
    } catch (e) { if (i === 2) throw e; await new Promise(r => setTimeout(r, 3000 * (i + 1))); }
  }
};
const gasPost = async (body) => {
  const r = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ apiKey: GAS_API_KEY }, body)) });
  return r.text();
};
// まとめ読み（?keys=）。{キー: JSON文字列 | null}
const gasMany = async (keys) => {
  const out = {};
  for (let i = 0; i < keys.length; i += 15) {
    const ks = keys.slice(i, i + 15);
    const t = await gasGet({ keys: ks.join(',') });
    let map = null; try { map = JSON.parse(t); } catch (e) {}
    if (!map || typeof map !== 'object') throw new Error('まとめ読み失敗: ' + String(t).slice(0, 100));
    ks.forEach(k => { const s = map[k]; out[k] = (!s || s === 'null' || typeof s !== 'string' || s.startsWith('error:')) ? null : s; });
    process.stdout.write(`  読み取り ${Math.min(i + 15, keys.length)}/${keys.length}\r`);
  }
  console.log('');
  return out;
};

(async () => {
  console.log(`対象: ${PREFIX}  (${WRITE ? '書き込みあり' : VERIFY ? '突き合わせ' : '調査のみ'})`);
  // ① 日次スナップショットの最新
  const keys = new Set(KNOWN.map(b => PREFIX + b));
  let idx = [];
  try { idx = JSON.parse(await gasGet({ action: 'snapList', prefix: PREFIX })); } catch (e) { console.warn('snapList 失敗', e.message); }
  const daily = (idx || []).find(s => s.kind === 'daily');
  if (daily) {
    console.log('日次スナップショット:', daily.file, daily.tsText);
    const payload = JSON.parse(await gasGet({ action: 'snapRead', prefix: PREFIX, file: daily.file }));
    Object.keys(payload.keys || {}).forEach(k => keys.add(k));
  } else console.warn('日次スナップショットが見つかりません（cf-* は cf-index から辿ります）');
  // ② いまの手動スナップショット（cf-*/insp-arch 以外の全キー名を得るため）
  try {
    const fname = await gasPost({ action: 'snapNow', prefix: PREFIX, label: 'Firestore移行前' });
    if (fname && !fname.startsWith('error')) {
      console.log('手動スナップショット作成:', fname);
      const payload = JSON.parse(await gasGet({ action: 'snapRead', prefix: PREFIX, file: fname }));
      Object.keys(payload.keys || {}).forEach(k => keys.add(k));
    } else console.warn('snapNow:', fname);
  } catch (e) { console.warn('snapNow 失敗', e.message); }
  // ③ cf-index → 各ファイルの cf-{name}-index → チャンク名（customers.html の safeName と同じ規則）
  const safeName = n => n.replace(/[^a-zA-Z0-9　-鿿゠-ヿ぀-ゟ]/g, '_').slice(0, 30);
  try {
    const t = await gasGet({ key: PREFIX + 'cf-index' });
    const ci = (t && t !== 'null') ? JSON.parse(t) : [];
    const names = (Array.isArray(ci) ? ci : []).map(f => f && f.name).filter(Boolean);
    console.log('cf-index のファイル:', names.join(', ') || '(なし)');
    for (const nm of names) {
      const sn = safeName(nm);
      keys.add(PREFIX + 'cf-' + sn + '-index');
      const ti = await gasGet({ key: PREFIX + 'cf-' + sn + '-index' });
      const fi = (ti && ti !== 'null') ? JSON.parse(ti) : null;
      const n = fi && Number(fi.chunks) || 0;
      for (let i = 0; i < n; i++) keys.add(PREFIX + 'cf-' + sn + '-chunk-' + i);
    }
  } catch (e) { console.warn('cf-index 解析失敗', e.message); }
  // 自分の prefix 以外（本番のとき DEV キー）を除外
  const list = [...keys].filter(k => k.startsWith(PREFIX) && !(PREFIX === 'hub-v8-' && k.startsWith('hub-v8-dev-')) && k.indexOf('__chunk') < 0 && !SKIP.some(b => k === PREFIX + b)).sort();
  console.log(`候補キー ${list.length} 件。GAS から今の値を読みます…`);
  const vals = await gasMany(list);
  const present = list.filter(k => vals[k] !== null);
  let total = 0, big = [];
  present.forEach(k => { const n = Buffer.byteLength(vals[k], 'utf8'); total += n; if (n > 900 * 1024) big.push([k, n]); });
  console.log(`値のあるキー ${present.length} 件、合計 ${(total / 1024).toFixed(0)} KB`);
  present.forEach(k => console.log(`  ${k}  ${(Buffer.byteLength(vals[k], 'utf8') / 1024).toFixed(1)} KB`));
  if (big.length) { console.log('★ 900KB を超えるキー（Firestore の1ドキュメント上限 1MiB に近い）:'); big.forEach(([k, n]) => console.log('   ', k, (n / 1024).toFixed(0), 'KB')); }
  if (!WRITE && !VERIFY) { console.log('（調査のみ。--write で書き込み）'); return; }

  if (!fs.existsSync(KEY_FILE)) { console.error('鍵ファイルがありません:', KEY_FILE); process.exit(1); }
  const admin = require(path.join(MOD, 'firebase-admin'));
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
  const db = admin.firestore();
  const docId = k => k.replace(/\//g, '%2F');
  if (VERIFY) {
    let same = 0, diff = [], missing = [];
    for (const k of present) {
      const s = await db.collection('kv').doc(docId(k)).get();
      if (!s.exists) { missing.push(k); continue; }
      const a = JSON.stringify(JSON.parse(s.data().v)), b = JSON.stringify(JSON.parse(vals[k]));
      if (a === b) same++; else diff.push(k);
    }
    console.log(`一致 ${same} / 相違 ${diff.length} / Firestore に無い ${missing.length}`);
    diff.forEach(k => console.log('  相違:', k)); missing.forEach(k => console.log('  無い:', k));
    return;
  }
  if (big.length) { console.error('1MiB 近いキーがあるため中断します（分割が必要）'); process.exit(1); }
  let n = 0, batch = db.batch(), inBatch = 0;
  for (const k of present) {
    batch.set(db.collection('kv').doc(docId(k)), { v: vals[k], u: admin.firestore.FieldValue.serverTimestamp(), migratedFrom: 'gas', migratedAt: new Date().toISOString() });
    inBatch++; n++;
    if (inBatch >= 50) { await batch.commit(); batch = db.batch(); inBatch = 0; process.stdout.write(`  書き込み ${n}/${present.length}\r`); }
  }
  if (inBatch) await batch.commit();
  console.log(`\nFirestore に ${n} 件書きました。`);
  // 読み返し検算
  let ok = 0;
  for (const k of present) { const s = await db.collection('kv').doc(docId(k)).get(); if (s.exists && s.data().v === vals[k]) ok++; else console.log('  ✖ 検算不一致:', k); }
  console.log(`検算 ${ok}/${present.length} 一致`);
})().catch(e => { console.error(e); process.exit(1); });
