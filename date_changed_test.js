// 「日付が変わったか」の判定の単体テスト（2026-09-03 ユーザー報告の代車消失バグ）。
//   モーダルは日付を触らないと _targetDk を空文字で返す。生の値で比べると
//   日付を変えていない編集でも「変更あり」になり、代車の削除が誤って走っていた。
//   実行: node date_changed_test.js
const fs=require('fs'),vm=require('vm'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'index_dev.html'),'utf8');
const m=src.match(/^const isDateChanged = .*$/m);
if(!m){console.error('isDateChanged を抽出できません');process.exit(1);}
const ctx={};vm.createContext(ctx);
vm.runInContext(m[0]+'\nthis.f=isDateChanged;',ctx);
const f=ctx.f;

const ok=[],ng=[];
const t=(n,c,e)=>{(c?ok:ng).push(n+(c?'':'  ← '+JSON.stringify(e)));};

// ★本命：日付を触らずに編集して保存した場合（特典を付けただけ など）
t('日付を触らない編集は「変更なし」（代車を消さない）', f('2026-8-29','2026-8-29')===false);

// 実際に日付を変えた場合はきちんと「変更あり」
t('日付を変えたら「変更あり」', f('2026-8-29','2026-9-1')===true);

// 生の _targetDk が空文字で届いても、変更ありにしない
//（この関数には必ずフォールバック済みの値を渡すが、万一空でも安全側に倒す）
t('targetDkが空なら「変更なし」', f('2026-8-29','')===false);
t('targetDkがundefinedでも「変更なし」', f('2026-8-29',undefined)===false);

// 新規予約（元の日付が無い）は「変更なし」
t('origDkが空なら「変更なし」', f('','2026-8-29')===false);
t('両方空なら「変更なし」', f('','')===false);

// 型が違っても文字列として比較する
t('数値混じりでも同じなら変更なし', f('2026-8-29',String('2026-8-29'))===false);

// ゼロ詰めの有無は別の日付として扱う（このアプリの日付キーはゼロ詰めなし）
t('2026-8-29 と 2026-08-29 は別扱い', f('2026-8-29','2026-08-29')===true);

console.log('\n=== 合格 ('+ok.length+') ===');ok.forEach(s=>console.log('  ✓ '+s));
if(ng.length){console.log('\n=== 不合格 ('+ng.length+') ===');ng.forEach(s=>console.log('  ✗ '+s));process.exit(1);}
console.log('\n全'+ok.length+'件 PASS');
