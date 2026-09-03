// GAS_server_v10_snapshots.gs + GAS_auth_v14_module.gs → GAS_server_v14_auth.gs を生成する。
//   手で貼り付けて編集すると全角化けや貼り損ねが起きるため、機械的に作って人為ミスを無くす。
//   既存988行には一切触れず、入口3箇所だけを差し替えてモジュールを末尾に足す。
//   実行: node build_gas_v14.js
const fs=require('fs'),path=require('path');
const SRC=path.join(__dirname,'GAS_server_v10_snapshots.gs');
const MOD=path.join(__dirname,'GAS_auth_v14_module.gs');
const OUT=path.join(__dirname,'GAS_server_v14_auth.gs');

let s=fs.readFileSync(SRC,'utf8');
const mod=fs.readFileSync(MOD,'utf8');
const before=s.length;
const done=[];

// 置換は「見つからなければ中断」。既存コードが変わったのに気づかず生成するのを防ぐ。
const sub=(label,from,to)=>{
  const n=s.split(from).length-1;
  if(n!==1){console.error(`✖ 中断: 「${label}」が ${n} 箇所（1箇所であるべき）。既存コードが変わった可能性があります。`);process.exit(1);}
  s=s.replace(from,to);
  done.push(label);
};

// ① doGet: APIキー照合を「|の前だけ」に変え、利用証の門番と認証アクションを足す
sub('doGet の入口',
`function doGet(e) {
  if (!e.parameter || e.parameter.apiKey !== HUB_API_KEY) {
    return makeResponse('unauthorized');
  }`,
`function doGet(e) {
  // v14: apiKey は "本来のキー|利用証" の形で届くことがある。照合は '|' の前だけを見る。
  if (!e.parameter || authBaseKey_(e.parameter.apiKey) !== HUB_API_KEY) {
    return makeResponse('unauthorized');
  }
  // v14: 認証そのもの（コード送信・照合）は利用証を要求しない
  if (e.parameter.action === 'authRequest') {
    return authRequest_(e.parameter.email, authPrefixOf_(e.parameter));
  }
  if (e.parameter.action === 'authVerify') {
    return authVerify_(e.parameter.email, e.parameter.code, authPrefixOf_(e.parameter), e.parameter.ua);
  }
  // v14: 利用証の門番。HUB_AUTH_ENFORCE='1' を入れるまでは素通りする（段階移行）
  var _gate = authGate_(e.parameter.apiKey, e.parameter.action, authPrefixOf_(e.parameter));
  if (_gate) return _gate;`);

// ② doPost: 同上
sub('doPost の入口',
`  if (body.apiKey !== HUB_API_KEY) { return makeResponse('unauthorized'); }`,
`  // v14: apiKey は "本来のキー|利用証" の形で届くことがある。照合は '|' の前だけを見る。
  if (authBaseKey_(body.apiKey) !== HUB_API_KEY) { return makeResponse('unauthorized'); }
  // v14: 利用証の門番。HUB_AUTH_ENFORCE='1' を入れるまでは素通りする（段階移行）
  var _gateP = authGate_(body.apiKey, body.action, authPrefixOf_(body));
  if (_gateP) return _gateP;`);

// ③ caps: フロントが「このGASは認証に対応している」と判別できるようにする
sub('caps の申告',
`    if (e.parameter.action === 'caps') {
      return makeResponse(JSON.stringify({ patchInsp: true, notifyFail: true, snapshots: true, setMany: true, ver: 'v13' }));
    }`,
`    if (e.parameter.action === 'caps') {
      return makeResponse(JSON.stringify({ patchInsp: true, notifyFail: true, snapshots: true, setMany: true, auth: true, enforced: { prod: authEnforced_('hub-v8-'), dev: authEnforced_('hub-v8-dev-') }, ver: 'v14' }));
    }`);

const out=s+'\n\n'+mod;
fs.writeFileSync(OUT,out,'utf8');

// ── 生成物の自己点検 ───────────────────────────────────────────────
const check=(label,cond)=>console.log((cond?'  ✔ ':'  ✖ ')+label);
let depth=0,bad=false,inStr=false,q='',inLine=false,inBlock=false;
for(let i=0;i<out.length;i++){
  const c=out[i],n=out[i+1];
  if(inLine){ if(c==='\n')inLine=false; continue; }
  if(inBlock){ if(c==='*'&&n==='/'){inBlock=false;i++;} continue; }
  if(inStr){ if(c==='\\'){i++;continue;} if(c===q)inStr=false; continue; }
  if(c==='/'&&n==='/'){inLine=true;i++;continue;}
  if(c==='/'&&n==='*'){inBlock=true;i++;continue;}
  if(c==='"'||c==="'"||c==='`'){inStr=true;q=c;continue;}
  if(c==='{')depth++; else if(c==='}'){depth--; if(depth<0)bad=true;}
}
console.log('\n=== 生成結果 ===');
console.log('  差し替えた箇所: '+done.join(' / '));
console.log('  元: '+before.toLocaleString()+'字 → 生成: '+out.length.toLocaleString()+'字');
check('波括弧の対応が取れている', !bad&&depth===0);
check('認証モジュールが含まれている', out.indexOf('function authGate_')>0);
check('doGet に門番が入った', out.indexOf('var _gate = authGate_')>0);
check('doPost に門番が入った', out.indexOf('var _gateP = authGate_')>0);
check('caps が v14 を申告する', out.indexOf("ver: 'v14'")>0);
check('既存のアクションが残っている',
  ['patchInsp','setMany','snapRestore','notifyFail'].every(a=>out.indexOf("action === '"+a+"'")>0));
check('APIキーの直接照合が残っていない',
  out.indexOf('e.parameter.apiKey !== HUB_API_KEY')<0 && out.indexOf('body.apiKey !== HUB_API_KEY')<0);
console.log('\n出力: '+OUT);
