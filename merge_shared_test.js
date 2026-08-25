// ポーリング/再取得で使うマージ規則の単体テスト。
//   index_dev.html と customers.html は同じ規則の実装を各自に持っている（片方だけ直す事故を防ぐため両方を検査する）。
//   実行: node merge_shared_test.js
const fs=require('fs'),vm=require('vm'),path=require('path');
const targets=[
  ['index_dev.html', /const SHARED_FRESH_MS[\s\S]*?\nfunction mergeSharedObjects\(local, server, nowTs\)\{[\s\S]*?\n\}/],
  ['customers.html', /const SHARED_FRESH_MS[\s\S]*?\nconst mergeSharedObjects=\(local,server,nowTs\)=>\{[\s\S]*?\n\};/],
];
const load=(file,re)=>{
  const src=fs.readFileSync(path.join(__dirname,file),'utf8');
  const m=src.match(re);
  if(!m){console.error('マージ関数を抽出できません:',file);process.exit(1);}
  const ctx={};vm.createContext(ctx);
  vm.runInContext(m[0]+'\nthis.mergeSharedObjects=mergeSharedObjects;',ctx);
  return ctx.mergeSharedObjects;
};
const ok=[],ng=[];
const NOW=1787640000000, OLD=NOW-600000, NEW=NOW-5000;
for(const [file,re] of targets){
  const merge=load(file,re);
  const t=(n,c,e)=>{const nm='['+file+'] '+n;(c?ok:ng).push(nm+(c?'':'  ← '+JSON.stringify(e)));};
  let r=merge({1:{'2026-7-24':{id:OLD,user:'古賀'}}},{1:{}},NOW);
  t('他PCで削除された古い予約は復活しない',Object.keys(r[1]).length===0,r);
  r=merge({1:{'2026-7-25':{id:NEW,user:'新規'}}},{1:{}},NOW);
  t('作りたての自分の予約は消えない',r[1]['2026-7-25']?.user==='新規',r);
  r=merge({1:{}},{1:{'2026-7-26':{id:OLD,user:'他PC'}}},NOW);
  t('他PCが入れた予約は取り込む',r[1]['2026-7-26']?.user==='他PC',r);
  r=merge({1:{'d':{id:NEW,user:'編集後'}}},{1:{'d':{id:OLD,user:'編集前'}}},NOW);
  t('編集直後はローカルを優先',r[1].d.user==='編集後',r);
  r=merge({1:{'d':{id:OLD,user:'古い'}}},{1:{'d':{id:NOW-1000,user:'他PCの新しい'}}},NOW);
  t('ローカルが古ければサーバーを採用',r[1].d.user==='他PCの新しい',r);
  r=merge({1:{'d':{user:'時刻なし'}}},{1:{}},NOW);
  t('時刻を持たないものは残す',r[1].d?.user==='時刻なし',r);
  r=merge({1:{'d':{savedAt:OLD,user:'古いsavedAt'}}},{1:{}},NOW);
  t('savedAtが古ければ消える',Object.keys(r[1]).length===0,r);
  r=merge({1:{'d':{savedAt:NEW,user:'新しいsavedAt'}}},{1:{}},NOW);
  t('savedAtが新しければ残す',r[1].d?.user==='新しいsavedAt',r);
  r=merge({'2026-8-1':[{name:'ローカル'}]},{'2026-8-1':[{name:'サーバー'}]},NOW);
  t('配列はサーバー版をそのまま使う',Array.isArray(r['2026-8-1'])&&r['2026-8-1'][0].name==='サーバー',r);
  r=merge({1:{'a':{id:NEW,user:'自分'}}},{1:{},2:{'b':{id:OLD,user:'他車'}}},NOW);
  t('別の車の予約を壊さない',r[2].b?.user==='他車'&&r[1].a?.user==='自分',r);
}
console.log('PASS '+ok.length+'件（'+targets.length+'ファイル分）');
ok.forEach(n=>console.log('  ✔ '+n));
if(ng.length){console.log('FAIL '+ng.length+'件');ng.forEach(n=>console.log('  ✖ '+n));process.exit(1);}
