const fs=require('fs'),vm=require('vm');
// 対象ファイルは引数で差し替えられる（例: node gas_v12_test.js GAS_server_v14_auth.gs）。
// 認証を足した生成物に対しても、既存ロジックが壊れていないことを確かめるため。
const TARGET=process.argv[2]||'GAS_server_v10_snapshots.gs';
const src=fs.readFileSync(require('path').join(__dirname,TARGET),'utf8');

// ── モックのスプレッドシート ──
function makeSheet(rows){ // rows: [[key,value,updated],...]（1行目はヘッダー）
  return {
    _rows:rows,
    getLastRow(){return this._rows.length;},
    getRange(r,c,nr,nc){const self=this;nr=nr||1;nc=nc||1;
      return {getValues(){const out=[];for(let i=0;i<nr;i++){const row=self._rows[r-1+i]||[];out.push(row.slice(c-1,c-1+nc));}return out;},
              setValues(v){for(let i=0;i<nr;i++){for(let j=0;j<nc;j++){self._rows[r-1+i][c-1+j]=v[i][j];}}},
              setValue(v){self._rows[r-1][c-1]=v;}};},
    appendRow(a){this._rows.push(a.slice());},
    deleteRow(r){this._rows.splice(r-1,1);},
  };
}
let cacheRemoveAllCalls=0, cacheRemoveCalls=0, driveWrites=[];
const sandbox={
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>SHEET,getSheets:()=>[]})},
  CacheService:{getScriptCache:()=>({remove(){cacheRemoveCalls++;},removeAll(a){cacheRemoveAllCalls++;},get(){return null;},put(){}})},
  DriveApp:{getFoldersByName:()=>({hasNext:()=>false}),createFolder:()=>({})},
  Logger:{log(){}},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  ContentService:{createTextOutput:t=>({setMimeType(){return this;},_t:t,getContent:()=>t}),MimeType:{TEXT:'t'}},
  Utilities:{},console,
  // v14の認証モジュールが使う。ここでは「利用証は必須にしない（移行期間中）」の状態を模擬し、
  // 既存ロジックが認証の追加で壊れていないことだけを確かめる。
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>null,setProperty(){}})},
  MailApp:{sendEmail(){}},
};
sandbox.global=sandbox;
vm.createContext(sandbox);
vm.runInContext(src,sandbox);
let SHEET;
const R=[['key','value','updated'],
         ['hub-v8-dev-insp','{"a":1}','old'],
         ['hub-v8-dev-insp__chunk0','xx','old'],
         ['hub-v8-dev-lres','{"b":2}','old']];
const ok=[],ng=[];
const t=(name,cond,extra)=>{(cond?ok:ng).push(name+(cond?'':'  ← '+JSON.stringify(extra)));};

// 1. 既存キーの書き換え
SHEET=makeSheet(JSON.parse(JSON.stringify(R)));
sandbox.writeRow(SHEET,'hub-v8-dev-lres','{"b":9}','NOW');
t('既存キーを更新できる',SHEET._rows[3][1]==='{"b":9}'&&SHEET._rows[3][2]==='NOW',SHEET._rows[3]);
t('他の行を壊さない',SHEET._rows[1][1]==='{"a":1}',SHEET._rows[1]);

// 2. 新規キーの追加
SHEET=makeSheet(JSON.parse(JSON.stringify(R)));
sandbox.writeRow(SHEET,'hub-v8-dev-new','{"n":1}','NOW');
t('新規キーを末尾に追加',SHEET._rows.length===5&&SHEET._rows[4][0]==='hub-v8-dev-new',SHEET._rows[4]);

// 3. chunk行の掃除（該当あり）
SHEET=makeSheet(JSON.parse(JSON.stringify(R)));
sandbox.deleteChunksFrom(SHEET,sandbox.readKeyCol(SHEET),'hub-v8-dev-insp');
t('旧chunk行を削除する',SHEET._rows.length===3&&!SHEET._rows.some(r=>String(r[0]).includes('__chunk')),SHEET._rows.map(r=>r[0]));

