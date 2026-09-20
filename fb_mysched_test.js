// マイスケジュール（2026-09-20・アイデア仕様書③・C案＝シークレットは暗号化）の検査。にせの firebase で本物には繋がない。
//   PC：カレンダーの「📝 予定」→ 日をクリック → 公開予定を追加 → kv の mysched に本人の uid 付きで入る
//       シークレットの準備（ヒント＋答え）→ 🔒予定を追加 → mysec-{uid} に暗号文だけ（件名は平文でどこにも残らない）
//       施錠 → ヒントが出る → 違う答えは開かない → 正しい答え（全角半角・空白の違いは無視）で開く
//   別の人（竹林）：公開予定は見えるが編集できない。シークレットは本文にもサーバーの生データにも出ない
//   mobile：日詳細に予定欄。ヒント→答えで開くと同じシークレット予定が出る。追加もできる
//   実行: node fb_mysched_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8168, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const now = new Date();
const Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
const DK = `${Y}-${M + 1}-${D}`;
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const signedInInit = ([k, me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = Object.assign(st['meta/allowed'] || {}, { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } });
  st['devices/dev-' + me.uid] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'shared', l: 'テストPC', ua: 'test', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev-' + me.uid);
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', localStorage.getItem('__testKind') || 'shared');   // 検査中に own へ切り替えられるように
};
const EGAWA = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const TIKU = { email: 'tikurin@midori-m.com', fbuid: 'uid_tiku', uid: 'h3', name: '竹林直行', store: 'honten', role: 'staff' };
(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'index_dev.html' || p === 'mobile.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const seed = {
    [STOR + 'insp']: {}, [STOR + 'honten-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }, { uid: 'h3', name: '竹林直行', myNumber: 3, badge: 'inspector', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cdate']: [], [STOR + 'honten-cdow']: [],
  };
  const routeFakeFb = (ctx, extra) => ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); ' + (extra || '') + ' })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  const routeGas = ctx => ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const watch = page => { const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0 && m.text().indexOf('deoptimised') < 0) errs.push(m.text().slice(0, 200)); }); page.on('dialog', async d => { await d.accept().catch(() => {}); }); return errs; };
  const openPc = async (me, storeJson) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    if (storeJson) await ctx.addInitScript(sj => { if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', sj); }, storeJson);
    await ctx.addInitScript(signedInInit, [0, me, STOR]);
    await routeFakeFb(ctx); await routeGas(ctx);
    const page = await ctx.newPage(); const errs = watch(page);
    await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, me.name, 20000); await clickText(page, me.name); await clickText(page, 'でログイン');
    await seeText(page, 'スケジュール', 20000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('カレンダー') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 16); if (b) b.click(); });
    await page.waitForTimeout(1200);
    return { ctx, page, errs };
  };
  const pickToday = page => page.evaluate(d => { const cells = [...document.querySelectorAll('div')].filter(el => el.style && el.style.cursor === 'pointer' && el.style.minHeight === '110px' && el.textContent.trim().startsWith(String(d))); const c = cells[0]; if (c) c.click(); return !!c; }, D);
  const rawStore = page => page.evaluate(() => localStorage.getItem('__fakeFbStore') || '');
  const kv = (page, k) => page.evaluate(k => window.__fakeFb.get(k), k);

  let storeJson = '';
  // ── 1. PC・江川：公開予定とシークレット ──
  {
    const { ctx, page, errs } = await openPc(EGAWA);
    t('PC：カレンダーに「予定」の切替がある', await clickText(page, '予定'));
    t('PC：予定ビューが出る（凡例）', await seeText(page, 'マイスケジュール', 5000), await page.evaluate(() => document.body.innerText.slice(0, 300)));
    t('PC：今日の日をクリックすると予定の画面が開く', await pickToday(page) && await seeText(page, 'の予定', 5000));
    await clickText(page, '＋ 予定を追加');
    await page.fill('input[placeholder*="件名"]', '本店会議');
    await page.fill('input[type="time"]', '10:00');
    await page.fill('textarea', '2階');
    await clickText(page, '追加');
    t('PC：公開予定が mysched に本人の uid・氏名付きで入る', await page.waitForFunction(([k, dk]) => Object.values(window.__fakeFb.get(k + 'mysched') || {}).some(v => v.dk === dk && v.title === '本店会議' && v.uid === 'h7' && v.owner === '江川京志' && v.time === '10:00'), [STOR, DK], { timeout: 8000 }).then(() => true).catch(() => false), await kv(page, STOR + 'mysched'));
    t('PC：一覧に「自分」の印で出る', await seeText(page, '本店会議', 3000) && (await page.evaluate(() => document.body.innerText)).includes('自分'));
    // 編集：件名を変えても1件のまま（useShared のマージで2つになる不具合・2026-09-20）
    await clickText(page, '編集');
    await page.fill('input[placeholder*="件名"]', '本店会議（2階）');
    await clickText(page, '保存');
    t('PC：編集しても予定は1件のまま（件名が変わる）', await page.waitForFunction(() => { const m = document.querySelector('.modal-box'); const t = m ? m.innerText : ''; return t.includes('本店会議（2階）') && (t.match(/本店会議/g) || []).length === 1; }, null, { timeout: 8000 }).then(() => true).catch(() => false), await page.evaluate(() => document.body.innerText.slice(0, 400)));
    // 削除 → 消える（復活しない）
    await clickText(page, '編集'); await clickText(page, '削除');
    t('PC：削除すると消えたまま（手元に復活しない）', await page.waitForFunction(() => !document.body.innerText.includes('本店会議'), null, { timeout: 8000 }).then(() => true).catch(() => false));
    await page.waitForTimeout(1500);
    t('PC：削除の3秒後も復活していない', !(await page.evaluate(() => document.body.innerText)).includes('本店会議') && Object.keys(await kv(page, STOR + 'mysched') || {}).length === 0);
    // 入れ直す（後の検査で使う）
    await clickText(page, '＋ 予定を追加'); await page.fill('input[placeholder*="件名"]', '本店会議'); await page.fill('input[type="time"]', '10:00'); await page.fill('textarea', '2階'); await clickText(page, '追加');
    await seeText(page, '本店会議', 8000);
    // シークレットの準備
    t('PC：シークレットは未設定と出る', await seeText(page, 'まだ準備されていません', 3000));
    await clickText(page, '準備する');
    await page.fill('input[placeholder*="ヒント"]', '初めて飼った犬の名前');
    const pw = await page.$$('input[type="password"]');
    await pw[0].fill('ポチ'); await pw[1].fill('ポチ');
    await clickText(page, '決める');
    t('PC：暗号化書庫 mysec-h7 ができる（ヒント・salt・暗号文）', await page.waitForFunction(k => { const d = window.__fakeFb.get(k + 'mysec-h7'); return d && d.hint === '初めて飼った犬の名前' && d.salt && d.data && d.check; }, STOR, { timeout: 10000 }).then(() => true).catch(() => false));
    t('PC：準備後は「開いています」になる', await seeText(page, 'シークレット予定を開いています', 5000));
    // 🔒 予定を追加
    await clickText(page, '＋ 予定を追加');
    await page.fill('input[placeholder*="件名"]', '歯医者');
    await clickText(page, '🔒 シークレット');
    await clickText(page, '追加');
    t('PC：🔒予定が一覧に出る', await seeText(page, '🔒', 5000) && (await page.evaluate(() => document.body.innerText)).includes('歯医者'));
    await page.waitForTimeout(500);
    const raw = await rawStore(page);
    t('PC：サーバーの生データに件名「歯医者」が平文で無い（暗号化されている）', !raw.includes('歯医者') && raw.includes('本店会議'));
    t('PC：公開の mysched には🔒予定が入らない', !Object.values(await kv(page, STOR + 'mysched') || {}).some(v => v.title === '歯医者'));
    // 施錠 → 開け直し
    await clickText(page, '閉じる（施錠）');
    t('PC：施錠するとヒントが出て🔒予定は消える', await seeText(page, 'ヒント：', 3000) && !(await page.evaluate(() => document.body.innerText)).includes('歯医者'));
    await page.fill('input[placeholder="答え"]', 'タマ');
    await clickText(page, '開く');
    t('PC：違う答えでは開かない', await seeText(page, '答えが違います', 5000));
    await page.fill('input[placeholder="答え"]', ' ﾎﾟﾁ ');
    await clickText(page, '開く');
    t('PC：正しい答え（半角カナ・空白入り）で開き、🔒予定が戻る', await seeText(page, '歯医者', 8000));
    await page.screenshot({ path: path.join(DIR, 'smoke-mysched-pc-day.png') });
    // 閉じてカレンダーのセルに出る
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '✕' && el.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(500);
    t('PC：カレンダーのセルに公開予定と🔒予定が出る', await page.evaluate(() => { const c = [...document.querySelectorAll('div')].find(el => el.style && el.style.minHeight === '110px' && el.textContent.includes('本店会議')); return !!c && c.textContent.includes('🔒') && c.textContent.includes('歯医者'); }));
    await page.screenshot({ path: path.join(DIR, 'smoke-mysched-pc.png') });
    // 別端末で消した予定が購読で届く（同じ鍵で空の書庫を書いて、外部の変更を模す）
    await page.evaluate(async k => { const d = window.__fakeFb.get(k + 'mysec-h7'); const key = await HubSecret.derive('ポチ', d.salt, d.iter); const enc = await HubSecret.encrypt(key, {}); window.__fakeFb.set(k + 'mysec-h7', Object.assign({}, d, { iv: enc.iv, data: enc.data, u: Date.now() })); }, STOR);
    t('PC：別端末で消した🔒予定が購読で消える（リロード不要）', await page.waitForFunction(() => !document.body.innerText.includes('歯医者'), null, { timeout: 8000 }).then(() => true).catch(() => false));
    t('PC：購読で届いても開いたまま（施錠されない）', await page.evaluate(() => document.body.innerText.includes('シークレット表示中')));
    // 共有端末（auth-kind=shared）：リロードすると答えを聞き直す（鍵を覚えない）
    t('PC：共有端末では鍵を sessionStorage に覚えない', await page.evaluate(k => !sessionStorage.getItem(k + 'mysec-key-h7'), STOR));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await seeText(page, 'スケジュール', 20000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('カレンダー') && el.offsetParent !== null && el.textContent.replace(/s/g, '').length < 16); if (b) b.click(); });
    await page.waitForTimeout(800); await clickText(page, '予定');
    t('PC：共有端末はリロード後に施錠されている', await seeText(page, 'シークレットは施錠中', 8000));
    // 自分専用の端末（auth-kind=own）：開いた鍵をタブ内に覚え、リロードしても開いたまま。別の人でログインすると捨てる
    await page.evaluate(k => { localStorage.setItem(k + 'auth-kind', 'own'); localStorage.setItem('__testKind', 'own'); }, STOR);
    await pickToday(page); await seeText(page, 'ヒント：', 5000);
    await page.fill('input[placeholder="答え"]', 'ポチ'); await clickText(page, '開く');
    await seeText(page, 'シークレット予定を開いています', 8000);
    // 消した🔒予定を入れ直す（後の検査で使う）
    await clickText(page, '＋ 予定を追加'); await page.fill('input[placeholder*="件名"]', '歯医者'); await clickText(page, '🔒 シークレット'); await clickText(page, '追加');
    await seeText(page, '歯医者', 8000);
    t('PC：自分専用の端末では鍵をタブ内に覚える', await page.waitForFunction(k => !!sessionStorage.getItem(k + 'mysec-key-h7'), STOR, { timeout: 5000 }).then(() => true).catch(() => false));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await seeText(page, 'スケジュール', 20000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('カレンダー') && el.offsetParent !== null && el.textContent.replace(/s/g, '').length < 16); if (b) b.click(); });
    await page.waitForTimeout(800); await clickText(page, '予定');
    t('PC：自分専用の端末はリロード後も開いたまま', await seeText(page, 'シークレット表示中', 8000), await page.evaluate(k => ({ txt: document.body.innerText.slice(0, 200), key: !!sessionStorage.getItem(k + 'mysec-key-h7'), kind: localStorage.getItem(k + 'auth-kind') }), STOR));
    await page.evaluate(() => sessionStorage.setItem('hub_currentUser', JSON.stringify({ uid: 'h3', name: '竹林直行', store: { id: 'honten', name: '本店' } })));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await seeText(page, 'スケジュール', 20000);
    t('PC：別の人でログインすると前の人の鍵は捨てられる', await page.waitForFunction(k => !sessionStorage.getItem(k + 'mysec-key-h7'), STOR, { timeout: 8000 }).then(() => true).catch(() => false));
    await page.evaluate(k => { localStorage.setItem(k + 'auth-kind', 'shared'); localStorage.removeItem('__testKind'); }, STOR);
    t('PC：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    storeJson = await rawStore(page);
    await ctx.close();
  }
  // ── 2. PC・竹林（別の人）：公開は見える・編集不可、シークレットは見えない ──
  {
    const { ctx, page, errs } = await openPc(TIKU, storeJson);
    await clickText(page, '予定');
    await seeText(page, 'マイスケジュール', 5000);
    t('竹林：江川の公開予定がセルに出る', await page.evaluate(() => [...document.querySelectorAll('div')].some(el => el.style && el.style.minHeight === '110px' && el.textContent.includes('本店会議'))));
    t('竹林：江川の🔒予定は画面のどこにも出ない', !(await page.evaluate(() => document.body.innerText)).includes('歯医者'));
    await pickToday(page);
    await seeText(page, 'の予定', 5000);
    t('竹林：江川の公開予定に名前が付き、編集ボタンが無い', (await page.evaluate(() => document.body.innerText)).includes('江川京志') && !(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.innerText === '編集'))));
    t('竹林：自分のシークレットは未設定（江川のヒントは出ない）', await seeText(page, 'まだ準備されていません', 3000) && !(await page.evaluate(() => document.body.innerText)).includes('犬の名前'));
    t('竹林：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // ── 3. mobile・江川：日詳細の予定欄。ヒント→答えで同じ🔒予定が出る。追加できる ──
  {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(sj => { if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', sj); }, storeJson);
    await ctx.addInitScript(signedInInit, [0, EGAWA, STOR]);
    await routeFakeFb(ctx); await routeGas(ctx);
    const page = await ctx.newPage(); const errs = watch(page);
    await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, '江川京志', 20000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('江川京志')); if (b) b.click(); });
    await seeText(page, 'カレンダー', 20000);
    t('mobile：カレンダーの今日に📝の件数が出る', await page.waitForFunction(() => /📝\d/.test(document.body.innerText), null, { timeout: 15000 }).then(() => true).catch(() => false), await page.evaluate(() => document.body.innerText.slice(0, 200)));
    await page.evaluate(d => { const c = [...document.querySelectorAll('div')].filter(el => el.style && el.style.borderRadius === '10px' && el.firstElementChild && el.firstElementChild.textContent === String(d))[0]; if (c) c.click(); }, D);
    t('mobile：日詳細に公開予定が出る', await seeText(page, '本店会議', 8000), await page.evaluate(() => document.body.innerText.slice(-400)));
    t('mobile：シークレットは施錠中でヒントが出る', await seeText(page, '初めて飼った犬の名前', 5000));
    await page.fill('input[placeholder="答え"]', 'ぽち');
    await clickText(page, '開く');
    t('mobile：ひらがなの答えは（別物なので）開かない', await seeText(page, '答えが違います', 5000));
    await page.fill('input[placeholder="答え"]', 'ポチ');
    await clickText(page, '開く');
    t('mobile：正しい答えで PC で入れた🔒予定が出る', await seeText(page, '歯医者', 8000));
    await clickText(page, '＋ 予定を追加');
    await page.fill('input[placeholder*="件名"]', '美容院');
    await clickText(page, '🔒 シークレット');
    await clickText(page, '追加');
    t('mobile：🔒予定を追加すると書庫が更新され、公開には入らない', await page.waitForFunction(k => { const d = window.__fakeFb.get(k + 'mysec-h7'); const p = window.__fakeFb.get(k + 'mysched') || {}; return d && !Object.values(p).some(v => v.title === '美容院'); }, STOR, { timeout: 8000 }).then(() => true).catch(() => false) && await seeText(page, '美容院', 5000));
    await page.screenshot({ path: path.join(DIR, 'smoke-mysched-mobile.png') });
    t('mobile：サーバーの生データに「美容院」が平文で無い', !(await rawStore(page)).includes('美容院'));
    t('mobile：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
