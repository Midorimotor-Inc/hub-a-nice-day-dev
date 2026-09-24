// 登録手順スライド用の画面写真を撮る（にせの firebase・本物には繋がない）。
//   実行: node capture_guide_shots.js  → guide_shots/*.png と index.json
//   撮るもの：PC の登録画面／種類を選ぶ／登録完了＋スマホ登録のQR／ログイン画面の「スマホを登録」
//             スマホの登録画面（QRから開いた形）／完了・ホーム画面に追加／管理者コンソールの招待QR
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
const DIR = __dirname, PORT = 8190, STOR = 'hub-v8-dev-';
const OUT_DIR = path.join(DIR, 'guide_shots');
fs.mkdirSync(OUT_DIR, { recursive: true });
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const shots = [];
const ME = { email: 'tikurin@midori-m.com', uid: 'uid_tikurin', name: '竹林直行', store: 'honten' };
const SEED = {
  'meta/allowed': {
    'tikurin@midori-m,com': { email: 'tikurin@midori-m.com', name: '竹林直行', store: 'honten', uid: 'h3', role: 'staff', active: true, kind: 'staff' },
    'egawa@midori-m,com': { email: 'egawa@midori-m.com', name: '江川京志', store: 'honten', uid: 'h7', role: 'admin', active: true, kind: 'staff' },
  },
  [STOR + 'honten-staff-v2']: [
    { uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten', loginEmail: 'egawa@midori-m.com' },
    { uid: 'h3', name: '竹林直行', myNumber: 3, badge: 'inspector', store: 'honten', loginEmail: 'tikurin@midori-m.com' },
  ],
  [STOR + 'sanda-staff-v2']: [], [STOR + 'insp']: {}, [STOR + 'honten-sched']: {},
};
const seeText = async (page, s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const boxOf = async (page, fn, arg) => {
  try {
    return await page.evaluate(([src, a]) => {
      const f = eval('(' + src + ')'); const el = f(a); if (!el) return null;
      const r = el.getBoundingClientRect();
      const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(innerWidth, r.right), y1 = Math.min(innerHeight, r.bottom);
      if (x1 <= x0 || y1 <= y0) return null;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }, [fn.toString(), arg === undefined ? null : arg]);
  } catch (e) { return null; }
};
const btn = (t) => [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.replace(/\s/g, '').includes(t.replace(/\s/g, '')) && b.textContent.length < t.length + 14);
const shoot = async (page, file, label, boxes, vw, vh) => {
  await page.screenshot({ path: path.join(OUT_DIR, file) });
  const clean = {}; Object.keys(boxes || {}).forEach(k => { if (boxes[k]) clean[k] = boxes[k]; });
  shots.push({ file, label, vw, vh, boxes: clean });
  console.log('  ✔ ' + file + '  ' + label + '  枠 ' + Object.keys(clean).join(','));
};
(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (/\.html$/.test(p)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8')); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const PW = 1280, PH = 860, MW = 390, MH = 844;
  const mkCtx = async (opt) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: PW, height: PH }, deviceScaleFactor: 2 }, (opt && opt.ctx) || {}));
    await ctx.addInitScript(([seed, stor, o]) => {
      if (!localStorage.getItem('__fakeFbStore')) {
        // にせの firebase の入れ物は { 'コレクション/ID': 中身 }。kv は {v: JSON文字列} にして入れる
        const st = {};
        for (const k in seed) st[k.indexOf('hub-v8-') === 0 ? 'kv/' + k : k] = (k.indexOf('hub-v8-') === 0) ? { v: JSON.stringify(seed[k]) } : seed[k];
        localStorage.setItem('__fakeFbStore', JSON.stringify(st));
      }
      if (o.signedIn) localStorage.setItem('__fakeFbUser', JSON.stringify({ email: o.email, uid: o.uid }));
      if (o.registered) {
        localStorage.setItem(stor + 'auth-devid', 'dev-guide');
        localStorage.setItem(stor + 'auth-mine', JSON.stringify(o.mine || []));
        localStorage.setItem(stor + 'auth-kind', o.kind || 'own');
      }
      sessionStorage.setItem(stor + 'fs-pref2', 'off');
    }, [SEED, STOR, opt || {}]);
    await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
      const u = route.request().url();
      route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB : '' });
    });
    await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
    return ctx;
  };

  // ── PC：登録画面 ──
  {
    const ctx = await mkCtx({});
    const page = await ctx.newPage();
    await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, 'メールアドレス', 25000);
    await page.waitForTimeout(1200);
    const b = {};
    b.email = await boxOf(page, () => document.querySelector('input[type="email"],input[placeholder*="メールアドレス"]'));
    b.code = await boxOf(page, () => document.querySelector('input[placeholder="------"],input[inputmode="numeric"]'));
    b.go = await boxOf(page, btn, '登録する');
    b.link = await boxOf(page, () => [...document.querySelectorAll('button,a,span')].find(x => x.offsetParent !== null && /コードがない/.test(x.textContent) && x.textContent.length < 40));
    await shoot(page, 'p1-register.png', 'PC：登録画面', b, PW, PH);
    // アドレスとコードを入れて登録 → 種類を選ぶ
    await page.fill('input[type="email"]', 'tikurin@midori-m.com').catch(() => {});
    await page.evaluate(() => { const c = document.querySelector('input[inputmode="numeric"],input[placeholder="------"]'); if (c) { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(c, '123456'); c.dispatchEvent(new Event('input', { bubbles: true })); } });
    await page.waitForTimeout(300);
    const b2 = {};
    b2.email = b.email; b2.code = b.code; b2.go = b.go;
    await shoot(page, 'p1b-filled.png', 'PC：入れたところ', b2, PW, PH);
    await ctx.close();
  }
  // ── PC：種類を選ぶ／登録完了（QR）──
  {
    const ctx = await mkCtx({ signedIn: true, email: 'tikurin@midori-m.com', uid: 'uid_tikurin' });
    const page = await ctx.newPage();
    await page.goto('http://localhost:' + PORT + '/index_dev.html?inv=1&e=tikurin@midori-m.com&mode=signIn&oobCode=good', { waitUntil: 'domcontentloaded' });
    if (await seeText(page, 'この端末はどちらですか', 25000)) {
      const b = {};
      b.shared = await boxOf(page, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /みんなで使う/.test(x.textContent)));
      b.own = await boxOf(page, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /自分専用/.test(x.textContent)));
      await shoot(page, 'p2-kind.png', 'PC：端末の種類', b, PW, PH);
      await clickText(page, '自分専用');
    }
    await seeText(page, 'スマホも登録しますか', 25000);
    const b3 = {};
    b3.ask = await boxOf(page, () => [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && /スマホも登録しますか/.test(x.textContent) && x.textContent.length < 160));
    b3.yes = await boxOf(page, btn, 'はい（QR を表示）');
    b3.later = await boxOf(page, btn, 'あとで');
    b3.done = await boxOf(page, () => [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && /この端末に登録しました/.test(x.textContent) && x.textContent.length < 40));
    await shoot(page, 'p3-done.png', 'PC：登録できた', b3, PW, PH);
    await clickText(page, 'はい（QR を表示）');
    await page.waitForFunction(() => !!document.querySelector('svg') || document.body.innerText.includes('この URL をスマホで開いてください'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    const b4 = {};
    b4.qr = await boxOf(page, () => { const s = [...document.querySelectorAll('svg')].find(x => x.offsetParent !== null && x.getBoundingClientRect().width > 100); return s ? s.parentElement : null; });
    b4.steps = await boxOf(page, () => [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && /スマホでの手順/.test(x.textContent) && x.textContent.length < 400));
    b4.start = await boxOf(page, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /はじめる/.test(x.textContent)));
    await shoot(page, 'p4-qr.png', 'PC：スマホ登録のQR', b4, PW, PH);
    await clickText(page, 'はじめる');
    await seeText(page, 'スケジュール', 25000);
    await page.waitForTimeout(1500);
    // ログアウト → ログイン画面の「スマホを登録（QR）」
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.offsetParent !== null && (e.title || '').includes('ログアウト')); if (b) b.click(); });
    await page.waitForTimeout(1200);
    const b5 = {};
    b5.qrbtn = await boxOf(page, btn, 'スマホを登録');
    b5.add = await boxOf(page, btn, 'スタッフを追加');
    await shoot(page, 'p5-login.png', 'PC：ログイン画面', b5, PW, PH);
    await ctx.close();
  }
  // ── スマホ：QR から開いた登録（アドレス・コード入り）──
  {
    const ctx = await mkCtx({ ctx: { viewport: { width: MW, height: MH }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:' + PORT + '/mobile.html?inv=1&e=tikurin@midori-m.com&code=123456', { waitUntil: 'domcontentloaded' });
    await seeText(page, '招待コード', 25000);
    await page.waitForTimeout(1200);
    const b = {};
    b.email = await boxOf(page, () => document.querySelector('input[type="email"]'));
    b.code = await boxOf(page, () => document.querySelector('input[inputmode="numeric"],input[placeholder="------"]'));
    b.go = await boxOf(page, btn, '登録する');
    await shoot(page, 'm1-register.png', 'スマホ：登録画面（QRから）', b, MW, MH);
    await ctx.close();
  }
  // ── スマホ：登録できた＋ホーム画面に追加 ──
  {
    const ctx = await mkCtx({ ctx: { viewport: { width: MW, height: MH }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }, signedIn: true, email: 'tikurin@midori-m.com', uid: 'uid_tikurin' });
    const page = await ctx.newPage();
    await page.goto('http://localhost:' + PORT + '/mobile.html?inv=1&e=tikurin@midori-m.com&mode=signIn&oobCode=good', { waitUntil: 'domcontentloaded' });
    if (await seeText(page, 'この端末はどちらですか', 25000)) await clickText(page, '自分専用');
    await seeText(page, 'この端末に登録しました', 25000);
    await page.waitForTimeout(800);
    const b = {};
    b.done = await boxOf(page, () => [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && /この端末に登録しました/.test(x.textContent) && x.textContent.length < 40));
    b.home = await boxOf(page, () => [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && /ホーム画面に追加すると便利/.test(x.textContent) && x.textContent.length < 300));
    b.start = await boxOf(page, btn, 'はじめる');
    await shoot(page, 'm2-done.png', 'スマホ：登録できた', b, MW, MH);
    await ctx.close();
  }
  // ── 管理者コンソール：招待とQR ──
  {
    const ctx = await mkCtx({ signedIn: true, email: 'egawa@midori-m.com', uid: 'uid_egawa' });
    const page = await ctx.newPage();
    page.on('dialog', async d => { await d.accept().catch(() => {}); });
    await page.goto('http://localhost:' + PORT + '/admin.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, '本人認証の進み具合', 25000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('[data-tab]')].find(e => e.innerText.includes('スタッフ')); if (b) b.click(); });
    await page.waitForTimeout(600);
    const b = {};
    b.invite = await boxOf(page, () => document.querySelector('[data-invite]'));
    b.progress = await boxOf(page, () => [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && /本人認証の進み具合/.test(x.textContent) && x.textContent.length < 200));
    await shoot(page, 'a1-console.png', 'コンソール：招待を送る', b, PW, PH);
    await page.evaluate(() => { const x = document.querySelector('[data-invite]'); if (x) x.click(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const x = document.querySelector('[data-dlg="ok"]'); if (x) x.click(); });
    await page.waitForFunction(() => !!document.getElementById('qrwrap'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(700);
    const b2 = {};
    b2.qr = await boxOf(page, () => { const w = document.getElementById('qrwrap'); const s = w && w.querySelector('svg'); return s ? s.parentElement : null; });
    b2.code = await boxOf(page, () => { const w = document.getElementById('qrwrap'); return w ? [...w.querySelectorAll('b')].find(x => /^[0-9]{6}$/.test(x.textContent.trim())) : null; });
    b2.copy = await boxOf(page, () => document.getElementById('qrcopy'));
    await shoot(page, 'a2-inviteqr.png', 'コンソール：招待QR', b2, PW, PH);
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(shots, null, 1));
  console.log('撮影 ' + shots.length + ' 枚 → ' + OUT_DIR);
  await browser.close(); server.close();
})();
