// 取扱説明書用のスクリーンショットを自動撮影する。
//
// 使い方: node capture_manual_shots.js
// 出力先: ./manual_shots/*.png
//
// ★安全性
//   ・GASへの書き込み(POST)は全て遮断する。実データは一切変更されない。
//   ・読み取りは【DEVのデータ】だけを使う。本番データには触れない。
//   ・読み取った値の氏名は【架空の名前に置き換えて】から画面に流す。
//     マニュアルにお客様の実名が載らないようにするため。
//
// ★見た目は本番（青ヘッダー・[DEV]表記なし）にする。
//   スタッフが実際に使う画面と同じ絵にしたいので、本番ファイルを起動し、
//   キーだけ hub-v8- → hub-v8-dev- に読み替えてDEVのデータを流し込む。
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません。'); process.exit(1); }

const MAIN_DIR = path.resolve(__dirname, '..', 'hub-a-nice-day');
const OUT_DIR  = path.join(__dirname, 'manual_shots');
const PORT = 8155;
const GAS_HOST = 'https://script.google.com';

// ── 氏名の匿名化 ──────────────────────────────────────────────
// 実名 → 架空名の対応を1度だけ決め、以後ずっと同じ名前に置き換える
// （同じ人が別画面で別名になると説明が破綻するため）。
// 姓×名の組み合わせで作る（末尾に番号が付くと不自然なので、十分な数を用意する）。
const SEI = ['山田','佐藤','鈴木','高橋','田中','伊藤','渡辺','中村','小林','加藤','吉田','山本',
             '松本','井上','木村','清水','斉藤','山口','森田','池田','橋本','石川','原田','岡田',
             '長谷川','近藤','村上','遠藤','青木','坂本'];
const MEI = ['太郎','花子','一郎','美咲','健二','良子','翔','さくら','大輔','明美','隆','千夏',
             '浩二','真理','拓也','由美','誠','あかり','徹','香織'];
const nameMap = new Map();
let fakeIdx = 0;
function fakeName(real) {
  const k = String(real || '').trim();
  if (!k) return real;
  if (!nameMap.has(k)) {
    const n = SEI[fakeIdx % SEI.length] + '　' + MEI[Math.floor(fakeIdx / SEI.length) % MEI.length];
    nameMap.set(k, n);
    fakeIdx++;
  }
  return nameMap.get(k);
}
// スタッフ名は残す（マニュアルで「担当者」の説明に使うため。社内の名前なので問題ない）
let staffNames = new Set();

