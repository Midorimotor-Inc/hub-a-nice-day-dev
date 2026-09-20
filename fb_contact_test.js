// 住所・電話（2026-09-20）の検査。にせの firebase で本物には繋がない。
//   customers.html：取り込み済みの住所・電話が氏名の下／車種の横に出る。見出しの 👁 で隠せて、端末に記憶される
//   index_dev.html：車検モーダルに電話・住所欄（整備は電話だけ）。保存すると insp に入り、行に 📞 が出る。既存の行の電話がモーダルに入る
//   実行: node fb_contact_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8169, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const now = new Date();
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ME = { email: 'egawa@midori-m.com', uid: 'uid_egawa', name: '江川京志', store: 'honten' };
const signedInInit = ([k, me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.uid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: 'h7', role: 'admin', active: true, kind: 'staff' } };
  st['devices/dev-test'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'shared', l: 'テストPC', ua: 'test', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev-test');
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: 'h7', name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', 'shared');
};
(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'index_dev.html' || p === 'customers.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const seed = {
    [STOR + 'cf-index']: [{ name: '202609', total: 2, chunks: 1 }],
    [STOR + 'cf-202609-index']: { name: '202609', total: 2, chunks: 1 },
    [STOR + 'cf-202609-chunk-0']: [
      { custId: 'c1', name: '前村太郎', no: '1234', carType: 'フィット', phoneHome: '079-000-1111', phoneMobile: '090-1111-2222', address: '三田市けやき台1-1', expiry: '2026-10-30', status: 'none', tokuten: '-' },
      { custId: 'c2', name: '瀬川花子', no: '5678', carType: 'N-BOX', phoneHome: '', phoneMobile: '', address: '', expiry: '2026-10-31', status: 'none', tokuten: '-' },
    ],
    [STOR + 'cust-updates']: [],
    [STOR + 'insp']: { [DK]: [{ name: '北前', course: 1, staff: '江川京志', store: 'honten', bookingStatus: 'confirmed', seq: Date.now() - 900000, id: 1, time: '09:00', carType: 'ヴィッツ', phone: '080-3333-4444', address: '神戸市北区1-2' }] },
    [STOR + 'honten-sched']: { [DK]: { '11:00': { name: '下野', work: 'M6', staff: '江川京志', id: 2, carType: 'アクア', phone: '090-5555-6666' } } },
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
  };
  const routeFakeFb = ctx => ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  const routeGas = ctx => ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const watch = page => { const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0 && m.text().indexOf('deoptimised') < 0) errs.push(m.text().slice(0, 200)); }); page.on('dialog', async d => { await d.accept().catch(() => {}); }); return errs; };
  const open = async (file) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await ctx.addInitScript(signedInInit, [0, ME, STOR]);
    await routeFakeFb(ctx); await routeGas(ctx);
    const page = await ctx.newPage(); const errs = watch(page);
    await page.goto('http://localhost:' + PORT + '/' + file, { waitUntil: 'domcontentloaded' });
    return { ctx, page, errs };
  };

  // ── 1. リスト ──
  {
    const { ctx, page, errs } = await open('customers.html');
    t('リスト：顧客が出る', await seeText(page, '前村太郎', 30000));
    t('リスト：氏名の下に住所、車種の横に電話（携帯・自宅）が出る', await seeText(page, '🏠 三田市けやき台1-1', 5000) && (await page.evaluate(() => document.body.innerText)).includes('📞090-1111-2222') && (await page.evaluate(() => document.body.innerText)).includes('📞079-000-1111'));
    t('リスト：連絡先の無い人には何も出ない', await page.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find(r => r.innerText.includes('瀬川花子')); return !!tr && !tr.innerText.includes('📞') && !tr.innerText.includes('🏠'); }));
    t('リスト：見出しの氏名に 👁 がある', await page.evaluate(() => [...document.querySelectorAll('th')].some(th => th.innerText.includes('氏名') && th.innerText.includes('👁'))));
    await page.evaluate(() => { const th = [...document.querySelectorAll('th')].find(x => x.innerText.includes('氏名')); const s = th && th.querySelector('span'); if (s) s.click(); });
    t('リスト：👁 で住所・電話が隠れる', await page.waitForFunction(() => !document.body.innerText.includes('三田市けやき台') && !document.body.innerText.includes('📞090-1111-2222'), null, { timeout: 5000 }).then(() => true).catch(() => false));
    t('リスト：表示の切替は端末に記憶される', (await page.evaluate(k => localStorage.getItem(k + 'list-contact'), STOR)) === 'off');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await seeText(page, '前村太郎', 30000);
    t('リスト：開き直しても隠れたまま', !(await page.evaluate(() => document.body.innerText)).includes('三田市けやき台'));
    await page.evaluate(() => { const th = [...document.querySelectorAll('th')].find(x => x.innerText.includes('氏名')); const s = th && th.querySelector('span'); if (s) s.click(); });
    t('リスト：もう一度 👁 で戻る', await seeText(page, '🏠 三田市けやき台1-1', 5000));
    await page.screenshot({ path: path.join(DIR, 'smoke-contact-list.png') });
    t('リスト：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // ── 2. スケジュール ──
  {
    const { ctx, page, errs } = await open('index_dev.html');
    await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
    t('スケジュール：車検の行に電話が出る', await seeText(page, '📞080-3333-4444', 20000), await page.evaluate(() => document.body.innerText.slice(0, 300)));
    t('スケジュール：整備の行にも電話が出る', await seeText(page, '📞090-5555-6666', 5000));
    // 既存の車検行を開く → 電話・住所が入っている
    await page.evaluate(() => { const el = [...document.querySelectorAll('span')].find(x => x.textContent === '北前'); if (el) el.click(); });
    t('車検モーダル：電話・住所の欄があり、既存の値が入っている', await page.waitForFunction(() => { const ph = document.querySelector('input[placeholder="090-0000-0000"]'); const ad = document.querySelector('input[placeholder="市区町村から"]'); return !!ph && !!ad && ph.value === '080-3333-4444' && ad.value === '神戸市北区1-2'; }, null, { timeout: 8000 }).then(() => true).catch(() => false));
    await page.screenshot({ path: path.join(DIR, 'smoke-contact-modal.png') });
    // 住所を直して保存 → insp に入る
    await page.fill('input[placeholder="市区町村から"]', '神戸市北区9-9');
    await clickText(page, '保存');
    t('車検モーダル：保存すると insp の行に電話・住所が入る', await page.waitForFunction(([k, dk]) => { const r = (window.__fakeFb.get(k + 'insp') || {})[dk] || []; return r.some(x => x.name === '北前' && x.phone === '080-3333-4444' && x.address === '神戸市北区9-9'); }, [STOR, DK], { timeout: 10000 }).then(() => true).catch(() => false), await page.evaluate(k => window.__fakeFb.get(k + 'insp'), STOR));
    // 整備の行を開く → 電話欄だけ
    await page.evaluate(() => { const el = [...document.querySelectorAll('span')].find(x => x.textContent === '下野'); if (el) el.click(); });
    t('整備モーダル：電話欄はあり、住所欄は無い', await page.waitForFunction(() => { const ph = document.querySelector('input[placeholder="090-0000-0000"]'); const ad = document.querySelector('input[placeholder="市区町村から"]'); return !!ph && ph.value === '090-5555-6666' && !ad; }, null, { timeout: 8000 }).then(() => true).catch(() => false));
    t('スケジュール：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
