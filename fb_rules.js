// firestore.rules を Firestore に配備する（サービスアカウント鍵で実行。2026-09-18）
//   node fb_rules.js          … いま配備されているルールを表示
//   node fb_rules.js --deploy … firestore.rules を配備
const fs = require('fs'), path = require('path');
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
(async () => {
  const sr = admin.securityRules();
  if (process.argv.includes('--deploy')) {
    const src = fs.readFileSync(path.join(__dirname, 'firestore.rules'), 'utf8');
    const rs = await sr.releaseFirestoreRulesetFromSource(src);
    console.log('配備しました:', rs.name, rs.createTime);
  }
  const cur = await sr.getFirestoreRuleset();
  console.log('現在のルール:', cur.name, cur.createTime);
  cur.source.forEach(f => console.log(f.content));
})().catch(e => { console.error(e.message || e); process.exit(1); });