// 値の中を歩いて、氏名らしきフィールドを置き換える。
// ★GASの値は「JSON文字列の中にさらにJSON文字列」という入れ子になっていることがある
//   （keys= のまとめ読みは {キー: "<値のJSON文字列>"}）。文字列の中まで潜らないと
//   取りこぼす（最初の実装がこれで、スケジュールの氏名が素通りした）。
const NAME_KEYS = ['name', '氏名', 'お名前', '顧客名', 'custName'];
const NOTE_KEYS = ['note', 'memo', 'remark', '備考', 'メモ'];
const TEL_KEYS  = ['tel', 'phone', 'addr', 'address', '電話', '電話番号', '住所'];
function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) {
      const val = v[k];
      if (NAME_KEYS.indexOf(k) >= 0 && typeof val === 'string') {
        o[k] = staffNames.has(val.trim()) ? val : fakeName(val);
      } else if (NOTE_KEYS.indexOf(k) >= 0 && typeof val === 'string' && val.trim()) {
        o[k] = '（メモ欄）';
      } else if (TEL_KEYS.indexOf(k) >= 0) {
        o[k] = typeof val === 'string' && val ? '000-0000-0000' : val;
      } else {
        o[k] = scrub(val);
      }
    }
    return o;
  }
  // 文字列がJSONを抱えていたら、その中も辿る
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.charAt(0) === '{' || t.charAt(0) === '[') {
      try { return JSON.stringify(scrub(JSON.parse(t))); } catch (e) { return v; }
    }
  }
  return v;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const server = http.createServer((req, res) => {
    const f = path.join(MAIN_DIR, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': path.extname(f) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise(r => server.listen(PORT, r));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2 });

  let reads = 0, blocked = 0;
  await context.route(GAS_HOST + '/**', async route => {
    const req = route.request();
    if (req.method() === 'POST') {                 // 書き込みは絶対に通さない
      blocked++;
      await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'ok' });
      return;
    }
    try {
      // 本番キー → DEVキーへ読み替える（本番データには触らない）
      const url = req.url().replace(/hub-v8-(?!dev-)/g, 'hub-v8-dev-');
      const r = await fetch(url, { redirect: 'follow' });
      let body = await r.text();
      reads++;
      // 氏名を架空名へ。scrub が入れ子（JSON文字列の中のJSON）まで辿る。
      try { body = JSON.stringify(scrub(JSON.parse(body))); }
      catch (e) { /* JSONでない応答はそのまま */ }
      await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body });
    } catch (e) {
      await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' });
    }
  });

  // スタッフ名を先に取得（この人たちの名前は置き換えない）
  try {
    const key = 'hub-v8-dev-honten-staff-v2';
    const html = fs.readFileSync(path.join(MAIN_DIR, 'index_main.html'), 'utf8');
    const gas = (html.match(/GAS_URL = '([^']+)'/) || [])[1];
    const k   = (html.match(/GAS_API_KEY = '([^']+)'/) || [])[1];
    for (const st of ['honten', 'sanda']) {
      const r = await fetch(`${gas}?key=hub-v8-dev-${st}-staff-v2&apiKey=${encodeURIComponent(k)}`);
      const t = await r.text();
      let list = JSON.parse(t); if (typeof list === 'string') list = JSON.parse(list);
      if (Array.isArray(list)) list.forEach(s => s && s.name && staffNames.add(String(s.name).trim()));
    }
    console.log(`  スタッフ名 ${staffNames.size} 件は実名のまま（社内の名前）`);
  } catch (e) { console.log('  (スタッフ名の取得に失敗。全ての氏名を置き換えます)'); }

  const shots = [];
  const shoot = async (page, file, label) => {
    const p = path.join(OUT_DIR, file);
    await page.screenshot({ path: p });
    shots.push({ file, label });
    console.log(`  ✔ ${file}  ${label}`);
  };

  // ── ① ログイン画面（利用者を設定しない状態）──
  const p0 = await context.newPage();
  await p0.goto(`http://127.0.0.1:${PORT}/index_main.html`, { waitUntil: 'domcontentloaded' });
  await p0.waitForTimeout(9000);
  await shoot(p0, '01-login.png', 'ログイン画面');
  await p0.close();

  // ── ② 以降はログイン済みで巡回 ──
  await context.addInitScript(() => {
    sessionStorage.setItem('hub_currentUser', JSON.stringify({
      uid: 'h1', name: '見取大介', myNumber: 1, id: 1, badge: 'inspector',
      store: { id: 'honten', name: '本店', color: '#2563eb', bg: '#eff6ff', accent: '#1d4ed8' },
    }));
  });

  const page = await context.newPage();
  page.on('dialog', async d => { await d.dismiss().catch(() => {}); });
  await page.goto(`http://127.0.0.1:${PORT}/index_main.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(15000);
  await shoot(page, '02-schedule.png', '起動直後（スケジュール）');

  const nav = async (label) => {
    // ナビのボタンは絵文字やアイコンを含むことがあるので完全一致では拾えない
    // （「🔔 車両管理」が見つからなかった）。含んでいて短いものを選ぶ。
    const okc = await page.evaluate(t => {
      const b = [...document.querySelectorAll('button,div')]
        .find(x => x.textContent.includes(t) && x.offsetParent !== null && x.textContent.trim().length <= t.length + 4);
      if (b) { b.scrollIntoView(); b.click(); return true; } return false;
    }, label);
    await page.waitForTimeout(3500);
    return okc;
  };

  // ★空き枠検索は最後に回す。これはオーバーレイで開き、Escapeでも閉じないため、
  //   先に開くと以降の撮影に全部かぶってしまう（実際に予約モーダルが撮れなかった）。
  const views = [
    ['カレンダー',  '03-calendar.png',  'カレンダー画面'],
    ['スケジュール','04-schedule.png',  'スケジュール画面'],
    ['代車管理',    '05-loaner.png',    '代車管理'],
    ['車両管理',    '06-vehicles.png',  '車両管理'],
  ];
  for (const [t, f, l] of views) {
    try { if (await nav(t)) await shoot(page, f, l); else console.log(`  － ${t} のボタンが見つからず`); }
    catch (e) { console.log(`  ✖ ${t}: ${String(e).slice(0, 60)}`); }
    await page.keyboard.press('Escape').catch(() => {});
  }

  // 予約モーダル（車検表の「クリックして追加」を押す）
  //   ※先に開いていたオーバーレイ（空き枠検索）を必ず閉じてから。閉じ損ねると
  //     そちらが写ってしまう（最初の実行で実際に起きた）。
  try {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(800);
    await nav('スケジュール');
    await page.waitForTimeout(2000);
    const opened = await page.evaluate(() => {
      const t = document.querySelectorAll('table')[0];          // 左＝車検の表
      if (!t) return 'no-table';
      const row = [...t.querySelectorAll('tr')]
        .find(r => r.textContent.includes('クリックして追加') && r.offsetParent !== null);
      if (!row) return 'no-row';
      row.scrollIntoView({ block: 'center' });
      // セル→行の順に試す（どちらがハンドラを持つか実装依存のため）
      const cell = [...row.querySelectorAll('td')].find(c => c.textContent.includes('クリックして追加'));
      if (cell) cell.click();
      row.click();
      return 'clicked';
    });
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => {
      const txt = document.body.innerText;
      if (/検索（3ヶ月先/.test(txt)) return 'search-overlay';
      if (/コース|特典|入庫予定|保存/.test(txt) && document.querySelectorAll('input,select').length > 3) return 'booking';
      return 'unknown';
    });
    if (opened === 'clicked' && state === 'booking') await shoot(page, '08-modal.png', '予約入力モーダル');
    else console.log(`  － 予約モーダルを開けず（click=${opened} / 画面=${state}）`);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(1200);
  } catch (e) { console.log('  － 予約モーダル: ' + String(e).slice(0, 60)); }

  // 空き枠検索（オーバーレイなので最後に撮る）
  try {
    if (await nav('空き枠検索')) await shoot(page, '07-search.png', '空き枠検索');
  } catch (e) { console.log('  ✖ 空き枠検索: ' + String(e).slice(0, 60)); }

  await page.close();

  // ── ③ 顧客リスト ──
  const pc = await context.newPage();
  await pc.goto(`http://127.0.0.1:${PORT}/customers.html`, { waitUntil: 'domcontentloaded' });
  await pc.waitForTimeout(14000);
  await shoot(pc, '09-customers.png', '顧客リスト');
  await pc.close();

  // ── ④ モバイル ──
  const mob = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  await mob.route(GAS_HOST + '/**', async route => {   // 同じ遮断・匿名化を適用
    const req = route.request();
    if (req.method() === 'POST') { await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'ok' }); return; }
    try {
      const r = await fetch(req.url().replace(/hub-v8-(?!dev-)/g, 'hub-v8-dev-'), { redirect: 'follow' });
      let body = await r.text();
      try { body = JSON.stringify(scrub(JSON.parse(body))); } catch (e) {}
      await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body });
    } catch (e) { await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }); }
  });
  const pm = await mob.newPage();
  await pm.goto(`http://127.0.0.1:${PORT}/mobile.html`, { waitUntil: 'domcontentloaded' });
  await pm.waitForTimeout(6000);
  await shoot(pm, '10-mobile-login.png', 'モバイル：ログイン');
  try {
    await pm.fill('input[type="tel"]', '1');
    await pm.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /SIGN IN|ログイン|入る/i.test(x.textContent)); if (b) b.click(); });
    await pm.waitForTimeout(14000);
    await shoot(pm, '11-mobile-schedule.png', 'モバイル：スケジュール');
    for (const [tab, f, l] of [['カレンダー','12-mobile-calendar.png','モバイル：カレンダー'], ['代車','13-mobile-loaner.png','モバイル：代車']]) {
      const okc = await pm.evaluate(t => {
        const b = [...document.querySelectorAll('button,div')].find(x => x.textContent.trim() === t && x.offsetParent !== null && x.textContent.length < 10);
        if (b) { b.click(); return true; } return false;
      }, tab);
      await pm.waitForTimeout(3000);
      if (okc) await shoot(pm, f, l);
    }
  } catch (e) { console.log('  － モバイルのログインに失敗: ' + String(e).slice(0, 60)); }

  await browser.close();
  server.close();

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(shots, null, 2), 'utf8');
  console.log(`\n撮影 ${shots.length} 枚 → ${OUT_DIR}`);
  console.log(`GAS読み取り ${reads}件 / 遮断した書き込み ${blocked}件（実データへの書き込みゼロ）`);
  console.log(`置き換えた氏名 ${nameMap.size}件（お客様の実名はマニュアルに載りません）`);
})();
