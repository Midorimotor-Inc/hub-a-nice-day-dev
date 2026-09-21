// スマホ版説明書・管理者マニュアル（2026-09 改訂版）用のスクリーンショットを自動撮影し、
// 各ボタンの位置（赤枠を付ける座標）も一緒に記録する。
//
//   使い方: node capture_manual3_shots.js
//   出力先: ./manual2_shots/*.png と ./manual2_shots/index.json（{file, vw, vh, boxes:{名前:{x,y,w,h}}}）
//
// ★安全性：本物の Firebase には繋がない。DEV の Firestore（hub-v8-dev-*）をサービスアカウント鍵で
//   読み取り専用で集め、氏名を架空名に置き換えてから、にせの firebase（fake_firebase.js）に入れて
//   ブラウザに渡す。見た目は本番（青ヘッダー）にしたいので index_main.html を起動し、
//   キーを hub-v8-dev- → hub-v8- に読み替えて流し込む。
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const MAIN_DIR = path.resolve(__dirname, '..', 'hub-a-nice-day');
const OUT_DIR = path.join(__dirname, 'manual3_shots');   // スマホ版・管理者マニュアル用
const PORT = 8157;
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const FAKE_FB = fs.readFileSync(path.join(__dirname, 'fake_firebase.js'), 'utf8');
const DEV = 'hub-v8-dev-', PROD = 'hub-v8-';

// ── 氏名の匿名化（capture_manual_shots.js と同じ規則）──
const SEI = ['山田','佐藤','鈴木','高橋','田中','伊藤','渡辺','中村','小林','加藤','吉田','山本','松本','井上','木村','清水','斉藤','山口','森田','池田','橋本','石川','原田','岡田','長谷川','近藤','村上','遠藤','青木','坂本'];
const MEI = ['太郎','花子','一郎','美咲','健二','良子','翔','さくら','大輔','明美','隆','千夏','浩二','真理','拓也','由美','誠','あかり','徹','香織'];
const nameMap = new Map(); let fakeIdx = 0;
const staffNames = new Set();
function fakeName(real) {
  const k = String(real || '').trim(); if (!k) return real;
  if (staffNames.has(k)) return real;
  if (!nameMap.has(k)) { nameMap.set(k, SEI[fakeIdx % SEI.length] + '　' + MEI[Math.floor(fakeIdx / SEI.length) % MEI.length]); fakeIdx++; }
  return nameMap.get(k);
}
const NAME_KEYS = ['name', '氏名', 'お名前', '顧客名', 'custName', 'user', 'finalUser', 'owner'];
const NOTE_KEYS = ['note', 'memo', 'remark', '備考', 'メモ', 'content', 'title'];
const TEL_KEYS = ['tel', 'phone', 'phoneHome', 'phoneMobile', 'addr', 'address', '電話', '電話番号', '住所'];
function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) {
      const val = v[k];
      if (NAME_KEYS.indexOf(k) >= 0 && typeof val === 'string') o[k] = fakeName(val);
      else if (NOTE_KEYS.indexOf(k) >= 0 && typeof val === 'string' && val.trim()) o[k] = k === 'title' ? '打合せ' : '（メモ欄）';
      else if (TEL_KEYS.indexOf(k) >= 0) o[k] = typeof val === 'string' && val ? (k.indexOf('addr') >= 0 || k === '住所' ? '三田市〇〇1-2-3' : '000-0000-0000') : val;
      else o[k] = scrub(val);
    }
    return o;
  }
  if (typeof v === 'string') { const t = v.trim(); if (t.charAt(0) === '{' || t.charAt(0) === '[') { try { return JSON.stringify(scrub(JSON.parse(t))); } catch (e) { return v; } } }
  return v;
}

