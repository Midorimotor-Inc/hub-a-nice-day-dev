// 利用者認証(v14)のGASモジュール単体テスト。デプロイ前に署名・期限・取り消し・段階移行を確かめる。
//   GAS固有のAPI（Utilities/PropertiesService/CacheService/MailApp/シート）はNodeで模擬する。
//   実行: node gas_auth_v14_test.js
const fs=require('fs'),vm=require('vm'),path=require('path'),crypto=require('crypto');
const src=fs.readFileSync(path.join(__dirname,'GAS_auth_v14_module.gs'),'utf8');

// ── GAS APIの模擬 ──────────────────────────────────────────────
const b64url=b=>Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const props={}, cacheStore={}, sheetStore={}; let sentMail=[];
const Utilities={
  base64EncodeWebSafe:b=>b64url(Buffer.isBuffer(b)?b:Buffer.from(b)),
  base64DecodeWebSafe:s=>Buffer.from(String(s).replace(/-/g,'+').replace(/_/g,'/'),'base64'),
  computeHmacSha256Signature:(v,k)=>crypto.createHmac('sha256',String(k)).update(String(v)).digest(),
  newBlob:x=>({getBytes:()=>Buffer.from(x),getDataAsString:()=>Buffer.from(x).toString('utf8')}),
  getUuid:()=>crypto.randomUUID(),
};
const PropertiesService={getScriptProperties:()=>({
  getProperty:k=>(k in props?props[k]:null), setProperty:(k,v)=>{props[k]=v;},
})};
const CacheService={getScriptCache:()=>({
  get:k=>(k in cacheStore?cacheStore[k]:null),
  put:(k,v)=>{cacheStore[k]=v;}, remove:k=>{delete cacheStore[k];},
})};
const MailApp={sendEmail:(to,sub,body)=>{sentMail.push({to,sub,body});}};
const LockService={getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})};
const Logger={log:()=>{}};
// シート層の模擬（既存サーバーの関数と同じ名前・同じ役割）
const getSheet=()=>({});
const readOneValue=(sheet,cache,key)=>(key in sheetStore?sheetStore[key]:null);
const writeRow=(sheet,key,value)=>{sheetStore[key]=value;};
const driveWrite=(key,content)=>{sheetStore[key]=content;};
const invalidateCache=k=>{delete cacheStore[k];};
const makeResponse=t=>({__body:String(t)});
const BIG_THRESHOLD=30000, FILE_MARKER='__DRIVEFILE__';
const SNAP_ENV_PREFIXES=['hub-v8-','hub-v8-dev-'];

const ctx={Utilities,PropertiesService,CacheService,MailApp,LockService,Logger,console,
  getSheet,readOneValue,writeRow,driveWrite,invalidateCache,makeResponse,
  BIG_THRESHOLD,FILE_MARKER,SNAP_ENV_PREFIXES,Date};
vm.createContext(ctx);
vm.runInContext(src+`
this.T={authMakeToken_,authReadToken_,authValid_,authGate_,authBaseKey_,authPrefixOf_,
        authRequest_,authVerify_,authLoadDevices_,authSaveDevices_,authFindStaffByEmail_};`,ctx);
const T=ctx.T;

const ok=[],ng=[];
const t=(n,c,e)=>{(c?ok:ng).push(n+(c?'':'  ← '+JSON.stringify(e)));};
const PFX='hub-v8-dev-';
const body=r=>{try{return JSON.parse(r.__body);}catch(e){return r.__body;}};

// 管理者が登録したスタッフ表（loginEmail つき）
sheetStore[PFX+'honten-staff-v2']=JSON.stringify([
  {uid:'h1',name:'見取大介',myNumber:1,store:'honten',loginEmail:'daisuke@example.com'},
  {uid:'h2',name:'岡上秀一',myNumber:2,store:'honten'},               // 未登録
]);
sheetStore[PFX+'sanda-staff-v2']=JSON.stringify([
  {uid:'s10',name:'藤原昭人',myNumber:10,store:'sanda',loginEmail:'Fujiwara@Example.com'},
]);

// 1) メールで本人を特定できる（大文字小文字は無視）
t('メールから本人を特定', (T.authFindStaffByEmail_(PFX,'daisuke@example.com')||{}).name==='見取大介');
t('大文字小文字を無視', (T.authFindStaffByEmail_(PFX,'fujiwara@example.com')||{}).name==='藤原昭人');
t('未登録アドレスは特定できない', T.authFindStaffByEmail_(PFX,'stranger@example.com')===null);

// 2) コード送信 → 未登録には送らない
sentMail=[];
let r=body(T.authRequest_('stranger@example.com',PFX));
t('未登録にはコードを送らない', r.ok===false&&r.err==='not_registered'&&sentMail.length===0,r);
r=body(T.authRequest_('daisuke@example.com',PFX));
t('登録済みにはコードを送る', r.ok===true&&sentMail.length===1,r);
const code=(sentMail[0].body.match(/\b(\d{6})\b/)||[])[1];
t('6桁コードがメール本文に入る', !!code, sentMail[0].body.slice(0,80));

// 3) 誤ったコードは弾く／正しいコードで利用証が出る
r=body(T.authVerify_('daisuke@example.com','000000',PFX,'test-ua'));
t('誤ったコードは弾く', r.ok===false&&r.err==='bad_code',r);
r=body(T.authVerify_('daisuke@example.com',code,PFX,'test-ua'));
t('正しいコードで利用証が出る', r.ok===true&&!!r.token&&r.name==='見取大介'&&r.myNumber===1,r);
const token=r.token;

