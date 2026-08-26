// スケジュール(insp)の「古いキャッシュ対策」マージの単体テスト。
//   GASは読み取りを60秒キャッシュするため、直前に自分が入れた予約が入っていない
//   古い値が書き込みの土台として返ることがある。そのまま書くとその予約が消える。
//   実行: node insp_merge_test.js
const fs=require('fs'),vm=require('vm'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'index_dev.html'),'utf8');
const m=src.match(/const INSP_FRESH_MS = 180000;[\s\S]*?\nfunction mergeInspFresh\(local, server, nowTs\)\{[\s\S]*?\n\}/);
if(!m){console.error('mergeInspFresh を抽出できません');process.exit(1);}
const ctx={};vm.createContext(ctx);
vm.runInContext(m[0]+'\nthis.mergeInspFresh=mergeInspFresh;',ctx);
const merge=ctx.mergeInspFresh;
const ok=[],ng=[];
const t=(n,c,e)=>{(c?ok:ng).push(n+(c?'':'  ← '+JSON.stringify(e)));};
const NOW=1787800000000, NEW=NOW-20000, OLD=NOW-600000;
const row=(name,seq,extra)=>({name,seq,no:1,...(extra||{})});

// 1) 直前に自分が入れた予約が、古い土台に無くても残る（今回の事故そのもの）
let r=merge({'2026-8-20':[row('長谷川',NEW)]},{'2026-8-20':[]},NOW);
t('作りたての予約は古い土台でも消えない',r['2026-8-20'].length===1&&r['2026-8-20'][0].name==='長谷川',r);

// 2) サーバーに既にある予約は二重にならない
r=merge({'2026-8-20':[row('長谷川',NEW)]},{'2026-8-20':[row('長谷川',NEW)]},NOW);
t('二重に増やさない',r['2026-8-20'].length===1,r);

// 3) custId が同じなら同一とみなす（氏名表記ゆれ対策）
r=merge({'2026-8-20':[row('長谷川　智彦',NEW,{custId:'A1'})]},{'2026-8-20':[row('長谷川 智彦',OLD,{custId:'A1'})]},NOW);
t('custIdで同一と判定',r['2026-8-20'].length===1,r);

// 4) 古い予約は足さない＝他PCが消した予約を復活させない
r=merge({'2026-8-20':[row('削除済み',OLD)]},{'2026-8-20':[]},NOW);
t('古い予約は復活させない',r['2026-8-20'].length===0,r);

// 5) サーバー側の他の予約を壊さない
r=merge({'2026-8-20':[row('自分',NEW)]},{'2026-8-20':[row('他PC',OLD)]},NOW);
t('他PCの予約を残す',r['2026-8-20'].length===2&&r['2026-8-20'].some(x=>x.name==='他PC'),r);

// 6) 他の日付に影響しない
r=merge({'2026-8-20':[row('自分',NEW)]},{'2026-8-21':[row('別日',OLD)]},NOW);
t('別の日付はそのまま',r['2026-8-21'].length===1&&r['2026-8-20'].length===1,r);

// 7) 空の行（プレースホルダ）は足さない
r=merge({'2026-8-20':[{name:'',seq:NEW}]},{'2026-8-20':[]},NOW);
t('空行は足さない',r['2026-8-20'].length===0,r);

// 8) サーバー値が壊れていたらそのまま返す（無理に触らない）
t('サーバー値がnullならそのまま',merge({'a':[row('x',NEW)]},null,NOW)===null);
t('サーバー値が配列ならそのまま',Array.isArray(merge({'a':[row('x',NEW)]},[],NOW)));

console.log('PASS '+ok.length+'件');ok.forEach(n=>console.log('  ✔ '+n));
if(ng.length){console.log('FAIL '+ng.length+'件');ng.forEach(n=>console.log('  ✖ '+n));process.exit(1);}
