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

var AUTH_TTL_DAYS        = 90;    // 利用証の有効期間（「最後に使った日から」90日）
var AUTH_RENEW_AFTER_DAYS = 15;   // 前回の延長から何日たったら延長し直すか
var AUTH_CODE_TTL_SEC    = 600;   // 6桁コードの有効時間（10分）
var AUTH_MAX_SEND_PER_HR = 5;     // 同じアドレスへの送信上限（メール枠の保護）
var AUTH_APP_URL = {              // 招待メールに載せる各環境の入口
  'hub-v8-':     'https://midorimotor-inc.github.io/hub-a-nice-day/',
  'hub-v8-dev-': 'https://midorimotor-inc.github.io/hub-a-nice-day-dev/'
};
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
//   本文: {n:氏名, m:ナンバー, s:店舗, j:端末ID, x:失効時刻, a:管理者なら1}
function authMakeToken_(name, myNumber, store, jti, isAdmin) {
  var payload = JSON.stringify({
    n: String(name || ''), m: (myNumber == null ? '' : myNumber),
    s: String(store || ''), j: String(jti || ''),
    x: Date.now() + AUTH_TTL_DAYS * 86400000,
    a: isAdmin ? 1 : 0
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

// ── 管理者の名簿 ─────────────────────────────────────────────────────
//   スクリプトプロパティ HUB_ADMIN_EMAILS に "メール=uid" をカンマ区切りで置く。
//     例: egawa@midori-m.com=h7,daisuke@midori-m.com=h1
//   ここはGASの中だけにある。公開しているHTMLやスプレッドシートには書かない
//   （そこに書くと、URLとAPIキーを知っている人に書き換えられてしまう）。
//   最初の1人だけ手で設定し、以後の追加・削除は管理者コンソールから行う。
var AUTH_ADMIN_PROP = 'HUB_ADMIN_EMAILS';

function authAdmins_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(AUTH_ADMIN_PROP) || '';
    var out = [];
    raw.split(',').forEach(function (part) {
      part = String(part || '').trim();
      if (!part) return;
      var eq = part.indexOf('=');
      var mail = (eq >= 0 ? part.slice(0, eq) : part).trim().toLowerCase();
      var uid  = (eq >= 0 ? part.slice(eq + 1) : '').trim();
      if (mail.indexOf('@') > 0) out.push({ mail: mail, uid: uid });
    });
    return out;
  } catch (e) { return []; }
}

function authAdminSave_(list) {
  var v = list.map(function (a) { return a.mail + (a.uid ? '=' + a.uid : ''); }).join(',');
  PropertiesService.getScriptProperties().setProperty(AUTH_ADMIN_PROP, v);
}

// そのアドレスは管理者か（見つかれば名簿の項目を返す）
function authAdminOf_(email) {
  var m = String(email || '').trim().toLowerCase();
  var list = authAdmins_();
  for (var i = 0; i < list.length; i++) if (list[i].mail === m) return list[i];
  return null;
}

// 利用証を持っている人が管理者かどうか。画面の申告は信用せず、必ずここで判定する。
function authAdminGate_(rawApiKey, prefix) {
  var token = '';
  var i = String(rawApiKey || '').indexOf('|');
  if (i >= 0) token = String(rawApiKey).slice(i + 1);
  var payload = authReadToken_(token);
  if (!payload) return null;
  if (!authValid_(payload, prefix)) return null;
  if (!payload.a) return null;                 // 管理者として発行された利用証ではない
  return payload;
}

// ── スタッフ表と管理者名簿の両方から本人を確定する ───────────────────────
//   管理者は「まだスタッフ表に loginEmail が入っていない」段階でも入れる必要がある
//   （最初の1人が入れないと、誰もメールを登録できず堂々巡りになるため）。
function authResolve_(prefix, email) {
  var staff = authFindStaffByEmail_(prefix, email);
  var adm = authAdminOf_(email);
  if (staff) { staff.admin = !!adm; return staff; }
  if (!adm) return null;
  // スタッフ表に登録が無い管理者は、名簿の uid から氏名を引く
  var byUid = adm.uid ? authFindStaffByUid_(prefix, adm.uid) : null;
  if (byUid) { byUid.admin = true; return byUid; }
  return { name: '管理者', myNumber: '', store: 'honten', uid: adm.uid || '', admin: true };
}

function authFindStaffByUid_(prefix, uid) {
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
      if (list[j] && String(list[j].uid) === String(uid)) {
        return { name: list[j].name, myNumber: list[j].myNumber,
                 store: list[j].store || stores[i], uid: list[j].uid || '' };
      }
    }
  }
  return null;
}

