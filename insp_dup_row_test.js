// 「保存直後に同じ人が次の行にも出る」不具合の単体テスト（2026-08-31 ユーザー報告）。
//   writeVerified は着地を確認できないと再送する。GASの読み取りキャッシュ(60秒)で古い値が
//   返ると未反映と誤判定し、2回目でサーバー最新値を読むと自分が1回目に書いた行が配置先に居る。
//   これを他端末の予約と誤認して空き行へ逃がしていたため、同じ予約が2行に増えていた。
//   実行: node insp_dup_row_test.js
const fs=require('fs'),vm=require('vm'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'index_dev.html'),'utf8');

// buildInspSave と依存（blankInsp / recomputeInspApproval）を切り出す
const grab=(re,label)=>{const m=src.match(re);if(!m){console.error(label+' を抽出できません');process.exit(1);}return m[0];};
const blank = grab(/^const blankInsp {2}= \(\) => \(\{.*\}\);$/m, 'blankInsp');
const recomp= grab(/^const recomputeInspApproval = \(rows, limit\) => \{[\s\S]*?^\};$/m, 'recomputeInspApproval');
const build = grab(/^const buildInspSave = \(base, p\)=>\{[\s\S]*?^\};$/m, 'buildInspSave');

const ctx={console};vm.createContext(ctx);
vm.runInContext(blank+'\n'+recomp+'\n'+build+'\nthis.buildInspSave=buildInspSave;this.blankInsp=blankInsp;',ctx);
const build2=ctx.buildInspSave, blankInsp=ctx.blankInsp;

const ok=[],ng=[];
const t=(n,c,e)=>{(c?ok:ng).push(n+(c?'':'  ← '+JSON.stringify(e)));};
const DK='2026-9-1';
const SEQ=1787900000000;
const row=(name,seq,extra)=>({name,no:1,seq,bookingStatus:'confirmed',...(extra||{})});
const names=r=>(r[DK]||[]).map(x=>(x&&x.name)?x.name:'').join(',');
const count=(r,nm)=>(r[DK]||[]).filter(x=>x&&x.name===nm&&x.bookingStatus!=='cancelled').length;
const params=(over)=>({targetDk:DK,origDk:null,isDateChange:false,dcPlaceIdx:0,modalIdx:3,
  row:{name:'沖田',no:1},limits:{},seq:SEQ,wasEditing:false,...(over||{})});

// 土台：0〜2行目が埋まっている9/1
const base3=()=>({[DK]:[row('相原',SEQ-3000),row('井上',SEQ-2000),row('上田',SEQ-1000)]});

// 1) 1回目の保存：3行目に置かれる（従来どおり）
let b=build2(base3(),params());
t('1回目は3行目に置かれる', b.idxPlace===3&&count(b.result,'沖田')===1&&!b.relocated, names(b.result));

// 2) ★本命：再送(2回目)。土台に自分の行が既に居ても、逃がさず同じ行に上書きする
let after1=b.result;
let b2=build2(after1,params());
t('再送しても同じ行のまま（重複しない）', b2.idxPlace===3&&count(b2.result,'沖田')===1&&!b2.relocated, names(b2.result));

// 3) ★既に重複しているデータは、保存し直すと自己修復される
const dup={[DK]:[row('相原',SEQ-3000),row('井上',SEQ-2000),row('上田',SEQ-1000),
                 row('沖田',SEQ),row('沖田',SEQ)]};
let b3=build2(dup,params());
t('既存の重複が1件に直る', count(b3.result,'沖田')===1, names(b3.result));

// 4) 回帰：他端末が先にその行を使っていたら、従来どおり空き行へ逃がす（上書き消失を防ぐ）
const other={[DK]:[row('相原',SEQ-3000),row('井上',SEQ-2000),row('上田',SEQ-1000),row('他端末の客',SEQ-500)]};
let b4=build2(other,params());
t('他端末の予約は上書きせず逃がす',
  b4.relocated===true&&count(b4.result,'他端末の客')===1&&count(b4.result,'沖田')===1, names(b4.result));

// 5) 回帰：同じお客様が同じ日に2台入れても、2件目が1件目を消さない（保存操作が別＝seqが違う）
const twoCars={[DK]:[row('沖田',SEQ,{custId:'C1'})]};
let b5=build2(twoCars,params({modalIdx:1,row:{name:'沖田',no:2,custId:'C1'},seq:SEQ+9999}));
t('同じ客の2台目が1台目を消さない', count(b5.result,'沖田')===2, names(b5.result));

// 6) 回帰：既存予約の編集は、その行をそのまま上書きする
const edit={[DK]:[row('相原',SEQ-3000),row('井上',SEQ-2000),row('上田',SEQ-1000),row('沖田',SEQ-100)]};
let b6=build2(edit,params({wasEditing:true,row:{name:'沖田（変更後）',no:1},seq:SEQ}));
t('編集は同じ行を上書き',
  b6.idxPlace===3&&!b6.relocated&&count(b6.result,'沖田（変更後）')===1, names(b6.result));

// 7) 回帰：他の日付・他の行を壊さない
const multi={[DK]:[row('相原',SEQ-3000)],'2026-9-2':[row('別日',SEQ-4000)]};
let b7=build2(multi,params({modalIdx:1}));
t('別の日と既存行はそのまま',
  b7.result['2026-9-2'].length===1&&b7.result['2026-9-2'][0].name==='別日'&&count(b7.result,'相原')===1,
  JSON.stringify({d1:names(b7.result),d2:b7.result['2026-9-2'].map(x=>x.name)}));

console.log('\n=== 合格 ('+ok.length+') ===');ok.forEach(s=>console.log('  ✓ '+s));
if(ng.length){console.log('\n=== 不合格 ('+ng.length+') ===');ng.forEach(s=>console.log('  ✗ '+s));process.exit(1);}
console.log('\n全'+ok.length+'件 PASS');