// 4) 氏名・ナンバーはサーバーが決める（本人の自己申告ではない）
const payload=T.authReadToken_(token);
t('利用証に本人の氏名とナンバーが入る', payload&&payload.n==='見取大介'&&payload.m===1,payload);

// 5) 改ざん検知
t('署名を書き換えた利用証は通らない', T.authReadToken_(token.split('.')[0]+'.'+b64url('にせもの'))===null);
t('本文を書き換えた利用証は通らない',
  T.authReadToken_(b64url(JSON.stringify({n:'社長',m:0,s:'honten',j:payload.j,x:payload.x}))+'.'+token.split('.')[1])===null);
t('でたらめな文字列は通らない', T.authReadToken_('abc.def')===null&&T.authReadToken_('')===null);

// 6) 期限切れ
const expired=T.authMakeToken_('見取大介',1,'honten',payload.j);
const realNow=Date.now;
Date.now=()=>realNow()+91*86400000;                    // 91日後に進める
t('期限切れの利用証は通らない', T.authReadToken_(expired)===null);
Date.now=realNow;

// 7) 段階移行：ENFORCE 未設定なら利用証なしでも通る
//    ※判定は60秒キャッシュされるので、切替の反映には最大60秒かかる（運用上の仕様）。
//      テストではキャッシュを捨てて即時に切り替える。
const clearEnforceCache=()=>{Object.keys(cacheStore).forEach(k=>{if(k.indexOf('authenforce')===0)delete cacheStore[k];});};
delete props.HUB_AUTH_ENFORCE; delete props.HUB_AUTH_ENFORCE_DEV; clearEnforceCache();
t('移行期間は利用証なしでも通る', T.authGate_('hub2026co-key','','hub-v8-dev-')===null);

// 7-b) ★DEVと本番でスイッチが独立している（同じGASを共有しているため必須）
props.HUB_AUTH_ENFORCE_DEV='1'; clearEnforceCache();
t('DEVだけ必須にできる', body(T.authGate_('hub2026co-key','','hub-v8-dev-')).indexOf('unauthorized')===0);
t('その時 本番は影響を受けない', T.authGate_('hub2026co-key','','hub-v8-')===null);

// 8) 本番も ENFORCE=1 で必須になる
props.HUB_AUTH_ENFORCE='1'; clearEnforceCache();
t('切替後は利用証なしを弾く', body(T.authGate_('hub2026co-key','',PFX)).indexOf('unauthorized')===0);
t('切替後も正しい利用証は通る', T.authGate_('hub2026co-key|'+token,'',PFX)===null);
t('認証用アクションは切替後も素通り（締め出し防止）',
  T.authGate_('hub2026co-key','authRequest',PFX)===null&&T.authGate_('hub2026co-key','authVerify',PFX)===null);

// 9) 管理者が端末を取り消すと、その利用証は即座に無効になる
const devs=T.authLoadDevices_(PFX);
t('台帳に端末が1件登録されている', Object.keys(devs).length===1, devs);
delete devs[payload.j];
T.authSaveDevices_(PFX,devs);
t('取り消した端末は弾かれる', body(T.authGate_('hub2026co-key|'+token,'',PFX))==='unauthorized: revoked');
t('署名自体は有効なまま（取り消しは台帳側で効いている）', T.authReadToken_(token)!==null);

// 10) apiKey から本来のキーを取り出せる（既存の照合を壊さない）
t('|の前だけを本来のキーとして取り出す',
  T.authBaseKey_('hub2026co-key|'+token)==='hub2026co-key'&&T.authBaseKey_('hub2026co-key')==='hub2026co-key');

// 11) 環境プレフィックスの検証（DEVのキーで本番を触らせない）
t('不正なプレフィックスは拒否', body(T.authRequest_('daisuke@example.com','hub-v9-')).err==='bad_prefix');

// 12) 環境の判定：本番とDEVの台帳を取り違えない
//     'hub-v8-dev-' は 'hub-v8-' にも前方一致するので、長いほうを先に見る必要がある
t('DEVのキーはDEVと判定', T.authPrefixOf_({key:'hub-v8-dev-insp'})==='hub-v8-dev-');
t('本番のキーは本番と判定', T.authPrefixOf_({key:'hub-v8-insp'})==='hub-v8-');
t('明示のprefixが最優先', T.authPrefixOf_({prefix:'hub-v8-',key:'hub-v8-dev-insp'})==='hub-v8-');
t('まとめ読み(keys=)でも判定できる', T.authPrefixOf_({keys:'hub-v8-dev-insp,hub-v8-dev-custbk'})==='hub-v8-dev-');
t('setManyのitemsからも判定できる', T.authPrefixOf_({items:[{key:'hub-v8-dev-insp'}]})==='hub-v8-dev-');
t('手掛かりが無い時は本番扱い（安全側）', T.authPrefixOf_({})==='hub-v8-'&&T.authPrefixOf_(null)==='hub-v8-');

// 13) 取り消しは環境ごとに独立（DEVで取り消しても本番の同じ端末は生きている、の裏返し確認）
t('別環境の台帳を見ると未登録扱いになる',
  body(T.authGate_('hub2026co-key|'+token,'','hub-v8-'))==='unauthorized: revoked');

console.log('\n=== 合格 ('+ok.length+') ===');ok.forEach(s=>console.log('  ✓ '+s));
if(ng.length){console.log('\n=== 不合格 ('+ng.length+') ===');ng.forEach(s=>console.log('  ✗ '+s));process.exit(1);}
console.log('\n全'+ok.length+'件 PASS');