// ── 管理者名簿の閲覧・変更（管理者の利用証が要る）──────────────────────
//   GET ?action=authAdminList&prefix=...&apiKey=本来のキー|利用証
function authAdminList_(rawApiKey, prefix) {
  if (!authAdminGate_(rawApiKey, prefix)) {
    return makeResponse(JSON.stringify({ ok: false, err: 'not_admin' }));
  }
  var list = authAdmins_().map(function (a) {
    var st = a.uid ? authFindStaffByUid_(prefix, a.uid) : null;
    return { mail: a.mail, uid: a.uid, name: st ? st.name : '' };
  });
  return makeResponse(JSON.stringify({ ok: true, admins: list }));
}

//   GET ?action=authAdminSet&op=add|remove&email=...&uid=...&prefix=...&apiKey=...
function authAdminSet_(rawApiKey, prefix, op, email, uid) {
  var me = authAdminGate_(rawApiKey, prefix);
  if (!me) return makeResponse(JSON.stringify({ ok: false, err: 'not_admin' }));
  var mail = String(email || '').trim().toLowerCase();
  if (mail.indexOf('@') <= 0) return makeResponse(JSON.stringify({ ok: false, err: 'bad_email' }));
  var list = authAdmins_();
  if (op === 'add') {
    if (!list.some(function (a) { return a.mail === mail; })) {
      list.push({ mail: mail, uid: String(uid || '').trim() });
    }
  } else if (op === 'remove') {
    // 最後の1人は外せない。外すと誰も管理者コンソールを開けなくなる。
    if (list.length <= 1) return makeResponse(JSON.stringify({ ok: false, err: 'last_admin' }));
    list = list.filter(function (a) { return a.mail !== mail; });
  } else {
    return makeResponse(JSON.stringify({ ok: false, err: 'bad_op' }));
  }
  authAdminSave_(list);
  return makeResponse(JSON.stringify({ ok: true, count: list.length }));
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

    // スタッフ表の loginEmail か、管理者名簿にあるアドレスなら送る
    var staff = authResolve_(prefix, email);
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
      env + '【Hub a Nice Day】' + (staff.admin ? '管理者ログインの確認コード' : 'ログイン確認コード'),
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

// ── ①' 招待メール（管理者が押す）────────────────────────────────────
//   GET ?action=authInvite&email=...&prefix=...&apiKey=...
//
//   ログイン用メールを登録しただけでは、本人には何も起きない。手順を書いたメールを
//   送って初めて本人が動き出せる。これが無いと管理者が全員に口頭で伝える羽目になる。
//   コードはここでは送らない（コードは本人が端末で申し込んだ時に authRequest_ が送る）。
function authInvite_(email, prefix) {
  try {
    email = String(email || '').trim().toLowerCase();
    if (email.indexOf('@') <= 0) return makeResponse(JSON.stringify({ ok: false, err: 'bad_email' }));
    if (SNAP_ENV_PREFIXES.indexOf(String(prefix || '')) < 0) {
      return makeResponse(JSON.stringify({ ok: false, err: 'bad_prefix' }));
    }
    // スタッフ表に登録済みのアドレスにしか送らない。
    // 管理者が部外者のアドレスを入れても、招待は飛ばない。
    var staff = authFindStaffByEmail_(prefix, email);
    if (!staff) return makeResponse(JSON.stringify({ ok: false, err: 'not_registered' }));

    var cache = CacheService.getScriptCache();
    var cntKey = 'authinv:' + email;
    var cnt = Number(cache.get(cntKey) || 0);
    if (cnt >= AUTH_MAX_SEND_PER_HR) return makeResponse(JSON.stringify({ ok: false, err: 'too_many' }));
    cache.put(cntKey, String(cnt + 1), 3600);

    var env = (String(prefix).indexOf('dev') >= 0) ? '【DEV】' : '';
    var url = AUTH_APP_URL[String(prefix)] || AUTH_APP_URL['hub-v8-'];
    MailApp.sendEmail(
      email,
      env + '【Hub a Nice Day】ログインの登録をお願いします',
      staff.name + ' さん\n\n' +
      'Hub a Nice Day のログイン用アドレスとして、\n' +
      'このアドレス（' + email + '）が登録されました。\n\n' +
      '▼ 使いはじめる手順\n' +
      '1. 使いたい端末で Hub を開く\n' +
      '   ' + url + '\n' +
      '2.「＋ スタッフを追加」を押す\n' +
      '3. このアドレスを入れると、6桁のコードが届きます\n' +
      '4. コードを入れれば完了です\n\n' +
      '※ 自分のスマホと店の共有PC、両方で登録できます。\n' +
      '   端末ごとに1回ずつお願いします。\n' +
      '※ 使っているうちは登録が切れることはありません。\n' +
      '   3か月まったく開かなかった端末だけ、登録し直しになります。\n\n' +
      '心当たりが無い場合は、このメールを破棄してください。\n\n' +
      '--\nHub a Nice Day 自動送信（返信不要）'
    );
    return makeResponse(JSON.stringify({ ok: true, name: staff.name }));
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

    var staff = authResolve_(prefix, email);
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
        n: staff.name, m: staff.myNumber, s: staff.store, e: email,
        at: Date.now(), exp: exp, ua: String(ua || '').slice(0, 120)
      };
      authSaveDevices_(prefix, devices);
    } finally { if (locked) lock.releaseLock(); }

    return makeResponse(JSON.stringify({
      ok: true,
      token: authMakeToken_(staff.name, staff.myNumber, staff.store, jti, staff.admin),
      name: staff.name, myNumber: staff.myNumber, store: staff.store,
      uid: staff.uid || '', exp: exp, admin: !!staff.admin
    }));
  } catch (err) {
    return makeResponse(JSON.stringify({ ok: false, err: 'verify_failed' }));
  }
}

