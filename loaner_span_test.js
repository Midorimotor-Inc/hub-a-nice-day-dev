const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(require('path').join(__dirname,'index_dev.html'),'utf8');
// toNum と _mmFmt 相当を取り出して、ピック直後の期間計算を再現検証する
const m=src.match(/const toNum      = \(y,m,d\)[^\n]*\n/);
if(!m){console.error('toNumが見つかりません');process.exit(1);}
const ctx={};vm.createContext(ctx);
vm.runInContext(m[0]+"\nconst _mmFmt=n=>n==null?'—':`${Math.floor(n/100)%100}/${n%100}`;\nthis.toNum=toNum;this._mmFmt=_mmFmt;",ctx);
const {toNum,_mmFmt}=ctx;
// 修正後の式
const loanToNew=pd=>toNum(pd.endYear??pd.startYear,pd.endMonth??pd.startMonth,pd.endDay);
const loanToOld=pd=>toNum(pd.startYear,pd.startMonth,pd.endDay);
const ok=[],ng=[];
const t=(n,c,e)=>{(c?ok:ng).push(n+(c?'':'  ← '+JSON.stringify(e)));};
// 8/31 〜 9/1（月またぎ）
let pd={startYear:2026,startMonth:7,startDay:31,endYear:2026,endMonth:8,endDay:1};
t('月またぎ 8/31〜9/1 が正しく出る',_mmFmt(loanToNew(pd))==='9/1',_mmFmt(loanToNew(pd)));
t('（参考）修正前は 8/1 と誤っていた',_mmFmt(loanToOld(pd))==='8/1',_mmFmt(loanToOld(pd)));
// 年またぎ 12/31 〜 1/1
pd={startYear:2026,startMonth:11,startDay:31,endYear:2027,endMonth:0,endDay:1};
t('年またぎ 12/31〜1/1 が正しく出る',_mmFmt(loanToNew(pd))==='1/1'&&loanToNew(pd)===20270101,{n:loanToNew(pd)});
// 同月内
pd={startYear:2026,startMonth:7,startDay:24,endYear:2026,endMonth:7,endDay:26};
t('同じ月 8/24〜8/26 は従来どおり',_mmFmt(loanToNew(pd))==='8/26',_mmFmt(loanToNew(pd)));
// 終了の年月が渡ってこない古い経路
pd={startYear:2026,startMonth:7,startDay:24,endDay:26};
t('終了年月が無ければ開始の年月を使う',_mmFmt(loanToNew(pd))==='8/26',_mmFmt(loanToNew(pd)));
// 期間の前後が逆転しないこと
pd={startYear:2026,startMonth:7,startDay:31,endYear:2026,endMonth:8,endDay:1};
t('月またぎでも 開始 < 終了 になる',toNum(pd.startYear,pd.startMonth,pd.startDay)<loanToNew(pd));
console.log('PASS '+ok.length+'件');ok.forEach(n=>console.log('  ✔ '+n));
if(ng.length){console.log('FAIL '+ng.length+'件');ng.forEach(n=>console.log('  ✖ '+n));process.exit(1);}