async function loadDevStore() {
  const admin = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'firebase-admin'));
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
  const db = admin.firestore();
  const q = await db.collection('kv').get();
  const raw = {};
  q.forEach(d => { if (d.id.indexOf(DEV) === 0) raw[d.id.slice(DEV.length)] = d.data().v; });
  for (const st of ['honten', 'sanda']) { try { (JSON.parse(raw[st + '-staff-v2'] || '[]') || []).forEach(s => s && s.name && staffNames.add(String(s.name).trim())); } catch (e) {} }
  const store = {};
  for (const k of Object.keys(raw)) {
    if (k.indexOf('mysec-') === 0) continue;      // 暗号化書庫は載せない
    let v = raw[k];
    if (!(k === 'cf-index' || /^cf-.*-index$/.test(k) || k === 'vehicles' || /-cars$/.test(k) || k === 'rentalcars')) { try { v = JSON.stringify(scrub(JSON.parse(v))); } catch (e) {} }   // 索引の name はファイル名なので置き換えない
    store['kv/' + PROD + k] = { v, u: Date.now() };
  }
  Object.keys(store).filter(k => k.indexOf('kv/' + PROD) === 0).forEach(k => { store['kv/' + DEV + k.slice(('kv/' + PROD).length)] = store[k]; });   // 管理者コンソールは DEV キーを読む
  store['meta/allowed'] = { 'egawa@midori-m,com': { email: 'egawa@midori-m.com', name: '江川京志', store: 'honten', uid: 'h7', role: 'admin', active: true, kind: 'staff' } };
  store['devices/dev-manual-dev'] = { env: DEV, e: 'egawa@midori-m.com', n: '江川京志', names: ['江川京志'], s: 'honten', k: 'own', l: '', ua: 'iPhone', at: 1, last: Date.now() };
  store['devices/dev-manual'] = { env: PROD, e: 'egawa@midori-m.com', n: '江川京志', names: ['江川京志'], s: 'honten', k: 'shared', l: '説明書', ua: 'manual', at: 1, last: Date.now() };
  return store;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = http.createServer((req, res) => {
    const f = path.join(MAIN_DIR, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
    fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': path.extname(f) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(data); });
  });
  await new Promise(r => server.listen(PORT, r));
  const server2 = http.createServer((req, res) => {   // 管理者コンソールは DEV サイトにしか無い
    const f = path.join(__dirname, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
    fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': path.extname(f) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(data); });
  });
  await new Promise(r => server2.listen(PORT + 1, r));
  console.log('DEV Firestore を読み取り中（読み取り専用・氏名は架空名へ）...');
  const store = await loadDevStore();
  console.log('  kv ' + Object.keys(store).filter(k => k.indexOf('kv/') === 0).length + ' 件・スタッフ名 ' + staffNames.size + ' 件は実名・置き換えた氏名 ' + nameMap.size + ' 件');

  const shots = [];
  const boxOf = async (page, fn, arg) => {
    try {
      return await page.evaluate(([src, a]) => {
        const f = eval('(' + src + ')'); const el = f(a); if (!el) return null;
        const r = el.getBoundingClientRect(); const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(innerWidth, r.right), y1 = Math.min(innerHeight, r.bottom); if (x1 <= x0 || y1 <= y0) return null; return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }, [fn.toString(), arg === undefined ? null : arg]);
    } catch (e) { return null; }
  };
  const btn = (t) => [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.replace(/\s/g, '').includes(t.replace(/\s/g, '')) && b.textContent.length < t.length + 12);
  const byText = (t) => [...document.querySelectorAll('div,span,label,p,h1,h2,h3,h4,a')].find(e => e.offsetParent !== null && e.textContent.trim().startsWith(t) && e.textContent.length < t.length + 30 && !e.querySelector('button,input'));
  const union = (...bs) => { const l = bs.filter(Boolean); if (!l.length) return null; const x1 = Math.min(...l.map(b => b.x)), y1 = Math.min(...l.map(b => b.y)), x2 = Math.max(...l.map(b => b.x + b.w)), y2 = Math.max(...l.map(b => b.y + b.h)); return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; };
  const shoot = async (page, file, label, boxes, vw, vh) => {
    await page.screenshot({ path: path.join(OUT_DIR, file) });
    const clean = {}; Object.keys(boxes || {}).forEach(k => { if (boxes[k]) clean[k] = boxes[k]; });
    shots.push({ file, label, vw, vh, boxes: clean });
    console.log('  ✔ ' + file + '  ' + label + '  枠 ' + Object.keys(clean).join(','));
  };
  const browser = await chromium.launch({ headless: true });
  // 端末ごとの context を作る。registered=false なら未登録（登録画面が出る）
  const mkContext = async (opt) => {
    const ctx = await browser.newContext(Object.assign({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }, opt.ctx));
    await ctx.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: route.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE_FB : '' }));
    await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: route.request().method() === 'POST' ? 'ok' : 'null' }));
    await ctx.addInitScript(([st, stor, o]) => {
      if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', JSON.stringify(st));
      if (o.signedIn) localStorage.setItem('__fakeFbUser', JSON.stringify({ email: o.email || 'egawa@midori-m.com', uid: 'uid_egawa' }));
      if (o.registered) {
        localStorage.setItem(stor + 'auth-devid', 'dev-manual');
        localStorage.setItem(stor + 'auth-mine', JSON.stringify(o.mine || [{ uid: 'h7', name: '江川京志', store: 'honten', email: 'egawa@midori-m.com', isAdmin: true }, { uid: 'h1', name: '見取大介', store: 'honten', email: '' }]));
        localStorage.setItem(stor + 'auth-kind', o.kind || 'own');
      }
      sessionStorage.setItem(stor + 'fs-pref2', 'off');
      if (o.pcUser) sessionStorage.setItem('hub_currentUser', JSON.stringify({ uid: 'h7', name: '江川京志', myNumber: 7, id: 7, badge: 'bodywork', store: { id: 'honten', name: '本店', color: '#2563eb', bg: '#eff6ff', accent: '#1d4ed8' } }));
    }, [store, PROD, opt]);
    return ctx;
  };
  const MW = 390, MH = 844, PW = 1400, PH = 950;
  const mobOpt = { viewport: { width: MW, height: MH }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
  const tapTab = (page, t) => page.evaluate(t => { const el = [...document.querySelectorAll('div')].filter(e => e.textContent.trim() === t && e.offsetParent !== null).pop(); const c = el && el.parentElement; if (c) { c.click(); return true; } return false; }, t);

  // ════════ スマホ ════════
  // m1: 登録画面（未登録の端末）
  {
    const ctx = await mkContext({ ctx: mobOpt, registered: false, signedIn: false });
    const pm = await ctx.newPage();
    await pm.goto('http://127.0.0.1:' + PORT + '/mobile.html?inv=1', { waitUntil: 'domcontentloaded' });
    await pm.waitForFunction(() => document.body.innerText.includes('メールアドレス'), null, { timeout: 30000 }).catch(() => {});
    await pm.waitForTimeout(1200);
    const b = {};
    b.email = await boxOf(pm, () => document.querySelector('input[type="email"],input[placeholder*="メールアドレス"]'));
    b.code = await boxOf(pm, () => document.querySelector('input[placeholder="------"]'));
    b.go = await boxOf(pm, btn, '登録する');
    b.link = await boxOf(pm, () => [...document.querySelectorAll('button,a,span')].find(x => x.offsetParent !== null && /コードがない/.test(x.textContent) && x.textContent.length < 40));
    await shoot(pm, 'm1-register.png', 'スマホ：登録画面', b, MW, MH);
    await ctx.close();
  }
  // m2〜: 登録済み・自分専用のスマホ
  {
    const ctx = await mkContext({ ctx: mobOpt, registered: true, signedIn: true, kind: 'shared', mine: [{ uid: 'h7', name: '江川京志', store: 'honten', email: 'egawa@midori-m.com', isAdmin: true }, { uid: 'h1', name: '見取大介', store: 'honten', email: '' }] });
    const pm = await ctx.newPage();
    pm.on('dialog', async d => { await d.dismiss().catch(() => {}); });
    await pm.goto('http://127.0.0.1:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
    await pm.waitForFunction(() => document.body.innerText.includes('誰が操作しますか'), null, { timeout: 40000 }).catch(() => {});
    await pm.waitForTimeout(1500);
    {
      const b = {};
      b.names = await boxOf(pm, () => { const a = [...document.querySelectorAll('button')].filter(x => x.offsetParent !== null && /江川京志|見取大介/.test(x.textContent) && x.textContent.length < 12); if (!a.length) return null; const r = a.map(e => e.getBoundingClientRect()); return { getBoundingClientRect: () => ({ left: Math.min(...r.map(q => q.left)), top: Math.min(...r.map(q => q.top)), width: Math.max(...r.map(q => q.right)) - Math.min(...r.map(q => q.left)), height: Math.max(...r.map(q => q.bottom)) - Math.min(...r.map(q => q.top)) }) }; });
      b.add = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /登録|追加/.test(x.textContent) && !/江川|見取/.test(x.textContent) && x.textContent.length < 24));
      await shoot(pm, 'm2-login.png', 'スマホ：名前を選ぶ', b, MW, MH);
    }
    await pm.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.includes('江川京志')); if (b) b.click(); });
    await pm.waitForFunction(() => document.body.innerText.includes('カレンダー') && !document.body.innerText.includes('誰が操作しますか'), null, { timeout: 40000 }).catch(() => {});
    await pm.waitForTimeout(4000);   // ログイン演出
    // m3: カレンダー＋ヘッダー
    {
      const b = {};
      b.version = await boxOf(pm, () => [...document.querySelectorAll('span')].find(e => e.offsetParent !== null && /^v\d/.test(e.textContent.trim())));
      b.lamp = await boxOf(pm, () => { const v = [...document.querySelectorAll('span')].find(e => e.offsetParent !== null && /^v\d/.test(e.textContent.trim())); return v && v.nextElementSibling; });
      b.user = await boxOf(pm, () => [...document.querySelectorAll('span')].find(e => e.offsetParent !== null && /江川京志（/.test(e.textContent)));
      b.reload = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /🔄|⏳/.test(x.textContent)));
      b.mail = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '✉'));
      b.restore = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '🕒'));
      b.logout = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '↩'));
      b.tabs = await boxOf(pm, () => { const el = [...document.querySelectorAll('div')].filter(e => e.textContent.trim() === '休日' && e.offsetParent !== null).pop(); let c = el; for (let i = 0; i < 3 && c; i++) c = c.parentElement; return c; });
      b.monthNav = await boxOf(pm, () => [...document.querySelectorAll('div')].find(e => e.offsetParent !== null && /^\d{4}年 \d{1,2}月$/.test(e.textContent.trim())));
      b.dayCell = await boxOf(pm, () => { const cells = [...document.querySelectorAll('div')].filter(el => el.offsetParent !== null && el.style && el.style.borderRadius === '10px' && el.firstElementChild && /^\d{1,2}$/.test(el.firstElementChild.textContent) && el.textContent.includes('台')); return cells[0]; });
      await shoot(pm, 'm3-calendar.png', 'スマホ：カレンダー', b, MW, MH);
      // 日詳細（予約のある日）
      if (b.dayCell) await pm.mouse.click(b.dayCell.x + b.dayCell.w / 2, b.dayCell.y + b.dayCell.h / 2);
      await pm.waitForTimeout(1200);
      const c = {};
      c.goSched = await boxOf(pm, btn, '予約・編集');
      c.close = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '✕'));
      c.insp = await boxOf(pm, () => { const e = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim() === '🚗 車検'); return e && e.parentElement; });
      c.my = await boxOf(pm, () => { const e = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim() === '📝 マイスケジュール'); return e && e.parentElement; });
      await shoot(pm, 'm4-day.png', 'スマホ：日の詳細', c, MW, MH);
      await pm.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '✕'); if (b) b.click(); });
      await pm.waitForTimeout(600);
    }
    // m5: スケジュール
    await tapTab(pm, 'スケジュール'); await pm.waitForTimeout(1500);
    {
      const b = {};
      b.dateNav = await boxOf(pm, () => { const e = [...document.querySelectorAll('div,span')].find(x => x.offsetParent !== null && /^\d{1,2}月\d{1,2}日/.test(x.textContent.trim()) && x.textContent.length < 14); return e && e.parentElement; });
      b.today = await boxOf(pm, btn, '当日に戻す');
      b.inspAdd = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /^[+＋]\s*追加$/.test(x.textContent.trim())));
      b.schedAdd = await boxOf(pm, () => [...document.querySelectorAll('div,span')].find(x => x.offsetParent !== null && x.textContent.trim() === '+ タップで追加' || (x.offsetParent !== null && /タップで追加/.test(x.textContent) && x.textContent.length < 12)));
      b.schedRow = await boxOf(pm, () => { const e = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.includes('同時刻に追加') && x.textContent.length < 80); return e; });
      b.inspHead = await boxOf(pm, () => [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && /^🚗 車検/.test(x.textContent.trim()) && x.textContent.length < 20));
      b.schedHead = await boxOf(pm, () => [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && /^⏰/.test(x.textContent.trim()) && x.textContent.length < 24));
      b.row = await boxOf(pm, () => [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.style && x.style.borderLeft && x.style.borderLeft.includes('4px') && x.textContent.length > 4));
      await shoot(pm, 'm5-schedule.png', 'スマホ：スケジュール', b, MW, MH);
      // 予約カード（車検の「＋ 追加」をタップ → 新規の車検カード）
      if (b.inspAdd) await pm.mouse.click(b.inspAdd.x + b.inspAdd.w / 2, b.inspAdd.y + b.inspAdd.h / 2);
      await pm.waitForTimeout(1500);
      const lab = (t) => { const l = [...document.querySelectorAll('label')].find(x => x.offsetParent !== null && x.textContent.trim().startsWith(t)); return l && l.parentElement; };
      const c = {};
      c.name = await boxOf(pm, lab, '氏名'); c.staff = await boxOf(pm, lab, '担当'); c.car = await boxOf(pm, lab, '車種'); c.course = await boxOf(pm, lab, 'コース'); c.time = await boxOf(pm, lab, '入庫時間'); c.tokuten = await boxOf(pm, lab, '特典');
      c.entry = await boxOf(pm, lab, '入庫日'); c.delivery = await boxOf(pm, lab, '納車日'); c.note = await boxOf(pm, lab, '備考');
      c.loaner = await boxOf(pm, () => { const l = [...document.querySelectorAll('label')].find(x => x.offsetParent !== null && x.textContent.includes('代車')); return l && l.parentElement; });
      c.save = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /保存|確定/.test(x.textContent) && x.textContent.length < 10));
      c.del = await boxOf(pm, btn, '🗑 削除');
      c.close = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '✕'));
      await shoot(pm, 'm6-edit.png', 'スマホ：予約カード', c, MW, MH);
      // 下半分
      await pm.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /保存|確定/.test(x.textContent) && x.textContent.length < 10); if (b) b.scrollIntoView({ block: 'center' }); });
      await pm.waitForTimeout(600);
      const c2 = {};
      c2.entry = await boxOf(pm, lab, '入庫日'); c2.delivery = await boxOf(pm, lab, '納車日'); c2.note = await boxOf(pm, lab, '備考');
      c2.loaner = await boxOf(pm, () => { const l = [...document.querySelectorAll('label')].find(x => x.offsetParent !== null && x.textContent.includes('代車')); return l && l.parentElement; });
      c2.save = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /保存|確定/.test(x.textContent) && x.textContent.length < 10));
      c2.del = await boxOf(pm, btn, '🗑 削除');
      await shoot(pm, 'm6b-edit-bottom.png', 'スマホ：予約カード（下）', c2, MW, MH);
      await pm.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '✕'); if (b) b.click(); });
      await pm.waitForTimeout(800);
      // 整備のカード（予約のある行をタップ）
      if (b.schedRow) await pm.mouse.click(b.schedRow.x + 60, b.schedRow.y + 14);
      await pm.waitForTimeout(1500);
      const c3 = {};
      c3.name = await boxOf(pm, lab, '氏名'); c3.car = await boxOf(pm, lab, '車種'); c3.work = await boxOf(pm, lab, '作業内容'); c3.shimi = await boxOf(pm, lab, '指・見'); c3.content = await boxOf(pm, lab, '内容');
      c3.loaner = await boxOf(pm, () => { const l = [...document.querySelectorAll('label')].find(x => x.offsetParent !== null && x.textContent.includes('代車')); return l && l.parentElement; });
      c3.save = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /保存|確定/.test(x.textContent) && x.textContent.length < 10));
      c3.del = await boxOf(pm, btn, '🗑 削除');
      await shoot(pm, 'm6c-sched-edit.png', 'スマホ：整備のカード', c3, MW, MH);
      await pm.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '✕'); if (b) b.click(); });
      await pm.waitForTimeout(600);
    }
    // m7: 代車
    await tapTab(pm, '代車'); await pm.waitForTimeout(1500);
    {
      const b = {};
      b.period = await boxOf(pm, () => [...document.querySelectorAll('div')].find(e => e.offsetParent !== null && /^\d{1,2}\/\d{1,2} 〜 \d{1,2}\/\d{1,2}$/.test(e.textContent.trim())));
      b.today = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '今日'));
      b.honten = await boxOf(pm, () => [...document.querySelectorAll('div')].find(e => e.offsetParent !== null && /^(本店|三田店) 代車/.test(e.textContent.trim()) && e.textContent.length < 16));
      b.rental = await boxOf(pm, () => [...document.querySelectorAll('div')].find(e => e.offsetParent !== null && /^レンタカー（共通）/.test(e.textContent.trim()) && e.textContent.length < 16));
      b.carName = await boxOf(pm, () => [...document.querySelectorAll('div')].find(e => e.offsetParent !== null && e.style && e.style.position === 'sticky' && e.getBoundingClientRect().width === 80 && e.getBoundingClientRect().top > 200 && e.textContent.trim().length > 2));
      b.bar = await boxOf(pm, () => [...document.querySelectorAll('div')].find(e => e.offsetParent !== null && e.style && e.style.position === 'absolute' && e.textContent.trim().length > 1 && e.getBoundingClientRect().height < 40 && e.getBoundingClientRect().width > 30 && e.getBoundingClientRect().top > 200));
      await shoot(pm, 'm7-loaner.png', 'スマホ：代車', b, MW, MH);
    }
    // m8: 休日
    await tapTab(pm, '休日'); await pm.waitForTimeout(1500);
    {
      const b = {};
      b.stores = await boxOf(pm, () => { const a = [...document.querySelectorAll('button')].filter(x => x.offsetParent !== null && /^(本店|三田店)/.test(x.textContent.trim()) && x.textContent.length < 10); if (a.length < 2) return null; const r = a.map(e => e.getBoundingClientRect()); return { getBoundingClientRect: () => ({ left: Math.min(...r.map(q => q.left)), top: Math.min(...r.map(q => q.top)), width: Math.max(...r.map(q => q.right)) - Math.min(...r.map(q => q.left)), height: Math.max(...r.map(q => q.bottom)) - Math.min(...r.map(q => q.top)) }) }; });
      b.summary = await boxOf(pm, () => { const e = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && /：🏖/.test(x.textContent) && x.textContent.length < 40); return e && e.parentElement; });
      b.carry = await boxOf(pm, () => [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim().startsWith('今月の枠') && x.textContent.length < 60));
      b.cell = await boxOf(pm, () => { const d = new Date().getDate(); const cells = [...document.querySelectorAll('div')].filter(el => el.offsetParent !== null && el.style && el.style.cursor === 'pointer' && el.firstElementChild && el.firstElementChild.textContent === String(d)); return cells[0]; });
      b.who = await boxOf(pm, () => { const s = [...document.querySelectorAll('select')].find(x => x.offsetParent !== null); return s && s.parentElement; });
      await shoot(pm, 'm8-holiday.png', 'スマホ：休日', b, MW, MH);
      if (b.cell) await pm.mouse.click(b.cell.x + b.cell.w / 2, b.cell.y + b.cell.h / 2);
      await pm.waitForTimeout(800);
      await pm.evaluate(() => { const e = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.includes('🏖 休日') && x.textContent.length < 20); if (e) e.scrollIntoView({ block: 'center' }); });
      await pm.waitForTimeout(500);
      const c = {};
      c.detail = await boxOf(pm, () => { const e = [...document.querySelectorAll('span')].find(x => x.offsetParent !== null && /出勤 \d+人/.test(x.textContent)); let p = e; for (let i = 0; i < 3 && p; i++) p = p.parentElement; return p; });
      c.off = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.includes('🏖 休日') && x.textContent.length < 20));
      c.leave = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.includes('📋 有給') && x.textContent.length < 20));
      c.memo = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.includes('📝')));
      await shoot(pm, 'm8b-holiday-detail.png', 'スマホ：休日の詳細', c, MW, MH);
    }
    // m9: 通知メール
    await pm.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '✉'); if (b) b.click(); });
    await pm.waitForTimeout(800);
    {
      const b = {};
      b.input = await boxOf(pm, () => document.querySelector('input[placeholder*="通知を受け取る"]'));
      b.save = await boxOf(pm, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /登録|保存/.test(x.textContent) && !/解除/.test(x.textContent) && x.textContent.length < 10));
      b.unreg = await boxOf(pm, btn, '登録解除');
      await shoot(pm, 'm9-mail.png', 'スマホ：通知メール', b, MW, MH);
    }
    await ctx.close();
  }

  // ════════ 管理者コンソール ════════
  {
    // a1: ログイン画面（未サインイン）
    const ctx0 = await mkContext({ ctx: { viewport: { width: PW, height: PH }, deviceScaleFactor: 2 }, registered: false, signedIn: false });
    const pa = await ctx0.newPage();
    await pa.goto('http://127.0.0.1:' + PORT + '/../HUB-A-NICE-DAY-DEV/admin.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await pa.goto('http://127.0.0.1:' + (PORT + 1) + '/admin.html', { waitUntil: 'domcontentloaded' });
    await pa.waitForFunction(() => document.getElementById('m'), null, { timeout: 30000 }).catch(() => {});
    await pa.waitForTimeout(800);
    {
      const b = {};
      b.mail = await boxOf(pa, () => document.getElementById('m')); b.code = await boxOf(pa, () => document.getElementById('c'));
      b.ok = await boxOf(pa, () => document.getElementById('okcode')); b.send = await boxOf(pa, () => document.getElementById('send')); b.env = await boxOf(pa, () => document.getElementById('envswitch'));
      await shoot(pa, 'a1-login.png', 'コンソール：ログイン', b, PW, PH);
    }
    await ctx0.close();
    // a2〜: 管理者でサインイン済み
    const ctx = await mkContext({ ctx: { viewport: { width: PW, height: PH }, deviceScaleFactor: 2 }, registered: true, signedIn: true });
    const p = await ctx.newPage();
    p.on('dialog', async d => { await d.accept().catch(() => {}); });
    await p.goto('http://127.0.0.1:' + (PORT + 1) + '/admin.html', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => document.body.innerText.includes('本人認証の進み具合'), null, { timeout: 40000 }).catch(() => {});
    await p.waitForTimeout(1500);
    {
      const b = {};
      b.tabs = await boxOf(p, () => { const a = [...document.querySelectorAll('[data-tab]')]; if (!a.length) return null; const r = a.map(e => e.getBoundingClientRect()); return { getBoundingClientRect: () => ({ left: Math.min(...r.map(x => x.left)), top: Math.min(...r.map(x => x.top)), width: Math.max(...r.map(x => x.right)) - Math.min(...r.map(x => x.left)), height: Math.max(...r.map(x => x.bottom)) - Math.min(...r.map(x => x.top)) }) }; });
      b.progress = await boxOf(p, () => { const e = [...document.querySelectorAll('div,h3,h4,b')].find(x => x.offsetParent !== null && x.textContent.trim().startsWith('本人認証の進み具合') && x.textContent.length < 40); let c = e; for (let i = 0; i < 4 && c; i++) { if (c.getBoundingClientRect().width > 600) break; c = c.parentElement; } return c; });
      b.reload = await boxOf(p, () => document.querySelector('#reload'));
      b.bulk = await boxOf(p, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /まとめて招待/.test(x.textContent)));
      b.add = await boxOf(p, () => document.querySelector('#adduser'));
      b.invite = await boxOf(p, () => document.querySelector('[data-invite]:not([disabled])') || document.querySelector('[data-invite]'));
      b.role = await boxOf(p, () => document.querySelector('[data-role]'));
      b.edit = await boxOf(p, () => document.querySelector('[data-edit]'));
      b.revoke = await boxOf(p, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '登録解除'));
      b.env = await boxOf(p, () => document.querySelector('#envswitch'));
      b.toSched = await boxOf(p, () => [...document.querySelectorAll('a')].find(x => x.offsetParent !== null && x.textContent.includes('スケジュールへ')));
      b.me = await boxOf(p, () => [...document.querySelectorAll('.me')].find(x => x.offsetParent !== null));
      await shoot(p, 'a2-staff.png', 'コンソール：スタッフと招待', b, PW, PH);
    }
    // a3: 追加ダイアログ（新しく登録）
    await p.evaluate(() => { const b = document.getElementById('adduser'); if (b) b.click(); });
    await p.waitForTimeout(500);
    await p.selectOption('#newuid', '__new__').catch(() => {});
    await p.waitForTimeout(300);
    {
      const b = {};
      b.what = await boxOf(p, () => { const r = document.querySelector('input[name="addwhat"]'); return r && r.closest('div'); });
      b.who = await boxOf(p, () => { const s = document.getElementById('newuid'); return s; });
      b.newStaff = await boxOf(p, () => document.getElementById('newstaffwrap'));
      b.role = await boxOf(p, () => { const r = document.querySelector('input[name="newrole"]'); return r && r.closest('label').parentElement; });
      b.plan = await boxOf(p, () => { const e = document.getElementById('planown'); return e && e.closest('label').parentElement; });
      b.mail = await boxOf(p, () => document.getElementById('newmail'));
      b.ok = await boxOf(p, () => document.querySelector('[data-dlg="ok"]'));
      await shoot(p, 'a3-add.png', 'コンソール：追加', b, PW, PH);
    }
    await p.evaluate(() => { const b = document.querySelector('[data-dlg="cancel"]'); if (b) b.click(); }); await p.waitForTimeout(400);
    // a4: 設定ダイアログ（所属店舗）
    await p.evaluate(() => { const b = document.querySelector('[data-edit]'); if (b) b.click(); }); await p.waitForTimeout(500);
    {
      const b = {};
      b.store = await boxOf(p, () => document.getElementById('edstore'));
      b.role = await boxOf(p, () => { const r = document.querySelector('input[name="newrole"]'); return r && r.closest('label').parentElement; });
      b.plan = await boxOf(p, () => { const e = document.getElementById('planown'); return e && e.closest('label').parentElement; });
      b.mail = await boxOf(p, () => document.getElementById('newmail'));
      b.ok = await boxOf(p, () => document.querySelector('[data-dlg="ok"]'));
      await shoot(p, 'a4-edit.png', 'コンソール：設定', b, PW, PH);
    }
    await p.evaluate(() => { const b = document.querySelector('[data-dlg="cancel"]'); if (b) b.click(); }); await p.waitForTimeout(400);
    // a5: 招待（コードが画面に出る）
    await p.evaluate(() => { const b = document.querySelector('[data-invite]:not([disabled])'); if (b) b.click(); }); await p.waitForTimeout(500);
    {
      const b = {};
      b.dialog = await boxOf(p, () => document.querySelector('.dialog'));
      b.ok = await boxOf(p, () => document.querySelector('[data-dlg="ok"]'));
      await shoot(p, 'a5-invite-confirm.png', 'コンソール：招待の確認', b, PW, PH);
    }
    await p.evaluate(() => { const b = document.querySelector('[data-dlg="ok"]'); if (b) b.click(); });
    await p.waitForFunction(() => document.body.innerText.includes('招待コード'), null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(500);
    {
      const b = {};
      b.code = await boxOf(p, () => document.querySelector('.toast'));
      b.ok = await boxOf(p, () => document.querySelector('[data-dlg="ok"]'));
      await shoot(p, 'a5b-invite-code.png', 'コンソール：招待コード', b, PW, PH);
    }
    await p.evaluate(() => { const b = document.querySelector('[data-dlg="ok"]') || document.querySelector('[data-dlg="cancel"]'); if (b) b.click(); }); await p.waitForTimeout(400);
    // a6: 登録端末
    await p.evaluate(() => { const b = [...document.querySelectorAll('[data-tab]')].find(e => e.textContent.includes('端末')); if (b) b.click(); }); await p.waitForTimeout(600);
    {
      const b = {};
      b.revoke = await boxOf(p, () => document.querySelector('[data-revoke]'));
      b.row = await boxOf(p, () => { const r = document.querySelector('[data-revoke]'); return r && r.closest('tr'); });
      b.reload = await boxOf(p, () => document.querySelector('#reload'));
      b.devnames = await boxOf(p, () => { const e = [...document.querySelectorAll('div,h3,b')].find(x => x.offsetParent !== null && /共有端末/.test(x.textContent) && x.textContent.length < 30); let c = e; for (let i = 0; i < 3 && c; i++) { if (c.getBoundingClientRect().width > 600) break; c = c.parentElement; } return c; });
      await shoot(p, 'a6-devices.png', 'コンソール：登録端末', b, PW, PH);
    }
    // a7: 管理者
    await p.evaluate(() => { const b = [...document.querySelectorAll('[data-tab]')].find(e => e.textContent.includes('管理者')); if (b) b.click(); }); await p.waitForTimeout(600);
    {
      const b = {};
      b.list = await boxOf(p, () => [...document.querySelectorAll('table')].find(x => x.offsetParent !== null));
      b.addAdmin = await boxOf(p, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /管理者に/.test(x.textContent)));
      b.remove = await boxOf(p, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /外す/.test(x.textContent)));
      await shoot(p, 'a7-admins.png', 'コンソール：管理者', b, PW, PH);
    }
    await ctx.close();
  }

  // ════════ PC の管理者機能 ════════
  {
    const ctx = await mkContext({ ctx: { viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2 }, registered: true, signedIn: true, kind: 'shared', pcUser: true });
    const p = await ctx.newPage();
    p.on('dialog', async d => { await d.dismiss().catch(() => {}); });
    await p.goto('http://127.0.0.1:' + PORT + '/index_main.html', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => document.body.innerText.includes('スケジュール') && !document.body.innerText.includes('担当者を選択'), null, { timeout: 40000 }).catch(() => {});
    await p.waitForTimeout(2500);
    {
      const b = {};
      b.staffBtn = await boxOf(p, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.title === 'スタッフ管理'));
      b.holidayBtn = await boxOf(p, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.title === '休業日設定'));
      b.restoreBtn = await boxOf(p, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /復旧/.test(x.textContent) && x.textContent.length < 8));
      b.logout = await boxOf(p, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.title === 'ログアウト'));
      b.me = await boxOf(p, () => { const e = [...document.querySelectorAll('span,div')].find(x => x.offsetParent !== null && x.textContent.trim() === '江川京志' && x.getBoundingClientRect().top < 60); return e; });
      await shoot(p, 'p1-header.png', 'PC：管理者のボタン', b, 1500, 950);
    }
    // p2: スタッフ設定
    await p.evaluate(() => document.dispatchEvent(new CustomEvent('openStaffSettings'))); await p.waitForTimeout(1200);
    {
      const b = {};
      // 行を選んで右側の編集欄を出す
      { const r = await boxOf(p, () => { const h = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim() === '⚙️ スタッフ設定'); let m = h; for (let i = 0; i < 6 && m; i++) { if (m.getBoundingClientRect().width > 500 && m.getBoundingClientRect().height > 300) break; m = m.parentElement; } return m && [...m.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.includes('見取大介') && x.getBoundingClientRect().height < 60 && x.getBoundingClientRect().width > 100 && x.getBoundingClientRect().width < 300); }); if (r) await p.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await p.waitForTimeout(800); }
      b.newBtn = await boxOf(p, () => { const h = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim() === '⚙️ スタッフ設定'); let m = h; for (let i = 0; i < 6 && m; i++) { if (m.getBoundingClientRect().width > 500 && m.getBoundingClientRect().height > 300) break; m = m.parentElement; } return m && [...m.querySelectorAll('button')].find(x => /新規登録/.test(x.textContent)); });
      b.storeTabs = await boxOf(p, () => { const h = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim() === '⚙️ スタッフ設定'); let m = h; for (let i = 0; i < 6 && m; i++) { if (m.getBoundingClientRect().width > 500 && m.getBoundingClientRect().height > 300) break; m = m.parentElement; } const a = m ? [...m.querySelectorAll('button')].filter(x => /^(本店|三田店)$/.test(x.textContent.trim())) : []; if (a.length < 2) return null; const r = a.map(e => e.getBoundingClientRect()); return { getBoundingClientRect: () => ({ left: Math.min(...r.map(q => q.left)), top: Math.min(...r.map(q => q.top)), width: Math.max(...r.map(q => q.right)) - Math.min(...r.map(q => q.left)), height: Math.max(...r.map(q => q.bottom)) - Math.min(...r.map(q => q.top)) }) }; });
      b.row = await boxOf(p, () => { const h = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim() === '⚙️ スタッフ設定'); let m = h; for (let i = 0; i < 6 && m; i++) { if (m.getBoundingClientRect().width > 500 && m.getBoundingClientRect().height > 300) break; m = m.parentElement; } return m && [...m.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.includes('見取大介') && x.getBoundingClientRect().height < 60 && x.getBoundingClientRect().width > 100 && x.getBoundingClientRect().width < 300); });
      b.close = await boxOf(p, () => { const h = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim() === '⚙️ スタッフ設定'); let m = h; for (let i = 0; i < 6 && m; i++) { if (m.getBoundingClientRect().width > 500 && m.getBoundingClientRect().height > 300) break; m = m.parentElement; } return m && [...m.querySelectorAll('button')].find(x => /^[×✕]$/.test(x.textContent.trim())); });
      b.editPane = await boxOf(p, () => { const h = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim() === '⚙️ スタッフ設定'); let m = h; for (let i = 0; i < 6 && m; i++) { if (m.getBoundingClientRect().width > 500 && m.getBoundingClientRect().height > 300) break; m = m.parentElement; } return m && [...m.querySelectorAll('input')].find(x => x.offsetParent !== null) && [...m.querySelectorAll('input')].find(x => x.offsetParent !== null).closest('div').parentElement; });
      b.del = await boxOf(p, () => { const h = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim() === '⚙️ スタッフ設定'); let m = h; for (let i = 0; i < 6 && m; i++) { if (m.getBoundingClientRect().width > 500 && m.getBoundingClientRect().height > 300) break; m = m.parentElement; } return m && [...m.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '削除'); });
      await shoot(p, 'p2-staff-settings.png', 'PC：スタッフ設定', b, 1500, 950);
    }
    await p.evaluate(() => { const h = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim() === '⚙️ スタッフ設定'); let m = h; for (let i = 0; i < 6 && m; i++) { if (m.getBoundingClientRect().width > 500 && m.getBoundingClientRect().height > 300) break; m = m.parentElement; } const b = m && [...m.querySelectorAll('button')].find(x => /^[×✕]$/.test(x.textContent.trim())); if (b) b.click(); }); await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(800);
    // p3: 休業日設定（前のモーダルを確実に消すため開き直す）
    await p.goto('http://127.0.0.1:' + PORT + '/index_main.html', { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => document.body.innerText.includes('スケジュール') && !document.body.innerText.includes('担当者を選択'), null, { timeout: 40000 }).catch(() => {}); await p.waitForTimeout(2500);
    await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.title === '休業日設定'); if (b) b.click(); }); await p.waitForTimeout(1200);
    {
      const b = {};
      b.dow = await boxOf(p, () => { const e = [...document.querySelectorAll('div,span')].find(x => x.offsetParent !== null && x.textContent.trim().startsWith('毎週の定休日') && x.textContent.length < 20); return e && e.parentElement; });
      b.tue = await boxOf(p, () => { const e = [...document.querySelectorAll('div,span')].find(x => x.offsetParent !== null && /第2火曜日/.test(x.textContent) && x.textContent.length < 60); return e && e.parentElement; });
      b.cal = await boxOf(p, () => { const e = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && /^d{4}年d{1,2}月$/.test(x.textContent.trim())); let c = e; for (let i = 0; i < 4 && c; i++) c = c.parentElement; return c; });
      b.ok = await boxOf(p, btn, '確定して閉じる');
      await shoot(p, 'p3-holiday.png', 'PC：休業日設定', b, 1500, 950);
    }
    await p.keyboard.press('Escape').catch(() => {}); await p.mouse.click(8, 500); await p.waitForTimeout(600);
    // p4: 復旧（開き直す）
    await p.goto('http://127.0.0.1:' + PORT + '/index_main.html', { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => document.body.innerText.includes('スケジュール') && !document.body.innerText.includes('担当者を選択'), null, { timeout: 40000 }).catch(() => {}); await p.waitForTimeout(2500);
    await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /復旧/.test(x.textContent) && x.textContent.length < 8); if (b) b.click(); }); await p.waitForTimeout(2500);
    await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /今すぐ時点保存/.test(x.textContent)); if (b) b.click(); }); await p.waitForTimeout(4000);
    await p.evaluate(() => { const e = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim() === '🕒'); const row = e && e.parentElement; if (row) row.click(); }); await p.waitForTimeout(1500);
    {
      const b = {};
      b.now = await boxOf(p, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /今すぐ時点保存/.test(x.textContent)));
      b.list = await boxOf(p, () => { const e = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim().startsWith('戻す範囲を選ぶ')); return e && e.parentElement; });
      b.first = await boxOf(p, () => { const e = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim() === '🕒'); return e && e.parentElement; });
      b.add = await boxOf(p, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '＋ 足す'));
      b.all = await boxOf(p, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /全部この時点/.test(x.textContent)));
      b.store = await boxOf(p, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /店別|本店だけ|三田店だけ/.test(x.textContent) && x.textContent.length < 20));
      await shoot(p, 'p4-restore.png', 'PC：復旧', b, 1500, 950);
    }
    await ctx.close();
  }
  await browser.close(); server.close(); server2.close();
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(shots, null, 2), 'utf8');
  console.log('\n撮影 ' + shots.length + ' 枚 → ' + OUT_DIR + '（置き換えた氏名 ' + nameMap.size + ' 件）');
})();