// ── ③ 利用証の延長（スライド式の有効期限）──────────────────────────────
//   GET ?action=authRenew&prefix=hub-v8-dev-&apiKey=本来のキー|利用証
//
//   期限を「発行から90日」ではなく「最後に使った日から90日」にするための入口。
//   フロントがアプリ起動時に呼ぶ。狙いは次の2つ:
//     ・毎日使う人を期限切れに一度も遭わせない（忙しい時に締め出されるのを防ぐ）
//     ・3か月まったく開かれなかった端末（買い替えたPC・機種変前のスマホ・
//       退職者の端末）だけを自然に失効させる ＝ 忘れられた端末の掃除
//   紛失・退職への即時の対処は、これではなく管理者の「取り消し」が担う。
//
//   毎回シートに書くとGASが重くなるので、前回の延長から AUTH_RENEW_AFTER_DAYS
//   日たっていなければ何も書かずに帰る（renewed:false）。
function authRenew_(rawApiKey, prefix) {
  try {
    var token = '';
    var i = String(rawApiKey || '').indexOf('|');
    if (i >= 0) token = String(rawApiKey).slice(i + 1);

    // 署名・期限を検査。切れていたら延長できない（本人確認からやり直し）。
    var payload = authReadToken_(token);
    if (!payload) return makeResponse(JSON.stringify({ ok: false, err: 'expired' }));
    if (!authValid_(payload, prefix)) return makeResponse(JSON.stringify({ ok: false, err: 'revoked' }));

    // まだ十分に残っているなら、シートに触らずに帰る
    var keep = (AUTH_TTL_DAYS - AUTH_RENEW_AFTER_DAYS) * 86400000;
    if (payload.x - Date.now() > keep) {
      return makeResponse(JSON.stringify({ ok: true, renewed: false, exp: payload.x }));
    }

    var exp = Date.now() + AUTH_TTL_DAYS * 86400000;
    var lock = LockService.getScriptLock();
    var locked = false;
    try { lock.waitLock(25000); locked = true; }
    catch (le) { return makeResponse(JSON.stringify({ ok: false, err: 'busy' })); }
    try {
      var devices = authLoadDevices_(prefix);
      var d = devices[payload.j];
      if (!d) return makeResponse(JSON.stringify({ ok: false, err: 'revoked' }));
      d.exp  = exp;
      d.last = Date.now();   // 管理者が「最後に使った日」を見られるようにする
      authSaveDevices_(prefix, devices);
    } finally { if (locked) lock.releaseLock(); }

    // 管理者かどうかは毎回名簿を見て決め直す。名簿から外れた人は、次の延長で管理者でなくなる。
    var stillAdmin = false;
    try {
      var mail = (d && d.e) ? d.e : '';
      stillAdmin = mail ? !!authAdminOf_(mail) : !!payload.a;
    } catch (e) { stillAdmin = !!payload.a; }
    return makeResponse(JSON.stringify({
      ok: true, renewed: true, exp: exp, admin: stillAdmin,
      token: authMakeToken_(payload.n, payload.m, payload.s, payload.j, stillAdmin)
    }));
  } catch (err) {
    return makeResponse(JSON.stringify({ ok: false, err: 'renew_failed' }));
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
