// 利用証の受け渡し（フロント側）の単体テスト。
//   フロントは apiKey を「本来のキー|利用証」の形で送り、GAS は '|' の前だけを
//   本来のキーとして照合する。この取り決めが両側でずれると、全通信が unauthorized になる。
//   ここではフロント3ファイルの hubApplyToken と、GAS の authBaseKey_ を突き合わせる。
//   実行: node auth_token_test.js
const fs=require('fs'),vm=require('vm'),path=require('path');

const ok=[],ng=[];
const t=(n,c,e)=>{(c?ok:ng).push(n+(c?'':'  ← '+JSON.stringify(e)));};

// ── フロント側 ──────────────────────────────────────────────
const FILES=['index_dev.html','customers.html','mobile.html'];
const applies={};
for(const f of FILES){
  const src=fs.readFileSync(path.join(__dirname,f),'utf8');
  const m=src.match(/const HUB_BASE_KEY\s*=\s*'[^']+';[\s\S]{0,200}?const hubApplyToken\s*=\s*t\s*=>\s*\{[^}]*\};/);
  if(!m){ t(f+': 受け渡しの実装を抽出できる', false, '未検出'); continue; }
  const ctx={};vm.createContext(ctx);
  vm.runInContext(m[0]+'\nthis.apply=hubApplyToken;this.get=()=>GAS_API_KEY;this.base=HUB_BASE_KEY;',ctx);
  applies[f]=ctx;
  t(f+': 受け渡しの実装を抽出できる', true);
}

// 3ファイルの本来のキーが同一（食い違うと片方だけ通らなくなる）
const bases=Object.values(applies).map(c=>c.base);
t('3ファイルの本来のキーが同一', bases.length===3 && new Set(bases).size===1, bases);

for(const [f,c] of Object.entries(applies)){
  t(f+': 認証前は本来のキーだけ', c.get()===c.base, c.get());
  c.apply('TOKEN123');
  t(f+': 利用証を載せると「キー|利用証」', c.get()===c.base+'|TOKEN123', c.get());
  c.apply('');
  t(f+': 空を渡すと認証前に戻る', c.get()===c.base, c.get());
}

// ── GAS側 ──────────────────────────────────────────────────
const gas=fs.readFileSync(path.join(__dirname,'GAS_auth_v14_module.gs'),'utf8');
const gm=gas.match(/function authBaseKey_\(rawApiKey\)\s*\{[\s\S]*?\n\}/);
if(!gm){ t('GASの authBaseKey_ を抽出できる', false, '未検出'); }
else{
  const gc={};vm.createContext(gc);
  vm.runInContext(gm[0]+'\nthis.f=authBaseKey_;',gc);
  const f=gc.f, base=bases[0];
  t('GAS: 「キー|利用証」からキーを取り出せる', f(base+'|TOKEN123')===base, f(base+'|TOKEN123'));
  t('GAS: 利用証なしでもキーを取り出せる', f(base)===base, f(base));
  t('GAS: 空でも落ちない', f('')==='' && f(undefined)==='', [f(''),f(undefined)]);
  // ★往復：フロントが作った文字列を、GASが正しく分解できること
  const c=Object.values(applies)[0];
  c.apply('ROUNDTRIP');
  t('往復：フロントの出力をGASが分解できる', f(c.get())===base, {送信:c.get(),取り出し:f(c.get())});
  c.apply('');
}

console.log('\n=== 合格 ('+ok.length+') ===');ok.forEach(s=>console.log('  ✓ '+s));
if(ng.length){console.log('\n=== 不合格 ('+ng.length+') ===');ng.forEach(s=>console.log('  ✗ '+s));process.exit(1);}
console.log('\n全'+ok.length+'件 PASS');
