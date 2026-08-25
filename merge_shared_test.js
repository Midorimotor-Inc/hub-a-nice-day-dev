const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(require('path').join(__dirname,'index_dev.html'),'utf8');
const m=src.match(/const SHARED_FRESH_MS[\s\S]*?\nfunction mergeSharedObjects\(local, server, nowTs\)\{[\s\S]*?\n\}\n/);
if(!m){console.error('マージ関数を抽出できません');process.exit(1);}
const ctx={};vm.createContext(ctx);vm.runInContext(m[0],ctx);
const {mergeSharedObjects}=ctx;
const NOW=1787640000000, OLD=NOW-600000, NEW=NOW-5000;
const ok=[],ng=[];
const t=(n,c,e)=>{(c?ok:ng).push(n+(c?'':'  ← '+JSON.stringify(e)));};

// 1) 他PCで削除された古い代車は消える（今回の本命）
let r=mergeSharedObjects({1:{'2026-7-24':{id:OLD,user:'古賀'}}},{1:{}},NOW);
t('他PCで削除された古い予約は復活しない',Object.keys(r[1]).length===0,r);

// 2) 直前に自分が入れた予約は、サーバー未反映でも残る
r=mergeSharedObjects({1:{'2026-7-25':{id:NEW,user:'新規'}}},{1:{}},NOW);
t('作りたての自分の予約は消えない',r[1]['2026-7-25']?.user==='新規',r);

// 3) サーバーが持つ予約はそのまま採用
r=mergeSharedObjects({1:{}},{1:{'2026-7-26':{id:OLD,user:'他PC'}}},NOW);
t('他PCが入れた予約は取り込む',r[1]['2026-7-26']?.user==='他PC',r);

// 4) ローカルの方が新しい（編集直後）→ ローカル優先
r=mergeSharedObjects({1:{'d':{id:NEW,user:'編集後'}}},{1:{'d':{id:OLD,user:'編集前'}}},NOW);
t('編集直後はローカルを優先',r[1].d.user==='編集後',r);

// 5) ローカルが古い（未更新）→ サーバー優先
r=mergeSharedObjects({1:{'d':{id:OLD,user:'古い'}}},{1:{'d':{id:NOW-1000,user:'他PCの新しい'}}},NOW);
t('ローカルが古ければサーバーを採用',r[1].d.user==='他PCの新しい',r);

// 6) 時刻を持たないレコードは従来どおり残す（custbk保護）
r=mergeSharedObjects({1:{'d':{user:'時刻なし'}}},{1:{}},NOW);
t('時刻を持たないものは残す',r[1].d?.user==='時刻なし',r);

// 7) savedAt でも判定する
r=mergeSharedObjects({1:{'d':{savedAt:OLD,user:'古いsavedAt'}}},{1:{}},NOW);
t('savedAtが古ければ消える',Object.keys(r[1]).length===0,r);
r=mergeSharedObjects({1:{'d':{savedAt:NEW,user:'新しいsavedAt'}}},{1:{}},NOW);
t('savedAtが新しければ残す',r[1].d?.user==='新しいsavedAt',r);

// 8) 配列値（insp的な形）はサーバーをそのまま使う
r=mergeSharedObjects({'2026-8-1':[{name:'ローカル'}]},{'2026-8-1':[{name:'サーバー'}]},NOW);
t('配列はサーバー版をそのまま使う',Array.isArray(r['2026-8-1'])&&r['2026-8-1'][0].name==='サーバー',r);

// 9) 他の車の予約を巻き添えで消さない
r=mergeSharedObjects({1:{'a':{id:NEW,user:'自分'}}},{1:{},2:{'b':{id:OLD,user:'他車'}}},NOW);
t('別の車の予約を壊さない',r[2].b?.user==='他車'&&r[1].a?.user==='自分',r);

console.log('PASS '+ok.length+'件');ok.forEach(n=>console.log('  ✔ '+n));
if(ng.length){console.log('FAIL '+ng.length+'件');ng.forEach(n=>console.log('  ✖ '+n));process.exit(1);}