// 4. chunk行なし＝シートに触らない
SHEET=makeSheet([['key','value','updated'],['hub-v8-dev-lres','{"b":2}','old']]);
const before=JSON.stringify(SHEET._rows);
sandbox.deleteChunksFrom(SHEET,sandbox.readKeyCol(SHEET),'hub-v8-dev-lres');
t('chunk行が無ければ何もしない',JSON.stringify(SHEET._rows)===before);

// 5. findRowIn が findRow と同じ行を返す
SHEET=makeSheet(JSON.parse(JSON.stringify(R)));
t('findRowIn=findRow',sandbox.findRowIn(sandbox.readKeyCol(SHEET),'hub-v8-dev-lres')===sandbox.findRow(SHEET,'hub-v8-dev-lres'));
t('見つからない時は-1',sandbox.findRowIn(sandbox.readKeyCol(SHEET),'nope')===-1);

// 6. invalidateCacheMany は removeAll を使う（remove ループを使わない）
cacheRemoveAllCalls=0;cacheRemoveCalls=0;
sandbox.invalidateCache('hub-v8-dev-insp');
t('キャッシュ削除は1〜2往復',cacheRemoveAllCalls>0&&cacheRemoveAllCalls<=2&&cacheRemoveCalls===0,{removeAll:cacheRemoveAllCalls,remove:cacheRemoveCalls});

// 7. setMany: 既存2件＋新規1件
SHEET=makeSheet(JSON.parse(JSON.stringify(R)));
cacheRemoveAllCalls=0;
const res=sandbox.doPost({postData:{contents:JSON.stringify({apiKey:'hub2026co-f466kt5vs3vnDQDPuwWeS6XM',action:'setMany',
  items:[{key:'hub-v8-dev-insp',value:'{"a":2}'},{key:'hub-v8-dev-lres',value:'{"b":3}'},{key:'hub-v8-dev-brand',value:'{"c":4}'}]})}});
const body=JSON.parse(res.getContent?res.getContent():res._t);
t('setMany が3件とも成功',body.ok.length===3&&body.failed.length===0,body);
t('setMany: 既存キーを更新',SHEET._rows.find(r=>r[0]==='hub-v8-dev-insp')[1]==='{"a":2}');
t('setMany: もう1つの既存キーも更新',SHEET._rows.find(r=>r[0]==='hub-v8-dev-lres')[1]==='{"b":3}');
t('setMany: 新規キーを追加',!!SHEET._rows.find(r=>r[0]==='hub-v8-dev-brand'));
t('setMany: 旧chunk行を掃除',!SHEET._rows.some(r=>String(r[0]).includes('__chunk')),SHEET._rows.map(r=>r[0]));
t('setMany: キャッシュ削除は1往復にまとまる',cacheRemoveAllCalls===1,{removeAll:cacheRemoveAllCalls});

// 8. setMany: 件数上限とキー無し
const res2=sandbox.doPost({postData:{contents:JSON.stringify({apiKey:'hub2026co-f466kt5vs3vnDQDPuwWeS6XM',action:'setMany',
  items:new Array(21).fill({key:'x',value:'1'})})}});
t('21件は拒否',(res2.getContent?res2.getContent():res2._t).indexOf('too many')>=0);

// 9. 従来の単一キー書き込みが壊れていない
SHEET=makeSheet(JSON.parse(JSON.stringify(R)));
const res3=sandbox.doPost({postData:{contents:JSON.stringify({apiKey:'hub2026co-f466kt5vs3vnDQDPuwWeS6XM',key:'hub-v8-dev-lres',value:'{"b":7}'})}});
t('単一キー書き込みは ok を返す',(res3.getContent?res3.getContent():res3._t)==='ok');
t('単一キー書き込みが反映される',SHEET._rows.find(r=>r[0]==='hub-v8-dev-lres')[1]==='{"b":7}');

console.log('PASS '+ok.length+'件');ok.forEach(n=>console.log('  ✔ '+n));
if(ng.length){console.log('FAIL '+ng.length+'件');ng.forEach(n=>console.log('  ✖ '+n));process.exit(1);}
