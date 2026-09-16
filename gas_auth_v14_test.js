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
  // 有効時間(秒)も本物どおりに効かせる（控えの期限を確かめるため）
  get:k=>{const e=cacheStore[k]; if(!e)return null; if(e.x&&e.x<=Date.now()){delete cacheStore[k];return null;} return e.v;},
  put:(k,v,sec)=>{cacheStore[k]={v,x:sec?Date.now()+sec*1000:0};}, remove:k=>{delete cacheStore[k];},
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
        authRequest_,authInvite_,authVerify_,authRenew_,authLoadDevices_,authSaveDevices_,authFindStaffByEmail_,
        authAdmins_,authAdminSave_,authAdminOf_,authAdminGate_,authResolve_,authFindStaffByUid_,
        authAdminList_,authAdminSet_,authFindDeviceByEmail_,authAdminNames_,authWriteGate_,authIsAdminOnlyKey_,authSaveCodes_,authLoadCodes_,authCodeHash_,authInviteEmail_,authHandoff_,authHandoffTake_};`,ctx);
const T=ctx.T;

const ok=[],ng=[];
const t=(n,c,e)=>{(c?ok:ng).push(n+(c?'':'  ← '+JSON.stringify(e)));};
const PFX='hub-v8-dev-';
const body=r=>{try{return JSON.parse(r.__body);}catch(e){return r.__body;}};
// 6桁はサーバーに保存されなくなった（HMACだけ）。送られたメール本文から取り出す。
// 生きているコードがあると送り直さない仕様になったので、テストでは必ず新しく出させる
const freshCode=m=>{delete cacheStore['authcnt:'+m];sentMail=[];T.authRequest_(m,PFX,'1');return lastCode();};
const lastCode=()=>{const m=String((sentMail[sentMail.length-1]||{}).body||'').match(/([0-9]{6})/);return m?m[1]:'';};

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
// 3') 返事が届かず、同じコードでやり直した（2026-09-12・竹林さん）→ 同じ利用証が返り、二重登録しない
{
  const nDev=Object.keys(T.authLoadDevices_(PFX)).length;
  const r2=body(T.authVerify_('daisuke@example.com',code,PFX,'test-ua'));
  t('返事を取りこぼした直後の同じコードは「期限切れ」にしない', r2.ok===true, r2);
  t('その時は同じ利用証が返る', r2.token===token);
  t('端末台帳は二重登録にならない', Object.keys(T.authLoadDevices_(PFX)).length===nDev);
  const r3=body(T.authVerify_('daisuke@example.com','000000',PFX,'test-ua'));
  t('違うコードでは通らない', r3.ok===false, r3);
  const realNow0=Date.now; Date.now=()=>realNow0()+16*60*1000;   // 16分後
  const r4=body(T.authVerify_('daisuke@example.com',code,PFX,'test-ua'));
  Date.now=realNow0;
  t('15分を過ぎたら同じコードでも通らない（控えの期限）', r4.ok===false&&r4.err==='expired', r4);
}

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

// 13.5) 招待メール（管理者が押す）
{
  sentMail=[];
  let r=body(T.authInvite_('stranger@example.com',PFX));
  t('未登録アドレスには招待を送らない', r.ok===false&&r.err==='not_registered'&&sentMail.length===0, r);
  r=body(T.authInvite_('  Daisuke@Example.com ',PFX));
  t('登録済みには招待を送る（前後の空白と大文字を吸収）', r.ok===true&&r.name==='見取大介'&&sentMail.length===1, r);
  const m=sentMail[0];
  t('招待の件名が「登録のお願い」', /ログインの登録をお願いします/.test(m.sub), m.sub);
  t('招待にコードを載せない（コードは端末で申し込んだ時）', !/[^0-9]d{6}[^0-9]/.test(m.body));
  t('招待に本人の名前が入る', m.body.indexOf('見取大介')===0, m.body.slice(0,20));
  t('招待にDEVの入口URLが入る', m.body.indexOf('hub-a-nice-day-dev/')>0);
  t('DEVの件名は「みどりモーターススケジュールシステムテスト版【Hub a Nice Day /DEV】」で始まる', m.sub.indexOf('みどりモーターススケジュールシステムテスト版【Hub a Nice Day /DEV】')===0, m.sub);
  sentMail=[];
  t('本番のURLは本番の入口', body(T.authInvite_('daisuke@example.com','hub-v8-')).err==='not_registered');
  t('形式が不正なら送らない', body(T.authInvite_('daisuke',PFX)).err==='bad_email');
  t('環境の指定が不正なら送らない', body(T.authInvite_('daisuke@example.com','hub-v9-')).err==='bad_prefix');
  // 送りすぎ防止（招待とコードで別枠。招待だけ連打しても認証コードは送れる）
  sentMail=[]; let sent=0;
  for(let i=0;i<8;i++){ if(body(T.authInvite_('daisuke@example.com',PFX)).ok) sent++; }
  t('招待の連打は上限で止まる', sent<=5&&sentMail.length<=5, {送れた:sent});
}

// 13.9) 招待リンクの印（?inv=）。リンクを開くだけで本人が伝わり、アドレスを打たずに6桁から始められる。
{
  const DAY = 86400000;
  delete cacheStore['authinv:daisuke@example.com']; sentMail=[];
  let r=body(T.authInvite_('daisuke@example.com',PFX));
  const m=sentMail[0];
  const link=(m.body.match(/https:\/\/\S+\?inv=([0-9a-f]{32})/)||[]);
  t('招待のリンクに印（?inv=32桁）が付く', !!link[1], m.body.slice(0,300));
  const inv=link[1];
  const code=lastCode();
  t('招待の本文に「リンクを開く→6桁」の手順', /このリンクを開く/.test(m.body) && /上の6桁を入れれば完了/.test(m.body));
  t('リンクが開けない端末向けの手順も残す', /スタッフを追加/.test(m.body) && /このアドレス/.test(m.body));
  t('印からアドレスを引ける', T.authInviteEmail_(PFX,inv)==='daisuke@example.com');
  t('でたらめな印は引けない', T.authInviteEmail_(PFX,'0'.repeat(32))==='' && T.authInviteEmail_(PFX,'abc')==='');
  // 印＋6桁だけで登録できる（アドレス無し）
  r=body(T.authVerify_('', '000000', PFX, 'test', inv));
  t('印＋違う6桁は bad_code', r.err==='bad_code', r);
  r=body(T.authVerify_('', code, PFX, 'test', inv));
  t('印＋正しい6桁で利用証が出る', r.ok===true && r.name==='見取大介', r);
  // 6桁を使い切っても、印は30日生きている → 同じリンクから送り直せる
  delete cacheStore['authcnt:daisuke@example.com']; sentMail=[];
  r=body(T.authRequest_('', PFX, '1', inv));
  t('印だけで送り直せる', r.ok===true && sentMail.length===1 && sentMail[0].to==='daisuke@example.com', r);
  r=body(T.authVerify_('', lastCode(), PFX, 'test', inv));
  t('送り直した6桁も印で通る', r.ok===true, r);
  // 印が無効（30日過ぎ・でたらめ）なら bad_invite。アドレスがあればそちらを優先
  r=body(T.authVerify_('', '123456', PFX, 'test', 'f'.repeat(32)));
  t('無効な印は bad_invite', r.err==='bad_invite', r);
  r=body(T.authRequest_('', PFX, '', 'f'.repeat(32)));
  t('無効な印では送れない', r.err==='bad_invite', r);
  const codes=JSON.parse(sheetStore[PFX+'auth-codes']);
  const k=Object.keys(codes).find(x=>x==='inv:'+inv);
  t('印の期限は約30日', !!k && Math.abs(codes[k].x-Date.now()-30*DAY)<60000, k&&codes[k]);
  // 期限切れの印は掃除される
  codes['inv:'+inv].x=Date.now()-1; sheetStore[PFX+'auth-codes']=JSON.stringify(codes);
  t('期限切れの印は引けない', T.authInviteEmail_(PFX,inv)==='');
  T.authSaveCodes_(PFX, T.authLoadCodes_(PFX));
  t('期限切れの印は保存時に捨てられる', !JSON.parse(sheetStore[PFX+'auth-codes'])['inv:'+inv]);
  // 共有端末あての招待にも印が付く
  sheetStore[PFX+'auth-devnames']=JSON.stringify([{name:'共有PC1',store:'honten',mail:'pc1@example.com'}]);
  sentMail=[];
  r=body(T.authInvite_('pc1@example.com',PFX));
  const dl=(sentMail[0].body.match(/\?inv=([0-9a-f]{32})/)||[]);
  t('共有端末の招待にも印が付く', r.device===true && !!dl[1], sentMail[0].body.slice(0,200));
  r=body(T.authVerify_('', lastCode(), PFX, 'test', dl[1]));
  t('共有端末も印＋6桁で登録できる', r.ok===true && r.device===true, r);
  delete sheetStore[PFX+'auth-devnames'];
}

// 13.95) 同じ端末で登録し直しても台帳に行が増えない（prev＝この端末が持つ利用証で前の行を置き換える）
{
  const rows=()=>Object.entries(T.authLoadDevices_(PFX)).filter(([j,v])=>v.e==='daisuke@example.com');
  const before=rows().length;
  let c=freshCode('daisuke@example.com');
  let r1=body(T.authVerify_('daisuke@example.com',c,PFX,'pc-A'));
  t('1回目の登録で行が1つ増える', r1.ok===true && rows().length===before+1, rows().length);
  c=freshCode('daisuke@example.com');
  let r2=body(T.authVerify_('daisuke@example.com',c,PFX,'pc-A',null,r1.token));
  t('前の利用証を添えて登録し直すと行が増えない', r2.ok===true && rows().length===before+1, rows().length);
  t('前の行は消え、新しい行だけ残る', !T.authLoadDevices_(PFX)[JSON.parse(Buffer.from(r1.token.split('.')[0].replace(/-/g,'+').replace(/_/g,'/'),'base64')).j]);
  // 期限切れの利用証でも「前の行」として置き換えられる
  const pay=JSON.parse(Buffer.from(r2.token.split('.')[0].replace(/-/g,'+').replace(/_/g,'/'),'base64'));
  const expired=T.authMakeToken_(pay.n,pay.m,pay.s,pay.j,false,false);
  c=freshCode('daisuke@example.com');
  const r3=body(T.authVerify_('daisuke@example.com',c,PFX,'pc-A',null,'garbage.token,'+r2.token));
  t('でたらめな値が混ざっていても、正しい前の利用証だけ効く', r3.ok===true && rows().length===before+1, rows().length);
  // 他人の利用証を添えても、その人の行は消えない（共有PCで別人を登録した場合）
  const fc=freshCode('fujiwara@example.com');
  const rf=body(T.authVerify_('fujiwara@example.com',fc,PFX,'pc-A'));
  const fRows=()=>Object.values(T.authLoadDevices_(PFX)).filter(v=>v.e==='fujiwara@example.com').length;
  const fBefore=fRows();
  c=freshCode('daisuke@example.com');
  const r4=body(T.authVerify_('daisuke@example.com',c,PFX,'pc-A',null,rf.token+','+r3.token));
  t('他人の利用証を添えても他人の行は消えない', r4.ok===true && fRows()===fBefore && rows().length===before+1, {f:fRows(),d:rows().length});
  // prev 無し（従来どおり）なら行は増える＝別の端末として扱う
  c=freshCode('daisuke@example.com');
  body(T.authVerify_('daisuke@example.com',c,PFX,'pc-B'));
  t('prev が無ければ別の端末として行が増える', rows().length===before+2, rows().length);
}

// 13.97) 登録の引き継ぎ（同じ端末の別ブラウザ／ホーム画面アイコン）。台帳に行を増やさず同じ利用証を渡す
{
  const rows=()=>Object.keys(T.authLoadDevices_(PFX)).length;
  const c=freshCode('daisuke@example.com');
  const reg=body(T.authVerify_('daisuke@example.com',c,PFX,'iphone-safari'));
  const n0=rows();
  t('利用証が無いと印を作れない', body(T.authHandoff_('hub2026co-key',PFX)).err==='expired');
  const h=body(T.authHandoff_('hub2026co-key|'+reg.token,PFX));
  t('登録済みなら引き継ぎの印が作れる（32桁）', h.ok===true && /^[0-9a-f]{32}$/.test(h.hand), h);
  const take=body(T.authHandoffTake_(h.hand,PFX));
  t('印を出すと同じ利用証が返る', take.ok===true && take.token===reg.token && take.name==='見取大介' && take.uid==='h1', take);
  t('台帳に行は増えない（同じ端末の行を共有）', rows()===n0, rows());
  t('30分の間は2回使える（Safari→アイコン）', body(T.authHandoffTake_(h.hand,PFX)).ok===true);
  t('でたらめな印は bad_hand', body(T.authHandoffTake_('0'.repeat(32),PFX)).err==='bad_hand' && body(T.authHandoffTake_('xyz',PFX)).err==='bad_hand');
  // 取り消された端末の印は使えない
  const dv=T.authLoadDevices_(PFX); const jti=JSON.parse(Buffer.from(reg.token.split('.')[0].replace(/-/g,'+').replace(/_/g,'/'),'base64')).j;
  delete dv[jti]; T.authSaveDevices_(PFX,dv);
  t('取り消された端末の印は使えない', body(T.authHandoffTake_(h.hand,PFX)).err==='revoked');
  // 30分たつと消える
  const c2=freshCode('daisuke@example.com');
  const reg2=body(T.authVerify_('daisuke@example.com',c2,PFX,'iphone-safari'));
  const h2=body(T.authHandoff_('hub2026co-key|'+reg2.token,PFX));
  const realNow=Date.now; Date.now=()=>realNow()+31*60*1000;
  t('30分たった印は使えない', body(T.authHandoffTake_(h2.hand,PFX)).err==='bad_hand');
  Date.now=realNow;
  t('引き継ぎを受ける側は利用証なしで通る（門番の例外）', T.authGate_('hub2026co-key','authHandoffTake',PFX)===null);
}

// 13.8) 6桁コードは24時間有効。ただし総当たりは試行上限で止める。
{
  const DAY = 86400000;
  const code = freshCode('daisuke@example.com');
  t('コードが6桁で送られる', /^[0-9]{6}$/.test(code), code);
  t('メールに24時間と書いてある', /24時間有効/.test(sentMail[sentMail.length-1].body));

  // ★コードそのものはサーバーに残さない。APIキーはHTMLに書かれていて秘密にできないので、
  //   平文で置くと読まれた時点で誰でもログインできてしまう。
  const stored = sheetStore[PFX + 'auth-codes'] || '';
  t('コードは保存されない（HMACだけ）', stored.indexOf(code) < 0, stored.slice(0, 120));
  t('保管場所にHMACがある', /"h":"[A-Za-z0-9_-]{20,}"/.test(stored), stored.slice(0, 120));

  const realNow = Date.now;
  // 23時間後：まだ使える（以前は10分で切れていた）
  Date.now = () => realNow() + 23 * 3600000;
  t('23時間後でもまだ使える',
    body(T.authVerify_('daisuke@example.com', code, PFX, 'test')).ok === true);
  Date.now = realNow;

  // 25時間後：切れている
  const code2 = freshCode('daisuke@example.com');
  Date.now = () => realNow() + 25 * 3600000;
  t('25時間たつと切れる',
    body(T.authVerify_('daisuke@example.com', code2, PFX, 'test')).err === 'expired');
  Date.now = realNow;

  // 総当たり対策：5回外すと、正しいコードでも通らなくなる
  const code3 = freshCode('daisuke@example.com');
  let last = null;
  for (let i = 0; i < 5; i++) last = body(T.authVerify_('daisuke@example.com', '000000', PFX, 'test'));
  t('5回までは「コードが違います」', last.err === 'bad_code', last);
  t('6回目で止まる', body(T.authVerify_('daisuke@example.com', '000000', PFX, 'test')).err === 'too_many_tries');
  t('止まったあとは正しいコードでも通らない',
    body(T.authVerify_('daisuke@example.com', code3, PFX, 'test')).err === 'expired');

  // 期限切れは掃除される（放っておくと際限なく溜まる）
  T.authSaveCodes_(PFX, { 'old@example.com': { h: 'x', t: 0, x: Date.now() - 1000 },
                          'new@example.com': { h: 'y', t: 0, x: Date.now() + DAY } });
  const kept = T.authLoadCodes_(PFX);
  t('期限切れは捨てられる', !kept['old@example.com'] && !!kept['new@example.com'], Object.keys(kept));
}

// 14) スライド式の有効期限（最後に使った日から90日）
//     毎日使う人が期限切れに遭わないこと、放置された端末は失効することを確かめる。
{
  const DAY=86400000, KEY='hub2026co-key|';
  // 本人確認を通して、まっさらな利用証を1枚作る
  sentMail=[];
  const code=freshCode('daisuke@example.com');
  const v=body(T.authVerify_('daisuke@example.com',code,PFX,'test'));
  t('延長の前提：利用証を発行できた', v.ok===true&&!!v.token, v);
  const fresh=v.token;
  const jti=T.authReadToken_(fresh).j;

  // 発行直後は延長しない（毎回シートに書くとGASが重くなるため）
  let r=body(T.authRenew_(KEY+fresh,PFX));
  t('発行直後は延長しない（書き込みを起こさない）', r.ok===true&&r.renewed===false&&!r.token, r);

  // 16日たった端末：延長され、新しい利用証が返る
  const realNow=Date.now;
  Date.now=()=>realNow()+16*DAY;
  r=body(T.authRenew_(KEY+fresh,PFX));
  t('16日たつと延長される', r.ok===true&&r.renewed===true&&!!r.token, r);
  t('延長で期限が90日先に伸びる',
    Math.round((r.exp-Date.now())/DAY)===90, Math.round((r.exp-Date.now())/DAY));
  t('台帳の期限も伸びる', T.authLoadDevices_(PFX)[jti].exp===r.exp);
  t('最後に使った日が記録される', !!T.authLoadDevices_(PFX)[jti].last);
  const renewed=r.token;

  // ★毎日使い続ける人は、いつまでも期限切れにならない
  let tok=renewed, cur=16;
  for(let i=0;i<40;i++){ cur+=16; Date.now=()=>realNow()+cur*DAY;
    const rr=body(T.authRenew_(KEY+tok,PFX)); if(rr.token) tok=rr.token; }
  Date.now=()=>realNow()+cur*DAY;
  t('16日おきに'+cur+'日（約2年）使い続けても締め出されない',
    T.authGate_(KEY+tok,'',PFX)===null, {日数:cur});

  // ★3か月まったく開かなかった端末は、自然に失効する
  Date.now=()=>realNow()+(cur+91)*DAY;
  t('91日放置すると利用証が切れる', T.authReadToken_(tok)===null);
  t('切れた利用証は延長できない（本人確認からやり直し）',
    body(T.authRenew_(KEY+tok,PFX)).err==='expired');
  t('切れた利用証では通信できない',
    body(T.authGate_(KEY+tok,'',PFX))==='unauthorized: token');
  Date.now=realNow;

  // ★管理者が取り消した端末は、延長で復活できない
  const d2=T.authLoadDevices_(PFX); delete d2[jti]; T.authSaveDevices_(PFX,d2);
  t('取り消された端末は延長できない', body(T.authRenew_(KEY+renewed,PFX)).err==='revoked');
  t('利用証なしでは延長できない', body(T.authRenew_('hub2026co-key',PFX)).err==='expired');
  t('偽造した利用証では延長できない', body(T.authRenew_(KEY+'aaa.bbb',PFX)).err==='expired');
}

// 15) 管理者の名簿（スクリプトプロパティにだけ置く）
{
  const KEY='hub2026co-key|';
  // 種火：最初の1人だけ手で設定する想定
  props['HUB_ADMIN_EMAILS']='egawa@midori-m.com=h7';
  t('名簿を読める', T.authAdmins_().length===1 && T.authAdmins_()[0].uid==='h7', T.authAdmins_());
  t('管理者かどうか判定できる', !!T.authAdminOf_('EGAWA@Midori-M.com') && !T.authAdminOf_('x@example.com'));

  // スタッフ表に loginEmail が無くても、管理者は本人を確定できる（最初の1人の堂々巡りを断つ）
  sheetStore[PFX+'honten-staff-v2']=JSON.stringify([
    {uid:'h1',name:'見取大介',myNumber:1,store:'honten',loginEmail:'daisuke@example.com'},
    {uid:'h7',name:'江川京志',myNumber:7,store:'honten'},          // loginEmail なし
  ]);
  const r0=T.authResolve_(PFX,'egawa@midori-m.com');
  t('管理者はスタッフ表に未登録でも本人が分かる', r0 && r0.name==='江川京志' && r0.admin===true, r0);
  t('一般スタッフは管理者ではない', (T.authResolve_(PFX,'daisuke@example.com')||{}).admin===false);

  // 管理者としてコードを受け取り、利用証を得る
  sentMail=[];
  delete cacheStore['authcnt:egawa@midori-m.com'];
  let r=body(T.authRequest_('egawa@midori-m.com',PFX));
  t('管理者にはコードを送る', r.ok===true && sentMail.length===1, r);
  t('管理者向けの件名になる', /管理者ログインの確認コード/.test(sentMail[0].sub), sentMail[0].sub);
  const code=lastCode();
  const v=body(T.authVerify_('egawa@midori-m.com',code,PFX,'test'));
  t('管理者の利用証が出る', v.ok===true && v.admin===true, v);
  t('利用証に管理者の印が入る', T.authReadToken_(v.token).a===1, T.authReadToken_(v.token));
  const admTok=KEY+v.token;

  // 一般スタッフの利用証では管理者の画面を開けない
  sentMail=[];
  const c2=freshCode('daisuke@example.com');
  const v2=body(T.authVerify_('daisuke@example.com',c2,PFX,'test'));
  t('一般スタッフの利用証には印が付かない', T.authReadToken_(v2.token).a===0, T.authReadToken_(v2.token));
  t('一般スタッフは名簿を見られない',
    body(T.authAdminList_(KEY+v2.token,PFX)).err==='not_admin');
  t('一般スタッフは名簿を変えられない',
    body(T.authAdminSet_(KEY+v2.token,PFX,'add','x@midori-m.com','h1')).err==='not_admin');
  t('利用証なしでは名簿を見られない', body(T.authAdminList_('hub2026co-key',PFX)).err==='not_admin');

  // 管理者は名簿を見られる・増やせる
  const li=body(T.authAdminList_(admTok,PFX));
  t('管理者は名簿を見られる', li.ok===true && li.admins.length===1 && li.admins[0].name==='江川京志', li);
  t('管理者を追加できる', body(T.authAdminSet_(admTok,PFX,'add','daisuke@example.com','h1')).count===2);
  t('追加が名簿に載る', T.authAdmins_().length===2, T.authAdmins_());
  t('同じ人を二重に足さない', body(T.authAdminSet_(admTok,PFX,'add','daisuke@example.com','h1')).count===2);
  t('形式が不正なら足さない', body(T.authAdminSet_(admTok,PFX,'add','daisuke','h1')).err==='bad_email');
  t('知らない操作は断る', body(T.authAdminSet_(admTok,PFX,'grant','x@midori-m.com','h1')).err==='bad_op');

  // 外せる。ただし最後の1人は外せない（誰も管理者画面を開けなくなるため）
  t('管理者を外せる', body(T.authAdminSet_(admTok,PFX,'remove','daisuke@example.com')).count===1);
  t('最後の1人は外せない', body(T.authAdminSet_(admTok,PFX,'remove','egawa@midori-m.com')).err==='last_admin');
  t('外せなかったので名簿は1人のまま', T.authAdmins_().length===1, T.authAdmins_());

  // ★名簿の変更は「その場で」効くこと。
  //   利用証に焼き込んだ印だけを見ていると、利用証が作り直される15日後まで
  //   外した人がコンソールを開けたままになる（外し忘れよりたちが悪い）。
  t('外した人はその場で開けなくなる', (function(){
    props['HUB_ADMIN_EMAILS']='daisuke@example.com=h1';   // 江川さんを外す
    const r = T.authAdminGate_(admTok, PFX);              // 利用証は同じまま
    props['HUB_ADMIN_EMAILS']='egawa@midori-m.com=h7';
    return r === null;
  })());
  t('外したあと名簿も見られなくなる', (function(){
    props['HUB_ADMIN_EMAILS']='daisuke@example.com=h1';
    const r = body(T.authAdminList_(admTok, PFX));
    props['HUB_ADMIN_EMAILS']='egawa@midori-m.com=h7';
    return r.err === 'not_admin';
  })());
  t('名簿に足した人はその場で開ける（入り直し不要）', (function(){
    // 一般スタッフとして発行された利用証（印は0）でも、名簿に載れば通る
    props['HUB_ADMIN_EMAILS']='egawa@midori-m.com=h7,daisuke@example.com=h1';
    const r = T.authAdminGate_(KEY+v2.token, PFX);
    props['HUB_ADMIN_EMAILS']='egawa@midori-m.com=h7';
    return r !== null;
  })());
  t('名簿に無い人は通らない', T.authAdminGate_(KEY+v2.token, PFX) === null);

  // 名簿から外れた人は、次の延長で管理者でなくなる
  props['HUB_ADMIN_EMAILS']='daisuke@example.com=h1';   // 江川さんを名簿から外す
  const realNow2=Date.now;
  Date.now=()=>realNow2()+16*86400000;
  const rr=body(T.authRenew_(admTok,PFX));
  t('名簿から外れると延長で管理者でなくなる', rr.ok===true && rr.admin===false, rr);
  t('新しい利用証にも印が付かない', T.authReadToken_(rr.token).a===0, T.authReadToken_(rr.token));
  Date.now=realNow2;
  props['HUB_ADMIN_EMAILS']='egawa@midori-m.com=h7';
}

// 16) 共有端末もメールで認証する（人とまったく同じ流れ）
{
  const KEY='hub2026co-key|';
  sheetStore[PFX+'auth-devnames']=JSON.stringify([
    {name:'共有PC1', store:'honten', mail:'pc1@midori-m.com'},
    {name:'共有PC2', store:'sanda'},                      // メール未設定
  ]);
  t('端末をメールで引ける',
    (T.authFindDeviceByEmail_(PFX,'PC1@Midori-M.com')||{}).name==='共有PC1');
  t('メール未設定の端末は引けない', T.authFindDeviceByEmail_(PFX,'')===null);

  const rv=T.authResolve_(PFX,'pc1@midori-m.com');
  t('端末は人ではなく端末として返る', !!rv && rv.device===true && rv.name==='共有PC1', rv);
  t('端末は管理者ではない', rv.admin===false);

  // 招待を送れる（端末向けの文面）
  sentMail=[];
  let r=body(T.authInvite_('pc1@midori-m.com',PFX));
  t('端末に招待を送れる', r.ok===true && r.device===true && sentMail.length===1, r);
  t('端末向けの件名になる', /共有端末「共有PC1」の登録のご案内/.test(sentMail[0].sub), sentMail[0].sub);
  t('その端末の前で操作するよう書いてある', /この端末の前で/.test(sentMail[0].body));

  // 招待に6桁が入っているので、端末で申し込んでも送り直さない
  sentMail=[];
  r=body(T.authRequest_('pc1@midori-m.com',PFX));
  t('招待の6桁が生きていれば送り直さない', r.ok===true && r.existing===true && sentMail.length===0, r);
  // 送り直しを頼めば、端末向けの件名で新しい6桁が届く
  sentMail=[];
  T.authRequest_('pc1@midori-m.com',PFX,'1');
  t('送り直すと端末向けの件名で届く', /共有端末「共有PC1」の確認コード/.test((sentMail[0]||{}).sub||''), (sentMail[0]||{}).sub);
  const code=lastCode();
  const v=body(T.authVerify_('pc1@midori-m.com',code,PFX,'ShopPC'));
  t('端末の利用証が出る', v.ok===true && v.device===true && v.label==='共有PC1', v);
  t('利用証に端末の印が入る', T.authReadToken_(v.token).v===1, T.authReadToken_(v.token));
  t('端末は管理者になれない', T.authAdminGate_(KEY+v.token,PFX)===null);
  t('端末の利用証でも通信は通る', T.authGate_(KEY+v.token,'',PFX)===null);

  const d=T.authLoadDevices_(PFX);
  const j=Object.keys(d).filter(k=>d[k].e==='pc1@midori-m.com')[0];
  t('台帳に端末として残る', !!j && d[j].dev===1 && d[j].k==='shared' && d[j].l==='共有PC1', d[j]);

  // メールが登録されていない端末には送らない
  t('メール未設定の端末には送れない',
    body(T.authInvite_('pc2@midori-m.com',PFX)).err==='not_registered');
  t('名簿にないアドレスは通らない', T.authResolve_(PFX,'stranger@example.com')===null);
  delete sheetStore[PFX+'auth-devnames'];
}

// 17) メールは1通。招待に6桁を入れて、受け取った端末でそのまま入れられる。
{
  sheetStore[PFX+'auth-devnames']=JSON.stringify([{name:'共有PC1',store:'honten',mail:'pc1@midori-m.com'}]);
  delete cacheStore['authinv:pc1@midori-m.com'];
  delete cacheStore['authcnt:pc1@midori-m.com'];
  sentMail=[];
  let r=body(T.authInvite_('pc1@midori-m.com',PFX));
  t('招待は1通で送られる', r.ok===true && sentMail.length===1, r);
  const inv=sentMail[0].body;
  const c=(inv.match(/([0-9]{6})/)||[])[1];
  t('招待に6桁が入っている', !!c, inv.slice(0,140));
  t('24時間有効と書いてある', /24時間有効/.test(inv));
  t('招待に手順も入っている', /スタッフを追加/.test(inv));
  sentMail=[];
  r=body(T.authRequest_('pc1@midori-m.com',PFX));
  t('端末で申し込んでも送り直さない', r.ok===true && r.existing===true && sentMail.length===0, r);
  const v=body(T.authVerify_('pc1@midori-m.com',c,PFX,'ShopPC'));
  t('招待に書いた6桁でそのまま登録できる', v.ok===true && v.device===true, v);
  sentMail=[];
  delete cacheStore['authcnt:pc1@midori-m.com'];
  T.authRequest_('pc1@midori-m.com',PFX,'1');
  const c2=((sentMail[0]||{}).body||'').match(/([0-9]{6})/);
  t('紛失したら送り直せる', !!c2 && c2[1]!==c, {前:c, 後:c2&&c2[1]});
  delete sheetStore[PFX+'auth-devnames'];
}

// 18) 権限：管理者しか書けないキーと、管理者の名前一覧
{
  const KEY='hub2026co-key|';
  props['HUB_ADMIN_EMAILS']='egawa@midori-m.com=h7';
  sheetStore[PFX+'honten-staff-v2']=JSON.stringify([
    {uid:'h1',name:'見取大介',myNumber:1,store:'honten',loginEmail:'daisuke@example.com'},
    {uid:'h7',name:'江川京志',myNumber:7,store:'honten',loginEmail:'egawa@midori-m.com'},
  ]);
  sheetStore[PFX+'auth-devnames']=JSON.stringify([{name:'共有PC1',store:'honten',mail:'pc1@midori-m.com'}]);

  // 名前一覧は利用証なしで読める。メールは含まない
  const nm=body(T.authAdminNames_(PFX));
  t('管理者の名前一覧を返す', nm.ok===true && nm.names.length===1 && nm.names[0]==='江川京志', nm);
  t('名前一覧にメールは含まない', JSON.stringify(nm).indexOf('@')<0);

  // どのキーが管理者専用か
  t('スタッフ表は管理者専用', T.authIsAdminOnlyKey_(PFX+'honten-staff-v2'));
  t('休業日は管理者専用', T.authIsAdminOnlyKey_(PFX+'honten-cdow') && T.authIsAdminOnlyKey_(PFX+'override-open'));
  t('予約は誰でも書ける', !T.authIsAdminOnlyKey_(PFX+'insp'));
  t('台数制限は誰でも書ける（決定②）', !T.authIsAdminOnlyKey_(PFX+'inspLimits'));
  t('各自の休日は誰でも書ける（決定①）', !T.authIsAdminOnlyKey_(PFX+'honten-dayoff'));

  // 利用証を用意する：管理者・一般・共有端末
  const tok=m=>{ sentMail=[]; delete cacheStore['authcnt:'+m]; T.authRequest_(m,PFX,'1');
    const c=lastCode(); return KEY+body(T.authVerify_(m,c,PFX,'t')).token; };
  const adm=tok('egawa@midori-m.com');
  const gen=tok('daisuke@example.com');
  const dev=tok('pc1@midori-m.com');

  t('管理者はスタッフ表に書ける', T.authWriteGate_(adm, PFX+'honten-staff-v2', PFX)===null);
  t('一般スタッフはスタッフ表に書けない', body(T.authWriteGate_(gen, PFX+'honten-staff-v2', PFX))==='unauthorized: admin');
  t('共有端末の利用証ではスタッフ表に書けない（誰が座っているか分からないため）',
    body(T.authWriteGate_(dev, PFX+'honten-staff-v2', PFX))==='unauthorized: admin');
  t('一般スタッフでも予約は書ける', T.authWriteGate_(gen, PFX+'insp', PFX)===null);
  t('一般スタッフでも台数制限は書ける', T.authWriteGate_(gen, PFX+'inspLimits', PFX)===null);
  t('一般スタッフは休業日を書けない', body(T.authWriteGate_(gen, PFX+'honten-cdate', PFX))==='unauthorized: admin');
  t('利用証なし（移行期間）は通す', T.authWriteGate_('hub2026co-key', PFX+'honten-staff-v2', PFX)===null);
  delete sheetStore[PFX+'auth-devnames'];
}

console.log('\n=== 合格 ('+ok.length+') ===');ok.forEach(s=>console.log('  ✓ '+s));
if(ng.length){console.log('\n=== 不合格 ('+ng.length+') ===');ng.forEach(s=>console.log('  ✗ '+s));process.exit(1);}
console.log('\n全'+ok.length+'件 PASS');
