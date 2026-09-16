// 管理者マニュアル（build_manual_pptx.js の buildAdmin）用のスクリーンショットを撮る。
//   GASは模擬（実物には触れない）。admin.html をローカルで配信し、DEV（緑）と本番（青）の両方を撮る。
//   実行: node capture_admin_shots.js   → manual_shots/admin-*.png
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8153, OUT = path.join(DIR, 'manual_shots');
const CODE = '483920', D = 86400000, now = Date.now();
const staffH = [
  { uid:'h1', name:'見取大介', myNumber:1, badge:'manager',   store:'honten', loginEmail:'daisuke@midori-m.com', sysUse:true, devPlan:['own'] },
  { uid:'h2', name:'岡上秀一', myNumber:2, badge:'inspector', store:'honten', loginEmail:'okaue@midori-m.com',   sysUse:true, devPlan:['共有PC1'] },
  { uid:'h3', name:'竹林直行', myNumber:3, badge:'inspector', store:'honten', loginEmail:'tikurin@midori-m.com', sysUse:true, devPlan:['own','共有PC1'] },
  { uid:'h6', name:'舟田祥子', myNumber:6, badge:'office',    store:'honten', sysUse:true },
  { uid:'h7', name:'江川京志', myNumber:7, badge:'bodywork',  store:'honten', loginEmail:'egawa@midori-m.com',   sysUse:true, devPlan:['own'] },
  { uid:'h8', name:'ダク',     myNumber:8, badge:'assistant', store:'honten', noLogin:true },
];
const staffS = [
  { uid:'s10', name:'藤原昭人', myNumber:10, badge:'sales', store:'sanda', loginEmail:'fujiwara@midori-m.com', sysUse:true, devPlan:['own'] },
  { uid:'s11', name:'中井啓介', myNumber:11, badge:'sales', store:'sanda', loginEmail:'k-nakai@midori-m.com',  sysUse:true, devPlan:['own'] },
];
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0';
const UA_IP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const devices = {
  d1: { n:'共有PC1',  e:'m-mitori@midori-m.com', k:'shared', l:'共有PC1', dev:1, at:now-7*D, last:now-D,   exp:now+89*D, ua:UA_PC },
  d2: { n:'見取大介', e:'daisuke@midori-m.com',  k:'own',    at:now-6*D, last:now-D,   exp:now+89*D, ua:UA_PC },
  d3: { n:'竹林直行', e:'tikurin@midori-m.com',  k:'own',    at:now-4*D, last:now,     exp:now+90*D, ua:UA_PC },
  d4: { n:'竹林直行', e:'tikurin@midori-m.com',  k:'own',    at:now-1*D, last:now,     exp:now+90*D, ua:UA_IP },
  d5: { n:'江川京志', e:'egawa@midori-m.com',    k:'own',    at:now-3*D, last:now,     exp:now+90*D, ua:UA_PC },
  d6: { n:'江川京志', e:'egawa@midori-m.com',    k:'own',    at:now-1*D, last:now,     exp:now+90*D, ua:UA_IP },
  d7: { n:'藤原昭人', e:'fujiwara@midori-m.com', k:'own',    at:now-4*D, last:now-2*D, exp:now+88*D, ua:UA_PC },
};
const devnames = [{ name:'共有PC1', store:'honten', mail:'m-mitori@midori-m.com' }, { name:'三田店タブレット', store:'sanda' }];
const admins = [{ mail:'egawa@midori-m.com', uid:'h7', name:'江川京志' }, { mail:'fujiwara@midori-m.com', uid:'s10', name:'藤原昭人' }];

