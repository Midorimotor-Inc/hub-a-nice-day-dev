const fs=require('fs'),vm=require('vm'),path=require('path');
const src=fs.readFileSync(require('path').join(__dirname,'index_dev.html'),'utf8');
const m=src.match(/const toNum      = \(y,m,d\)[\s\S]*?\nconst getLoanerLabel = \(loanerRes, dk, rowName, bookingKey\) => \{[\s\S]*?\n\};/);
if(!m){console.error('抽出できません');process.exit(1);}
const ctx={LOANERS:[{id:4,name:'タント',num:'3456'}]};vm.createContext(ctx);
vm.runInContext(m[0]+'\nthis.getLoanerLabel=getLoanerLabel;this.getLoanerByKey=getLoanerByKey;',ctx);
const {getLoanerLabel}=ctx;
const ok=[],ng=[];
const t=(n,c,e)=>{(c?ok:ng).push(n+(c?'':'  ← 実際は '+JSON.stringify(e)));};
// 8/26の車検予約に、タントを 8/25〜8/27 で付けた状態
const lres={4:{'2026-7-25':{id:1,fy:2026,fm:7,fd:25,ty:2026,tm:7,td:27,user:'岩田　明生',bookingKey:'insp-2026-8-26-1',carName:'タント',carNum:'3456'}}};
let r=getLoanerLabel(lres,'2026-8-26','岩田　明生','insp-2026-8-26-1');
t('キーが一致していれば出る',r==='タント (3456)',r);
r=getLoanerLabel(lres,'2026-8-26','岩田　明生','insp-2026-8-26-3');
t('行番号がズレても氏名で拾える',r==='タント (3456)',r);
r=getLoanerLabel(lres,'2026-8-26','','insp-2026-8-26-3');
t('★氏名が空だと空白になる',r==='',r);
// 別の予約が同じキーを持っている場合（ズレの巻き添え）
const lres2={4:{'a':{id:1,fy:2026,fm:7,fd:25,ty:2026,tm:7,td:27,user:'岩田　明生',bookingKey:'insp-2026-8-26-1',carName:'タント',carNum:'3456'}},
              5:{'b':{id:2,fy:2026,fm:7,fd:26,ty:2026,tm:7,td:26,user:'別人',bookingKey:'insp-2026-8-26-3',carName:'スペーシア',carNum:'0001'}}};
r=getLoanerLabel(lres2,'2026-8-26','岩田　明生','insp-2026-8-26-3');
t('★ズレて別人のキーに当たると別の車が出る',r==='スペーシア (0001)',r);
// 代車がまだ loanerRes に無い（保存直後の一瞬）
r=getLoanerLabel({},'2026-8-26','岩田　明生','insp-2026-8-26-1');
t('代車データが無ければ空白',r==='',r);
console.log('検証 '+(ok.length+ng.length)+'件');
ok.forEach(n=>console.log('  ✔ '+n));
ng.forEach(n=>console.log('  ✖ '+n));
