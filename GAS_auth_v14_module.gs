// ============================================================================
//  Hub a Nice Day — 利用者認証（v14 / 2026-09-01 追加）
// ----------------------------------------------------------------------------
//  目的: URLとHTMLに書かれたAPIキーさえ知っていれば誰でも読み書きできる状態を塞ぐ。
//        リポジトリが公開なのでAPIキーは秘密にできない。よって「APIキー＋利用証」の
//        2つが揃った要求だけを通す。利用証はGASだけが持つ秘密鍵で署名するので偽造できない。
//
//  フロントとの取り決め:
//    apiKey パラメータに "本来のキー|利用証" の形で同梱して送る（'|' で区切る）。
//    こうすることで既存の通信コード（3ファイル22箇所）に一切手を入れずに済む。
//    利用証が無い場合は従来どおり "本来のキー" だけが届く。
//
//  段階移行:
//    スクリプトプロパティ HUB_AUTH_ENFORCE が '1' のときだけ利用証を必須にする。
//    未設定のうちは利用証なしでも通る（＝全員の登録が済むまで誰も締め出されない）。
//
//  設置に必要なスクリプトプロパティ:
//    HUB_AUTH_SECRET  … 署名鍵。未設定なら初回に自動生成する（手動設定不要）
//    HUB_AUTH_ENFORCE … '1' で利用証必須。切替の最後に手で設定する
// ============================================================================

var AUTH_TTL_DAYS        = 90;    // 利用証の有効期間
var AUTH_CODE_TTL_SEC    = 600;   // 6桁コードの有効時間（10分）
var AUTH_MAX_SEND_PER_HR = 5;     // 同じアドレスへの送信上限（メール枠の保護）
var AUTH_MAX_TRY         = 5;     // コード入力の試行上限

// 認証そのものに使うアクションは、当然ながら利用証を要求しない
var AUTH_OPEN_ACTIONS = ['authRequest', 'authVerify', 'caps'];

// ── 署名鍵（GASの中だけに存在する。HTMLには決して出さない）──────────────
function authSecret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('HUB_AUTH_SECRET');
  if (!s) {
    s = Utilities.base64EncodeWebSafe(Utilities.getUuid() + Utilities.getUuid());
    props.setProperty('HUB_AUTH_SECRET', s);
  }
  return s;
}

// 利用証を必須にするかどうか。★環境ごとに別のスイッチにしてある。
//   DEVと本番は同じGASプロジェクトを共有しているため、スイッチが1つだと
//   DEVで試した瞬間に本番も必須になってしまう。先にDEVだけで安全に試せるように分ける。
//     HUB_AUTH_ENFORCE_DEV = '1' … DEV(hub-v8-dev-)だけ必須
//     HUB_AUTH_ENFORCE     = '1' … 本番(hub-v8-)だけ必須
// 全リクエストで通る処理なので、
//   ①60秒キャッシュしてプロパティ読み取りの往復を減らす（切替の反映は最大60秒）
//   ②何かの拍子に読めなくても例外で全滅しないよう try/catch で包む
// 読めなかった場合は「必須にしない」＝サービスを止めない側に倒す
// （プロパティが読めない状況は攻撃者が作れるものではないため、可用性を優先する）。
function authEnforced_(prefix) {
  var isDev = String(prefix || '').indexOf('dev') >= 0;
  var prop = isDev ? 'HUB_AUTH_ENFORCE_DEV' : 'HUB_AUTH_ENFORCE';
  try {
    var cache = CacheService.getScriptCache();
    var ck = 'authenforce:' + prop;
    var c = cache.get(ck);
    if (c !== null && c !== undefined) return c === '1';
    var v = PropertiesService.getScriptProperties().getProperty(prop) === '1' ? '1' : '0';
    cache.put(ck, v, 60);
    return v === '1';
  } catch (e) { return false; }
}

// ── 利用証の発行と検証 ──────────────────────────────────────────────
//   形式: base64url(本文).base64url(HMAC-SHA256署名)
//   本文: {n:氏名, m:ナンバー, s:店舗, j:端末ID, x:失効時刻}
function authMakeToken_(name, myNumber, store, jti) {
  var payload = JSON.stringify({
    n: String(name || ''), m: (myNumber == null ? '' : myNumber),
    s: String(store || ''), j: String(jti || ''),
    x: Date.now() + AUTH_TTL_DAYS * 86400000
  });
  var p64 = Utilities.base64EncodeWebSafe(Utilities.newBlob(payload).getBytes());
  var sig = Utilities.computeHmacSha256Signature(p64, authSecret_());
  return p64 + '.' + Utilities.base64EncodeWebSafe(sig);
}

// 署名と期限だけを見る（端末の取り消し確認は authValid_ で行う）
function authReadToken_(token) {
  try {
    if (!token) return null;
    var parts = String(token).split('.');
    if (parts.length !== 2) return null;
    var expect = Utilities.base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(parts[0], authSecret_()));
    if (expect !== parts[1]) return null;   // 署名が違う＝偽造・改ざん
    var payload = JSON.parse(
      Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    if (!payload || !payload.x || Date.now() > payload.x) return null;  // 期限切れ
    return payload;
  } catch (e) { return null; }
}

