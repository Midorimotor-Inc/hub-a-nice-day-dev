const fs=require('fs');const path=require('path');
const MOD=path.join(process.env.LOCALAPPDATA,'Temp','hub-verify','node_modules');
const admin=require(path.join(MOD,'firebase-admin'));
admin.initializeApp({credential:admin.credential.cert(JSON.parse(fs.readFileSync('C:/Users/A/Documents/Hub重要書類/firebase-admin.json','utf8')))});
const db=admin.firestore();
const P=process.argv.includes('--prod')?'hub-v8-':'hub-v8-dev-';
const WRITE=process.argv.includes('--write');
const strip=s=>String(s||'').replace(/[\s　]/g,'').replace(/[（(].*?[)）]/g,'').replace(/(さま|様|さん|殿|君|ちゃん)$/,'');
const car=s=>String(s||'').normalize('NFKC').replace(/[\s　・ー]/g,'').toUpperCase();
const kana=s=>car(s).replace(/[ヴ]/g,'ブ').replace(/[ァィゥェォャュョ]/g,'');
const carSame=(a,b)=>{const x=kana(a),y=kana(b);if(!x||!y)return false;return x===y||x.includes(y)||y.includes(x)||(x.slice(0,3)===y.slice(0,3)&&x.length>=3);};
(async()=>{
  const doc=await db.doc('kv/'+P+'insp').get();const insp=JSON.parse(doc.data().v||'{}');
  const merged=[],skipped=[];
  for(const dk of Object.keys(insp)){
    const rows=insp[dk]||[];
    const drop=new Set();
    rows.forEach((a,ai)=>{
      if(!a||!a.name||a.custId||drop.has(ai))return;          // 入庫表から足した行（custIdなし）だけ見る
      const na=strip(a.name); if(na.length<2)return;
      const bi=rows.findIndex((b,i)=>b&&b.name&&b.custId&&i!==ai&&!drop.has(i)&&(()=>{const nb=strip(b.name);return nb===na||nb.startsWith(na)||na.startsWith(nb);})());
      if(bi<0)return;
      const b=rows[bi];
      if(!carSame(a.carType,b.carType)){skipped.push(`${dk} ${a.name}(${a.carType}) ↔ ${b.name}(${b.carType})`);return;}
      // 入庫表の時間・備考を、リスト由来の行に移す
      if(a.bookingTime){b.time=a.bookingTime;b.bookingTime=a.bookingTime;}
      const an=String(a.note||''),bn=String(b.note||'');
      if(an&&!bn.includes(an))b.note=(bn?bn+'\n':'')+an;
      if(a.bookingStatus==='cancelled')b.bookingStatus='cancelled';
      if(!b.staff&&a.staff)b.staff=a.staff;
      drop.add(ai);merged.push(`${dk} ${a.name} → ${b.name}（${b.bookingTime}）`);
    });
    if(drop.size)insp[dk]=rows.filter((_,i)=>!drop.has(i));
  }
  console.log('重ねた（消した）行:',merged.length);
  merged.slice(0,10).forEach(x=>console.log('  '+x));
  if(skipped.length){console.log('車種が違うので残した:',skipped.length);skipped.slice(0,10).forEach(x=>console.log('  '+x));}
  if(!WRITE){console.log('（下見）');process.exit(0);}
  await db.doc('kv/'+P+'insp').set({v:JSON.stringify(insp),u:admin.firestore.FieldValue.serverTimestamp()});
  let tot=0,can=0,days=0;for(const dk of Object.keys(insp)){const rr=(insp[dk]||[]).filter(r=>r&&r.name);if(rr.length)days++;tot+=rr.length;can+=rr.filter(r=>r.bookingStatus==='cancelled').length;}
  console.log(`★書き込み完了　合計 ${days}日 ${tot}台（うちキャンセル ${can}）`);
  process.exit(0);
})().catch(e=>{console.error('エラー:',e.message);process.exit(1);});
