// モバイルの代車ラベル解決の回帰テスト
// ★2026-08-28の実例：9/1 岩田の下に「N-BOX(9012)だけの行」が出た。
//   代車のbookingKeyは行0を指していたが、岩田本人は行2に居た（保存時に行が動いたため）。
//   氏名の無い空き行に代車を出さないこと、他人の行に出さないことを固定する。
const fs=require('fs'),vm=require('vm'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'mobile.html'),'utf8');
const pick=(re,label)=>{const m=src.match(re);if(!m){console.error('抽出できません: '+label);process.exit(1);}return m[0];};
const code=pick(/const toNum=[^\n]*\n/,'toNum')
         + pick(/const getLoanerLabel=\(loanerRes,dk,rowName,bookingKey,carsList\)=>\{[\s\S]*?\n\};/,'getLoanerLabel');
const ctx={};vm.createContext(ctx);
vm.runInContext(code+'\nthis.getLoanerLabel=getLoanerLabel;',ctx);
const {getLoanerLabel}=ctx;
const ok=[],ng=[];
const t=(n,c,e)=>{(c?ok:ng).push(n+(c?'':'  ← 実際は '+JSON.stringify(e)));};
const lres={3:{'2026-7-31':{id:9,fy:2026,fm:7,fd:31,ty:2026,tm:8,td:1,user:'岩田　明生',
  bookingKey:'insp-2026-9-1-0',carName:'N-BOX',carNum:'9012'}}};
let r=getLoanerLabel(lres,'2026-9-1','','insp-2026-9-1-0',[]);
t('★空き行(行0)には代車を出さない',r==='',r);
r=getLoanerLabel(lres,'2026-9-1','岩田　明生','insp-2026-9-1-2',[]);
t('★本人の行(行2)には代車が出る（氏名で拾う）',r==='N-BOX (9012)',r);
r=getLoanerLabel(lres,'2026-9-1','岩釜　由美子','insp-2026-9-1-0',[]);
t('★別の客の行にキーが当たっても出さない',r==='',r);
r=getLoanerLabel(lres,'2026-9-1','岩田　明生','insp-2026-9-1-0',[]);
t('キーも氏名も合っていれば出る',r==='N-BOX (9012)',r);
r=getLoanerLabel(lres,'2026-9-5','岩田　明生','insp-2026-9-5-0',[]);
t('期間外の日には出ない',r==='',r);
r=getLoanerLabel({},'2026-9-1','岩田　明生','insp-2026-9-1-2',[]);
t('代車データが無ければ空白',r==='',r);
console.log('検証 '+(ok.length+ng.length)+'件');
ok.forEach(n=>console.log('  ✔ '+n));
ng.forEach(n=>console.log('  ✖ '+n));
process.exit(ng.length?1:0);
