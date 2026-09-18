// 許可簿（Firestore meta/allowed）の初期投入・確認（2026-09-18）
//   node fb_seed_allowed.js                       … 今の許可簿を表示
//   node fb_seed_allowed.js --seed [--prod]        … スタッフ表(loginEmail)と共有端末(auth-devnames の mail)から許可簿へ写す（既存は保持）
//   node fb_seed_allowed.js --admin a@x.com[,b@y]  … 管理者にする
//   node fb_seed_allowed.js --off a@x.com          … 無効にする（active=false）
//   node fb_seed_allowed.js --test-user add|remove … 検査用の利用者（fbtest@hub-test.invalid）を足す／消す
const fs = require('fs'), path = require('path');
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
const db = admin.firestore();
const args = process.argv.slice(2);
const has = f => args.includes(f);
const val = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : ''; };
const PREFIX = has('--prod') ? 'hub-v8-' : 'hub-v8-dev-';
const ekey = e => String(e || '').trim().toLowerCase().replace(/\./g, ',');
const TEST_EMAIL = 'fbtest@hub-test.invalid';
const ref = db.collection('meta').doc('allowed');
const kv = async k => { const s = await db.collection('kv').doc(k).get(); return s.exists ? JSON.parse(s.data().v) : null; };
(async () => {
  const cur = (await ref.get()).data() || {};
  const patch = {};
  if (has('--seed')) {
    for (const st of ['honten', 'sanda']) {
      const list = (await kv(PREFIX + st + '-staff-v2')) || [];
      for (const x of list) {
        if (!x || !x.loginEmail) continue;
        const k = ekey(x.loginEmail), prev = cur[k] || {};
        patch[k] = Object.assign({ role: 'staff', active: true, kind: 'staff' }, prev, { email: String(x.loginEmail).trim().toLowerCase(), name: x.name, store: x.store || st, uid: x.uid || '', at: Date.now() });
      }
    }
    const devs = (await kv(PREFIX + 'auth-devnames')) || [];
    for (const d of devs) {
      if (!d || !d.mail) continue;
      const k = ekey(d.mail), prev = cur[k] || {};
      patch[k] = Object.assign({ role: 'staff', active: true }, prev, { email: String(d.mail).trim().toLowerCase(), name: d.name, store: d.store || 'honten', uid: '', kind: 'device', label: d.name, at: Date.now() });
    }
  }
  if (val('--admin')) for (const m of val('--admin').split(',')) { const k = ekey(m); patch[k] = Object.assign({ email: m.trim().toLowerCase(), active: true, kind: 'staff', name: '', store: 'honten', uid: '' }, cur[k] || {}, patch[k] || {}, { role: 'admin' }); }
  if (val('--off')) { const k = ekey(val('--off')); patch[k] = Object.assign({}, cur[k] || {}, patch[k] || {}, { active: false }); }
  if (val('--test-user') === 'add') patch[ekey(TEST_EMAIL)] = { email: TEST_EMAIL, name: 'テスト', store: 'honten', uid: 'a1789107465703', role: 'staff', active: true, kind: 'staff', at: Date.now() };
  if (val('--test-user') === 'remove') patch[ekey(TEST_EMAIL)] = admin.firestore.FieldValue.delete();
  if (Object.keys(patch).length) { await ref.set(patch, { merge: true }); console.log('更新:', Object.keys(patch).map(k => k.replace(/,/g, '.')).join(', ')); }
  const all = (await ref.get()).data() || {};
  console.log('許可簿:');
  Object.keys(all).sort().forEach(k => { const a = all[k]; console.log(`  ${a.email || k}  ${a.name || ''}  ${a.store || ''}  ${a.role || ''}${a.kind === 'device' ? ' [共有端末]' : ''}${a.active === false ? ' (無効)' : ''}`); });
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
