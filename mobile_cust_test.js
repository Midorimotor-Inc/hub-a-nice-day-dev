// スマホ版の「検索」と「顧客リスト」（v2.95・2026-09-24）の検査。にせの firebase で本物には繋がない。
//   ・🔍 検索：氏名・車種・No・電話で、車検／整備／顧客リストから探せる。タップでその日のスケジュールへ
//   ・👥 顧客リスト：月ファイルの切替・絞り込み（未予約／予約済）・詳細（電話は tel: で発信）
//   ・本予約：日を選ぶ → いつもの車検の入力画面 → 保存すると insp／顧客ファイル／custbk の3つが揃う
//   ・仮予約：スケジュール（insp）には載せず、顧客ファイルと custbk にだけ残る
//   ・休業日・台数制限の日は予約できない
//   実行: node mobile_cust_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8177, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const EGAWA = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const signedInInit = ([k, me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = Object.assign(st['meta/allowed'] || {}, { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } });
  st['devices/dev-' + me.uid] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: 'テスト機', ua: 'test', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev-' + me.uid);
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', 'own');
};
// 予約する日は「来月の10日」（今日に近いと休業日・台数制限と重なるため固定で選ぶ）
const now = new Date();
const B = new Date(now.getFullYear(), now.getMonth() + 1, 10);
const BDK = `${B.getFullYear()}-${B.getMonth() + 1}-${B.getDate()}`;
const BIN = `${B.getFullYear()}-${String(B.getMonth() + 1).padStart(2, '0')}-10`;
const CLOSED = new Date(now.getFullYear(), now.getMonth() + 1, 11);
const CLOSED_DK = `${CLOSED.getFullYear()}-${CLOSED.getMonth() + 1}-${CLOSED.getDate()}`;
const CLOSED_IN = `${CLOSED.getFullYear()}-${String(CLOSED.getMonth() + 1).padStart(2, '0')}-11`;
const cust = (i, o) => Object.assign({
  custId: 'c' + i, rowIdx: i, expiry: '2026-11-30', name: '', no: 1000 + i, carType: '', phoneHome: '', phoneMobile: '',
  address: '三田市けやき台1-2-3', dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '', entryDate: '', tokuten: '-',
  course: null, store: 'honten', staff: '', note: '', status: '', bookingTime: '', linkedInspDate: '',
}, o);

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'mobile.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });

  const seed = {
    [STOR + 'insp']: { [BDK]: [{ name: '先客さん', carType: 'タント', course: 2, store: 'honten', seq: 1, time: '09:00', bookingStatus: 'confirmed' }] },
    [STOR + 'honten-sched']: { [BDK]: { '10:00': { name: '整備太郎', carType: 'ヴィッツ', work: 'オイル', content: 'オイル交換' } } },
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cdate']: [CLOSED_DK], [STOR + 'honten-cdow']: [],
    // 顧客ファイル（PC の顧客リストと同じ置き方）
    [STOR + 'cf-index']: [{ name: '202610', count: 2 }, { name: '202609', count: 1 }],
    [STOR + 'cf-202610-index']: { name: '202610', total: 2, chunks: 1 },
    [STOR + 'cf-202610-chunk-0']: [
      cust(1, { name: '井上花子', carType: 'ハスラー', phoneMobile: '090-1111-2222' }),
      cust(2, { name: '椿三十郎', carType: 'ジムニー', phoneHome: '079-555-6666', status: 'confirm', entryDate: BDK, bookingTime: '11:00' }),
    ],
    [STOR + 'cf-202609-index']: { name: '202609', total: 1, chunks: 1 },
    [STOR + 'cf-202609-chunk-0']: [cust(3, { name: '鎌田五郎', carType: 'アルト', phoneMobile: '080-3333-4444' })],
  };
  const routeFakeFb = ctx => ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  const routeGas = ctx => ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const watch = page => { const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0 && m.text().indexOf('deoptimised') < 0) errs.push(m.text().slice(0, 200)); }); page.on('dialog', async d => { await d.accept().catch(() => {}); }); return errs; };
  const kv = (page, k) => page.evaluate(k => window.__fakeFb.get(k), k);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(signedInInit, [0, EGAWA, STOR]);
  await routeFakeFb(ctx); await routeGas(ctx);
  const page = await ctx.newPage(); const errs = watch(page);
  await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('江川京志')); if (b) b.click(); });
  await seeText(page, 'カレンダー', 20000);

  // ── 1. 検索 ──
  console.log('\n■ 検索（🔍）');
  t('ヘッダーに検索ボタンがある', await clickText(page, '🔍'));
  t('検索の画面が開く', await seeText(page, '氏名・車種・顧客No・電話', 8000));
  await page.fill('input[placeholder*="セリエ"]', '先客');
  t('車検の予約が出る', await seeText(page, '先客さん', 6000));
  await page.fill('input[placeholder*="セリエ"]', '整備太郎');
  t('整備の予約も出る', await seeText(page, '整備太郎', 6000));
  await page.fill('input[placeholder*="セリエ"]', 'ハスラー');
  t('顧客リストからも出る（車種で）', await seeText(page, '井上花子', 10000));
  await page.fill('input[placeholder*="セリエ"]', '090-1111');
  t('電話番号でも探せる', await seeText(page, '井上花子', 8000));
  await page.fill('input[placeholder*="セリエ"]', 'ハスラー');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(DIR, 'smoke-mobile-find.png') });
  // 車検の行をタップ → スケジュールが開く
  await page.fill('input[placeholder*="セリエ"]', '先客');
  await seeText(page, '先客さん', 5000);
  await page.evaluate(() => { const r = [...document.querySelectorAll('div')].find(e => e.innerText && e.innerText.includes('先客さん') && e.style && e.style.borderBottom); if (r) r.click(); });
  t('タップするとその日のスケジュールへ飛ぶ', await seeText(page, '先客さん', 8000) && !(await page.evaluate(() => document.body.innerText.includes('氏名・車種・顧客No・電話'))));

  // ── 2. 顧客リスト ──
  console.log('\n■ 顧客リスト（👥）');
  t('ヘッダーに顧客リストのボタンがある', await clickText(page, '👥'));
  t('顧客リストが開き、新しい月が先に出る', await seeText(page, '井上花子', 10000) && (await page.evaluate(() => document.body.innerText)).includes('202610'));
  await page.screenshot({ path: path.join(DIR, 'smoke-mobile-custlist.png') });
  t('予約済みの人には印と入庫日が出る', await page.evaluate(() => { const t = document.body.innerText; return t.includes('椿三十郎') && t.includes('予約済'); }));
  await clickText(page, '未予約');
  t('「未予約」で絞ると予約済みの人は消える', await page.waitForFunction(() => !document.body.innerText.includes('椿三十郎') && document.body.innerText.includes('井上花子'), null, { timeout: 6000 }).then(() => true).catch(() => false));
  await clickText(page, 'すべて');
  await page.fill('input[placeholder*="氏名・車種"]', '鎌田');
  t('別の月の人は、その月のファイルに切り替えるまで出ない', !(await page.evaluate(() => document.body.innerText.includes('鎌田五郎'))));
  await clickText(page, '202609');
  t('月ファイルを切り替えると出る', await seeText(page, '鎌田五郎', 6000));
  await clickText(page, '202610');
  await page.fill('input[placeholder*="氏名・車種"]', '');
  // 詳細
  await page.evaluate(() => { const r = [...document.querySelectorAll('div')].find(e => e.innerText && e.innerText.startsWith('井上花子') && e.style && e.style.borderBottom); if (r) r.click(); });
  t('詳細が開く（満了日・店舗）', await seeText(page, '満了日', 6000));
  t('電話番号がタップで発信できる（tel:）', await page.evaluate(() => { const a = [...document.querySelectorAll('a')].find(e => (e.getAttribute('href') || '').startsWith('tel:')); return !!a && a.getAttribute('href') === 'tel:09011112222'; }));
  await page.screenshot({ path: path.join(DIR, 'smoke-mobile-custdetail.png') });
  t('住所は地図に送らず、その場に出すだけ', await page.evaluate(() => !document.querySelector('a[href*="maps"]') && document.body.innerText.includes('三田市けやき台')));

  // ── 3. 休業日・台数制限の日は予約できない ──
  console.log('\n■ 予約できない日');
  await clickText(page, 'この方を予約する');
  await page.fill('input[type="date"]', CLOSED_IN);
  t('休業日を選ぶと知らせが出て、ボタンが押せない', await seeText(page, '休業日です', 6000) && await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('本予約')); return !!b && b.disabled; }));

  // ── 4. 仮予約（スケジュールには載せない）──
  console.log('\n■ 仮予約');
  await page.fill('input[type="date"]', BIN);
  await clickText(page, '仮予約だけ入れる');
  t('顧客ファイルが「仮予約」になる', await page.waitForFunction(k => { const c = (window.__fakeFb.get(k + 'cf-202610-chunk-0') || []).find(x => x.custId === 'c1'); return c && c.status === 'temp'; }, STOR, { timeout: 15000 }).then(() => true).catch(() => false), await kv(page, STOR + 'cf-202610-chunk-0'));
  t('予約枠（custbk）に仮予約として残る', await page.waitForFunction(([k, dk]) => { const b = window.__fakeFb.get(k + 'custbk') || {}; const e = b['井上花子::' + dk]; return e && e.status === 'provisional'; }, [STOR, BDK], { timeout: 10000 }).then(() => true).catch(() => false), await kv(page, STOR + 'custbk'));
  t('スケジュール（insp）には載らない', await page.evaluate(([k, dk]) => !((window.__fakeFb.get(k + 'insp') || {})[dk] || []).some(r => r && r.name === '井上花子'), [STOR, BDK]));

  // ── 5. 本予約（いつもの入力画面 → 3つ揃う）──
  console.log('\n■ 本予約');
  await clickText(page, '👥');
  await seeText(page, '井上花子', 10000);
  await page.evaluate(() => { const r = [...document.querySelectorAll('div')].find(e => e.innerText && e.innerText.startsWith('井上花子') && e.style && e.style.borderBottom); if (r) r.click(); });
  await clickText(page, '予約を入れ直す') || await clickText(page, 'この方を予約する');
  await page.fill('input[type="date"]', BIN);
  await clickText(page, '本予約');
  t('いつもの車検の入力画面が、名前・車種入りで開く', await seeText(page, '井上花子', 8000) && await page.evaluate(() => { const i = [...document.querySelectorAll('input')].find(e => e.value === 'ハスラー'); return !!i; }), await page.evaluate(() => document.body.innerText.slice(0, 300)));
  await clickText(page, 'クイック車検');
  await page.evaluate(() => { const sel = [...document.querySelectorAll('select')].find(e => [...e.options].some(o => o.value === '13:30')); if (sel) { const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set; setter.call(sel, '13:30'); sel.dispatchEvent(new Event('change', { bubbles: true })); } });
  await page.waitForTimeout(300);
  await clickText(page, '予約確定');
  await page.waitForTimeout(800);
  const modalText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  t('スケジュール（insp）に入る', await page.waitForFunction(([k, dk]) => ((window.__fakeFb.get(k + 'insp') || {})[dk] || []).some(r => r && r.name === '井上花子' && r.bookingStatus === 'confirmed'), [STOR, BDK], { timeout: 20000 }).then(() => true).catch(() => false), modalText);
  t('先客さんの予約は消えていない', await page.evaluate(([k, dk]) => ((window.__fakeFb.get(k + 'insp') || {})[dk] || []).some(r => r && r.name === '先客さん'), [STOR, BDK]));
  t('顧客ファイルが「予約済」になり、入庫日が入る', await page.waitForFunction(([k, dk]) => { const c = (window.__fakeFb.get(k + 'cf-202610-chunk-0') || []).find(x => x.custId === 'c1'); return c && c.status === 'confirm' && c.entryDate === dk; }, [STOR, BDK], { timeout: 20000 }).then(() => true).catch(() => false), await kv(page, STOR + 'cf-202610-chunk-0'));
  t('同じチャンクの他の人（椿さん）は壊れていない', await page.evaluate(k => { const c = (window.__fakeFb.get(k + 'cf-202610-chunk-0') || []).find(x => x.custId === 'c2'); return !!c && c.name === '椿三十郎' && c.status === 'confirm'; }, STOR));
  t('予約枠（custbk）が本予約になる', await page.waitForFunction(([k, dk]) => { const e = (window.__fakeFb.get(k + 'custbk') || {})['井上花子::' + dk]; return e && e.status === 'confirmed'; }, [STOR, BDK], { timeout: 20000 }).then(() => true).catch(() => false), await kv(page, STOR + 'custbk'));
  t('顧客リストを開き直すと「予約済」で出る', await clickText(page, '👥') && await page.waitForFunction(() => [...document.querySelectorAll('div')].some(e => e.innerText && e.innerText.startsWith('井上花子') && e.style && e.style.borderBottom && e.innerText.includes('予約済')), null, { timeout: 10000 }).then(() => true).catch(() => false));

  await page.screenshot({ path: path.join(DIR, 'smoke-mobile-cust.png') });
  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
  await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