const html = fs.readFileSync(path.join(DIR, 'admin.html'), 'utf8');
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'admin.html';
  if (p === 'admin.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return; }
  res.writeHead(404); res.end();
});
const gasRoute = async route => {
  const q = new URL(route.request().url()).searchParams;
  const body = o => route.fulfill({ status:200, contentType:'text/plain', headers:{ 'Access-Control-Allow-Origin':'*' }, body: JSON.stringify(o) });
  const text = s => route.fulfill({ status:200, contentType:'text/plain', headers:{ 'Access-Control-Allow-Origin':'*' }, body: s });
  if (route.request().method() === 'POST') return text('ok');
  switch (q.get('action')) {
    case 'authRequest': return body({ ok:true });
    case 'authVerify': return body({ ok:true, token:'TK~admin', exp:now+90*D, name:'江川京志', myNumber:7, store:'honten', uid:'h7', admin:true });
    case 'authAdminList': return body({ ok:true, admins });
    case 'authAdminNames': return body({ ok:true, names: admins.map(a => a.name) });
    case 'authInvite': return body({ ok:true, name:'舟田祥子' });
    case 'authRenew': return body({ ok:true, renewed:false });
  }
  const key = String(q.get('key') || '').replace(/^hub-v8-(dev-)?/, '');
  if (key === 'honten-staff-v2') return text(JSON.stringify(staffH));
  if (key === 'sanda-staff-v2')  return text(JSON.stringify(staffS));
  if (key === 'auth-devices')    return text(JSON.stringify(devices));
  if (key === 'auth-devnames')   return text(JSON.stringify(devnames));
  return text('null');
};
const see = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const click = (page, s, root) => page.evaluate(([x, r]) => { const sc = r ? document.querySelector(r) : document; const b = [...sc.querySelectorAll('button')].find(e => e.innerText.includes(x)); if (b) { b.click(); return true; } return false; }, [s, root || null]);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) });

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route('https://script.google.com/**', gasRoute);
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());

  await page.goto(`http://localhost:${PORT}/admin.html`, { waitUntil: 'domcontentloaded' });
  await see(page, 'Hub 管理者コンソール'); await page.waitForTimeout(300);
  await shot(page, 'admin-1-login.png');
  await page.fill('#m', 'egawa@midori-m.com'); await click(page, '確認コードを送る');
  await see(page, '6桁'); await page.fill('#c', CODE); await click(page, '確認する');
  await see(page, '本人認証の進み具合'); await see(page, '見取大介'); await page.waitForTimeout(5400);   // 「ログインしました」の通知（5秒）が消えるのを待つ
  await shot(page, 'admin-2-staff.png');
  // 設定ダイアログ（竹林：使う端末が2つ）
  await page.evaluate(() => { const b = document.querySelector('[data-edit="h3"]'); if (b) b.click(); });
  await see(page, 'この方が使う端末'); await page.waitForTimeout(300);
  await shot(page, 'admin-3-edit.png');
  await page.evaluate(() => { const e = document.querySelector('.scrim'); if (e) e.click(); }); await page.waitForTimeout(300);
  // 招待の確認（見取：アドレスの読み合わせ）
  await page.evaluate(() => { const b = document.querySelector('[data-invite="h1"]'); if (b) b.click(); });
  await see(page, '招待'); await page.waitForTimeout(300);
  await shot(page, 'admin-4-invite.png');
  await page.evaluate(() => { const e = document.querySelector('.scrim'); if (e) e.click(); }); await page.waitForTimeout(300);
  // 端末タブ
  await page.evaluate(() => { const b = document.querySelector('[data-tab="devices"]'); if (b) b.click(); });
  await see(page, '取り消し'); await page.waitForTimeout(300);
  await shot(page, 'admin-5-devnames.png');   // 上半分：共有端末の名前
  await page.evaluate(() => { const h = [...document.querySelectorAll('h3')].find(e => e.innerText.includes('登録された端末')); if (h) h.scrollIntoView({ block: 'start' }); window.scrollBy(0, -12); });
  await page.waitForTimeout(300);
  await shot(page, 'admin-5-devices.png');   // 下半分：登録された端末の一覧
  // 管理者タブ
  await page.evaluate(() => { const b = document.querySelector('[data-tab="admins"]'); if (b) b.click(); });
  await page.waitForTimeout(400);
  await shot(page, 'admin-6-admins.png');
  // 本番（青）
  await page.goto(`http://localhost:${PORT}/admin.html?env=prod`, { waitUntil: 'domcontentloaded' });
  await see(page, '本番環境'); await page.waitForTimeout(300);
  await shot(page, 'admin-7-prod-login.png');
  await page.fill('#m', 'egawa@midori-m.com'); await click(page, '確認コードを送る');
  await see(page, '6桁'); await page.fill('#c', CODE); await click(page, '確認する');
  await see(page, '本人認証の進み具合'); await see(page, '見取大介'); await page.waitForTimeout(5400);   // 「ログインしました」の通知（5秒）が消えるのを待つ
  await shot(page, 'admin-8-prod-staff.png');

  await browser.close();
  await new Promise(r => server.close(r));
  console.log('ok → manual_shots/admin-*.png');
})();