// ── 登録済み端末の台帳（管理者が一覧・取り消しできるようにシートへ置く）────
//   キー: <prefix>auth-devices   値: { 端末ID: {n,m,s,at,exp,ua} }
function authDevicesKey_(prefix) { return String(prefix || '') + 'auth-devices'; }

function authLoadDevices_(prefix) {
  try {
    var key = authDevicesKey_(prefix);
    var cache = CacheService.getScriptCache();
    var raw = readOneValue(getSheet(), cache, key, -2);
    if (!raw || raw === 'null') return {};
    var o = JSON.parse(raw);
    return (o && typeof o === 'object' && !(o instanceof Array)) ? o : {};
  } catch (e) { return {}; }
}

//   書き込みは既存の作法に合わせる（30,000字超はドライブへ逃がす・キャッシュを捨てる）。
//   台帳は数十件程度なのでドライブ行きにはならないが、他のキーと同じ経路にしておく。
function authSaveDevices_(prefix, map) {
  var key = authDevicesKey_(prefix);
  var str = JSON.stringify(map);
  var now = new Date().toLocaleString('ja-JP');
  var sheet = getSheet();
  if (str.length <= BIG_THRESHOLD) { writeRow(sheet, key, str, now); }
  else { driveWrite(key, str); writeRow(sheet, key, FILE_MARKER, now); }
  invalidateCache(key);
}

// 端末が今も有効か（取り消されていないか）。台帳に無い端末IDは無効とする。
function authValid_(payload, prefix) {
  if (!payload || !payload.j) return false;
  var devices = authLoadDevices_(prefix);
  var d = devices[payload.j];
  if (!d) return false;                       // 管理者が取り消した／存在しない
  if (d.exp && Date.now() > d.exp) return false;
  return true;
}

// ── 要求がどの環境（本番/DEV）のものかを判定する ─────────────────────────
//   端末の台帳は環境ごとに分かれているので、どちらを見るかをここで決める。
//   明示の prefix があればそれを使い、無ければ key / keys / items から推定する。
//   'hub-v8-dev-' は 'hub-v8-' でも前方一致するので、必ず長いほうを先に判定すること。
function authPrefixOf_(o) {
  if (!o) return 'hub-v8-';
  var p = String(o.prefix || '');
  if (SNAP_ENV_PREFIXES.indexOf(p) >= 0) return p;
  var k = String(o.key || o.keys || o.emailsKey || '');
  if (!k && o.items && o.items.length && o.items[0]) k = String(o.items[0].key || '');
  if (k.indexOf('hub-v8-dev-') === 0) return 'hub-v8-dev-';
  return 'hub-v8-';
}

// ── 入口の門番。doGet / doPost の apiKey 検査の直後に呼ぶ ─────────────────
//   戻り値: null なら通過。文字列の応答が返ったらそれをそのまま return する。
function authGate_(rawApiKey, action, prefix) {
  var token = '';
  var i = String(rawApiKey || '').indexOf('|');
  if (i >= 0) token = String(rawApiKey).slice(i + 1);

  if (AUTH_OPEN_ACTIONS.indexOf(String(action || '')) >= 0) return null;  // 認証系は素通り
  if (!authEnforced_(prefix)) return null;                                // 移行期間は素通り

  var payload = authReadToken_(token);
  if (!payload) return makeResponse('unauthorized: token');
  if (!authValid_(payload, prefix)) return makeResponse('unauthorized: revoked');
  return null;
}

// apiKey から本来のキー部分だけを取り出す（既存の照合を壊さないため）
function authBaseKey_(rawApiKey) {
  var s = String(rawApiKey || '');
  var i = s.indexOf('|');
  return i >= 0 ? s.slice(0, i) : s;
}

// ── ① コードの送信要求 ───────────────────────────────────────────────
//   GET ?action=authRequest&email=...&prefix=hub-v8-dev-&apiKey=...
//   登録済みのアドレスにだけ6桁を送る。誰の名前かはここでは返さない。
function authRequest_(email, prefix) {
  try {
    email = String(email || '').trim().toLowerCase();
    if (email.indexOf('@') <= 0) return makeResponse(JSON.stringify({ ok: false, err: 'bad_email' }));
    if (SNAP_ENV_PREFIXES.indexOf(String(prefix || '')) < 0) {
      return makeResponse(JSON.stringify({ ok: false, err: 'bad_prefix' }));
    }

    var staff = authFindStaffByEmail_(prefix, email);
    if (!staff) return makeResponse(JSON.stringify({ ok: false, err: 'not_registered' }));

    var cache = CacheService.getScriptCache();
    // 送りすぎ防止（メール枠は1日100通）
    var cntKey = 'authcnt:' + email;
    var cnt = Number(cache.get(cntKey) || 0);
    if (cnt >= AUTH_MAX_SEND_PER_HR) {
      return makeResponse(JSON.stringify({ ok: false, err: 'too_many' }));
    }
    cache.put(cntKey, String(cnt + 1), 3600);

    var code = String(Math.floor(100000 + Math.random() * 900000));
    cache.put('authcode:' + email, code + '|0', AUTH_CODE_TTL_SEC);

    var env = (String(prefix).indexOf('dev') >= 0) ? '【DEV】' : '';
    MailApp.sendEmail(
      email,
      env + '【Hub a Nice Day】ログイン確認コード',
      staff.name + ' さん\n\n' +
      'ログイン画面に次の6桁を入力してください。\n\n' +
      '    ' + code + '\n\n' +
      '有効時間は10分です。\n' +
      'この操作に心当たりが無い場合は、このメールを無視してください（何も起きません）。\n\n' +
      '--\nHub a Nice Day 自動送信（返信不要）'
    );
    return makeResponse(JSON.stringify({ ok: true }));
  } catch (err) {
    return makeResponse(JSON.stringify({ ok: false, err: 'send_failed' }));
  }
}

// ── ② コードの照合と利用証の発行 ─────────────────────────────────────
//   GET ?action=authVerify&email=...&code=123456&prefix=...&ua=...&apiKey=...
function authVerify_(email, code, prefix, ua) {
  try {
    email = String(email || '').trim().toLowerCase();
    code = String(code || '').trim();
    if (SNAP_ENV_PREFIXES.indexOf(String(prefix || '')) < 0) {
      return makeResponse(JSON.stringify({ ok: false, err: 'bad_prefix' }));
    }
    var cache = CacheService.getScriptCache();
    var rec = cache.get('authcode:' + email);
    if (!rec) return makeResponse(JSON.stringify({ ok: false, err: 'expired' }));

    var sp = rec.split('|');
    var want = sp[0], tries = Number(sp[1] || 0);
    if (tries >= AUTH_MAX_TRY) {
      cache.remove('authcode:' + email);
      return makeResponse(JSON.stringify({ ok: false, err: 'too_many_tries' }));
    }
    if (code !== want) {
      cache.put('authcode:' + email, want + '|' + (tries + 1), AUTH_CODE_TTL_SEC);
      return makeResponse(JSON.stringify({ ok: false, err: 'bad_code' }));
    }
    cache.remove('authcode:' + email);

    var staff = authFindStaffByEmail_(prefix, email);
    if (!staff) return makeResponse(JSON.stringify({ ok: false, err: 'not_registered' }));

    // 端末を台帳に登録して利用証を発行。
    // 台帳はシートへの書き込みなので、他の保存と同じく25秒ロックで直列化する
    // （同時に複数人が認証しても台帳が壊れないようにする）。
    var jti = Utilities.getUuid();
    var exp = Date.now() + AUTH_TTL_DAYS * 86400000;
    var lock = LockService.getScriptLock();
    var locked = false;
    try { lock.waitLock(25000); locked = true; }
    catch (le) { return makeResponse(JSON.stringify({ ok: false, err: 'busy' })); }
    try {
      var devices = authLoadDevices_(prefix);
      devices[jti] = {
        n: staff.name, m: staff.myNumber, s: staff.store,
        at: Date.now(), exp: exp, ua: String(ua || '').slice(0, 120)
      };
      authSaveDevices_(prefix, devices);
    } finally { if (locked) lock.releaseLock(); }

    return makeResponse(JSON.stringify({
      ok: true,
      token: authMakeToken_(staff.name, staff.myNumber, staff.store, jti),
      name: staff.name, myNumber: staff.myNumber, store: staff.store,
      uid: staff.uid || '', exp: exp
    }));
  } catch (err) {
    return makeResponse(JSON.stringify({ ok: false, err: 'verify_failed' }));
  }
}

// ── スタッフ表からメールアドレスで本人を探す ────────────────────────────
//   氏名・ナンバーは本人に入力させない（自己申告だと他人を名乗れるため）。
//   管理者が登録した <prefix>{store}-staff-v2 の loginEmail と突き合わせて確定する。
function authFindStaffByEmail_(prefix, email) {
  var stores = ['honten', 'sanda'];
  for (var i = 0; i < stores.length; i++) {
    var key = String(prefix) + stores[i] + '-staff-v2';
    var raw;
    try { raw = readOneValue(getSheet(), CacheService.getScriptCache(), key, -2); } catch (e) { continue; }
    if (!raw || raw === 'null') continue;
    var list;
    try { list = JSON.parse(raw); } catch (e) { continue; }
    if (!(list instanceof Array)) continue;
    for (var j = 0; j < list.length; j++) {
      var s = list[j];
      if (!s || !s.loginEmail) continue;
      if (String(s.loginEmail).trim().toLowerCase() === email) {
        return { name: s.name, myNumber: s.myNumber, store: s.store || stores[i], uid: s.uid || '' };
      }
    }
  }
  return null;
}
