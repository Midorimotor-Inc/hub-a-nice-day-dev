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
var AUTH_CODE_TTL_SEC    = 86400; // 6桁コードの有効時間（24時間）
var AUTH_REPLAY_SEC      = 900;   // 確認成功の返事を覚えておく時間（15分）。返事が届かず同じコードでやり直した時に同じ利用証を返す
                                  //   現場は全員バラバラに動く。押してすぐ席を離れることも、
                                  //   Becky!の受信間隔でメールの到着が遅れることもある。
                                  //   総当たりは試行回数の上限(AUTH_MAX_TRY)で止める。
var AUTH_MAX_SEND_PER_HR = 5;     // 同じアドレスへの送信上限（メール枠の保護）
var AUTH_INVITE_TTL_DAYS = 30;
var AUTH_HANDOFF_SEC     = 1800;  // 引き継ぎリンク（?hand=）の有効時間（30分）    // 招待リンク（?inv=）が本人を指し続ける日数。6桁より長い＝切れても同じリンクから送り直せる

// メールの件名の頭。受け取った人が「何のメールか」「テスト版か本番か」を件名だけで分かるように。
//   DEV: みどりモーターススケジュールシステムテスト版【Hub a Nice Day /DEV】…
//   本番: みどりモータース スケジュールシステム【Hub a Nice Day】…   （ユーザー指示・2026-09-12）
function authMailHead_(prefix) {
  return (String(prefix || '').indexOf('dev') >= 0)
    ? 'みどりモーターススケジュールシステムテスト版【Hub a Nice Day /DEV】'
    : 'みどりモータース スケジュールシステム【Hub a Nice Day】';
}
var AUTH_APP_URL = {              // 招待メールに載せる各環境の入口
  'hub-v8-':     'https://midorimotor-inc.github.io/hub-a-nice-day/',
  'hub-v8-dev-': 'https://midorimotor-inc.github.io/hub-a-nice-day-dev/'
};
var AUTH_MAX_TRY         = 5;     // コード入力の試行上限

// 認証そのものに使うアクションは、当然ながら利用証を要求しない
var AUTH_OPEN_ACTIONS = ['authRequest', 'authVerify', 'authHandoffTake', 'caps', 'mailInvite'];   // mailInvite は v15（Firebase 認証の招待コードを送るだけ）   // 引き継ぎを受ける側はまだ利用証を持たない

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
//   本文: {n:氏名または端末名, m:ナンバー, s:店舗, j:端末ID, x:失効時刻,
//         a:管理者なら1, v:共有端末そのものなら1}
function authMakeToken_(name, myNumber, store, jti, isAdmin, isDevice) {
  var payload = JSON.stringify({
    n: String(name || ''), m: (myNumber == null ? '' : myNumber),
    s: String(store || ''), j: String(jti || ''),
    x: Date.now() + AUTH_TTL_DAYS * 86400000,
    a: isAdmin ? 1 : 0,
    v: isDevice ? 1 : 0
  });
  var p64 = Utilities.base64EncodeWebSafe(Utilities.newBlob(payload).getBytes());
  var sig = Utilities.computeHmacSha256Signature(p64, authSecret_());
  return p64 + '.' + Utilities.base64EncodeWebSafe(sig);
}

// 署名と期限だけを見る（端末の取り消し確認は authValid_ で行う）
//   ignoreExp: 期限切れでも中身を返す（「この端末の前の登録」を探すときだけ使う。署名は必ず確かめる）
function authReadToken_(token, ignoreExp) {
  try {
    if (!token) return null;
    var parts = String(token).split('.');
    if (parts.length !== 2) return null;
    var expect = Utilities.base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(parts[0], authSecret_()));
    if (expect !== parts[1]) return null;   // 署名が違う＝偽造・改ざん
    var payload = JSON.parse(
      Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    if (!payload || !payload.x) return null;
    if (!ignoreExp && Date.now() > payload.x) return null;  // 期限切れ
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

// ── 6桁コードの保管 ───────────────────────────────────────────────────
//   キャッシュは上限6時間なのでシートに置く。ただしシートの値はAPIキーがあれば
//   読めてしまうため、コードそのものは置かずHMACの値だけを置く。
//   （doGet 側でもこのキーは読めないようにしてある）
function authCodesKey_(prefix) { return String(prefix || '') + 'auth-codes'; }

function authCodeHash_(email, code) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(String(email) + '|' + String(code), authSecret_()));
}

function authLoadCodes_(prefix) {
  try {
    var raw = readOneValue(getSheet(), CacheService.getScriptCache(), authCodesKey_(prefix), -2);
    if (!raw || raw === 'null') return {};
    var o = JSON.parse(raw);
    return (o && typeof o === 'object' && !(o instanceof Array)) ? o : {};
  } catch (e) { return {}; }
}

function authSaveCodes_(prefix, map) {
  // 期限切れは毎回捨てる。放っておくと際限なく溜まる。
  var now = Date.now(), clean = {};
  for (var k in map) { if (map[k] && map[k].x > now) clean[k] = map[k]; }
  var key = authCodesKey_(prefix);
  writeRow(getSheet(), key, JSON.stringify(clean), new Date().toLocaleString('ja-JP'));
  invalidateCache(key);
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
//   ★判定は「いまの名簿」で行う。利用証に焼き込んだ印(a)だけを見ると、
//     利用証が作り直される15日後まで、外した人が開けたままになる。
//     台帳の e（認証に使ったアドレス）はGASだけが書く値なので、これと突き合わせる。
function authAdminGate_(rawApiKey, prefix) {
  var token = '';
  var i = String(rawApiKey || '').indexOf('|');
  if (i >= 0) token = String(rawApiKey).slice(i + 1);
  var payload = authReadToken_(token);
  if (!payload) return null;
  if (!authValid_(payload, prefix)) return null;
  var devices = authLoadDevices_(prefix);
  var d = devices[payload.j];
  if (!d || !d.e) return null;                 // 認証に使ったアドレスが分からない端末
  if (!authAdminOf_(d.e)) return null;         // いま名簿に載っていない
  return payload;
}

// ── 管理者の名前だけを返す（利用証は要らない）────────────────────────
//   GET ?action=authAdminNames&prefix=...
//   スケジュール画面が「この人は管理者か」を判定するために使う。
//   名前はスタッフ表で公開済みなので、どの名前が管理者かを知られても害は小さい。
//   メールアドレスは返さない（そちらは authAdminList_ で、管理者の利用証が要る）。
function authAdminNames_(prefix) {
  var out = [];
  authAdmins_().forEach(function (a) {
    var st = a.uid ? authFindStaffByUid_(prefix, a.uid) : null;
    if (st && st.name) out.push(st.name);
  });
  return makeResponse(JSON.stringify({ ok: true, names: out }));
}

// ── 管理者しか書けないキー ──────────────────────────────────────────
//   スタッフ表・休業日・今月の休日数・端末の台帳。
//   予約や代車、台数制限、各自の休日はここに入れない（一般スタッフも書く）。
var AUTH_ADMIN_ONLY_KEYS = [
  /-staff-v2$/,        // スタッフの追加・削除・番号・バッジ
  /-cdow$/, /-cdate$/, /override-open$/,   // 休業日
  /mholidays$/,        // 今月の休日数
  /auth-devnames$/, /auth-devices$/,       // 端末の名簿と台帳
];
function authIsAdminOnlyKey_(key) {
  var k = String(key || '');
  for (var i = 0; i < AUTH_ADMIN_ONLY_KEYS.length; i++) if (AUTH_ADMIN_ONLY_KEYS[i].test(k)) return true;
  return false;
}

// 書き込みの門番。管理者しか書けないキーへの書き込みは、管理者の利用証が無ければ断る。
//   利用証を持たない要求（移行期間の未登録端末）は、これまでどおり通す。
//   ＝登録済みの端末からは守られ、本番の移行期間を壊さない。
//   利用証そのものを必須にするのは authGate_（HUB_AUTH_ENFORCE）の役目。
function authWriteGate_(rawApiKey, key, prefix) {
  if (!authIsAdminOnlyKey_(key)) return null;
  var i = String(rawApiKey || '').indexOf('|');
  if (i < 0) return null;                      // 利用証なし＝移行期間。通す
  if (authAdminGate_(rawApiKey, prefix)) return null;
  return makeResponse('unauthorized: admin');
}

// ── スタッフ表と管理者名簿の両方から本人を確定する ───────────────────────
//   管理者は「まだスタッフ表に loginEmail が入っていない」段階でも入れる必要がある
//   （最初の1人が入れないと、誰もメールを登録できず堂々巡りになるため）。
// ── 共有端末の名簿（管理者が名前とメールを登録する）───────────────────
//   <prefix>auth-devnames に [{name, store, mail}] で入っている。
//   人と同じくメールで認証するので、ここも突き合わせの対象になる。
function authFindDeviceByEmail_(prefix, email) {
  var m = String(email || '').trim().toLowerCase();
  if (!m) return null;
  try {
    var raw = readOneValue(getSheet(), CacheService.getScriptCache(),
                           String(prefix) + 'auth-devnames', -2);
    if (!raw || raw === 'null') return null;
    var list = JSON.parse(raw);
    if (!(list instanceof Array)) return null;
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (d && d.mail && String(d.mail).trim().toLowerCase() === m) return d;
    }
  } catch (e) {}
  return null;
}

function authResolve_(prefix, email) {
  var staff = authFindStaffByEmail_(prefix, email);
  var adm = authAdminOf_(email);
  if (staff) { staff.admin = !!adm; return staff; }
  // 共有端末のアドレス。人ではないので氏名は持たず、端末の名前を名乗る。
  var dev = authFindDeviceByEmail_(prefix, email);
  if (dev) {
    return { name: String(dev.name || '共有端末'), myNumber: '', uid: '',
             store: dev.store || 'honten', admin: false,
             device: true, label: String(dev.name || '共有端末') };
  }
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
// いま生きているコードがあるか（招待に書いた6桁を無駄にしないため）
function authCodeAlive_(prefix, email) {
  try {
    var c = authLoadCodes_(prefix)[email];
    return !!(c && c.x && Date.now() < c.x);
  } catch (e) { return false; }
}

// 新しい6桁を作って保管する。
//   inv を渡すと、招待リンクの印（?inv=…）→ アドレスの対応も同じ保管場所に入れる。
//   キーは 'inv:' で始めてアドレスと区別する（アドレスに ':' は含まれない）。
function authIssueCode_(prefix, email, inv) {
  var code = String(Math.floor(100000 + Math.random() * 900000));
  var codes = authLoadCodes_(prefix);
  codes[email] = { h: authCodeHash_(email, code), t: 0, x: Date.now() + AUTH_CODE_TTL_SEC * 1000 };
  if (inv) codes['inv:' + inv] = { e: email, x: Date.now() + AUTH_INVITE_TTL_DAYS * 86400000 };
  authSaveCodes_(prefix, codes);
  return code;
}

// ── 招待リンクの印 ─────────────────────────────────────────────────
//   招待メールのURLに ?inv=印 を付ける。受け取った人はリンクを開くだけで
//   「誰の登録か」が伝わり、アドレスを打たずに6桁の入力から始められる
//   （アドレスを打つ段があると「もう一度メール確認？」と戸惑う。ユーザー指摘 2026-09-15）。
//   印は推測できない長さの乱数で、メールを受け取った本人しか知らない。
//   印から分かるのはアドレスだけで、6桁が無ければ登録はできない。
function authNewInviteId_() {
  return String(Utilities.getUuid()).replace(/-/g, '');
}
// 印 → アドレス。無い・期限切れなら ''
function authInviteEmail_(prefix, inv) {
  try {
    var v = String(inv || '').trim();
    if (!/^[0-9a-f]{32}$/.test(v)) return '';
    var c = authLoadCodes_(prefix)['inv:' + v];
    return (c && c.e && c.x && Date.now() < c.x) ? String(c.e) : '';
  } catch (e) { return ''; }
}
// アドレスが無く印だけ来た要求を、アドレスに直す。印が無効なら null
function authEmailOrInvite_(prefix, email, inv) {
  var m = String(email || '').trim().toLowerCase();
  if (m) return m;
  if (!inv) return '';
  var byInv = authInviteEmail_(prefix, inv);
  return byInv ? byInv : null;
}

//   GET ?action=authRequest&email=...&resend=1&prefix=...
//   resend が無いときは、生きているコードがあれば送り直さない
//   （招待メールに書いた6桁をそのまま使ってもらう）。
function authRequest_(email, prefix, resend, inv) {
  try {
    if (SNAP_ENV_PREFIXES.indexOf(String(prefix || '')) < 0) {
      return makeResponse(JSON.stringify({ ok: false, err: 'bad_prefix' }));
    }
    email = authEmailOrInvite_(prefix, email, inv);
    if (email === null) return makeResponse(JSON.stringify({ ok: false, err: 'bad_invite' }));
    if (email.indexOf('@') <= 0) return makeResponse(JSON.stringify({ ok: false, err: 'bad_email' }));

    // スタッフ表の loginEmail か、管理者名簿にあるアドレスなら送る
    var staff = authResolve_(prefix, email);
    if (!staff) return makeResponse(JSON.stringify({ ok: false, err: 'not_registered' }));

    // 招待メールに書いた6桁がまだ生きているなら、作り直さない。
    // 作り直すと、その6桁が使えなくなってしまう。
    if (!resend && authCodeAlive_(prefix, email)) {
      return makeResponse(JSON.stringify({ ok: true, existing: true }));
    }

    var cache = CacheService.getScriptCache();
    // 送りすぎ防止（メール枠は1日100通）
    var cntKey = 'authcnt:' + email;
    var cnt = Number(cache.get(cntKey) || 0);
    if (cnt >= AUTH_MAX_SEND_PER_HR) {
      return makeResponse(JSON.stringify({ ok: false, err: 'too_many' }));
    }
    cache.put(cntKey, String(cnt + 1), 3600);

    var code = authIssueCode_(prefix, email);

    MailApp.sendEmail(
      email,
      authMailHead_(prefix) + (staff.admin ? '管理者ログインの確認コード'
            : staff.device ? ('共有端末「' + staff.label + '」の確認コード') : 'ログイン確認コード'),
      staff.name + ' さん\n\n' +
      'ログイン画面に次の6桁を入力してください。\n\n' +
      '    ' + code + '\n\n' +
      'このコードは24時間有効です。\n' +
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
    // 登録済みのアドレスにしか送らない（スタッフ表、または共有端末の名簿）。
    // 管理者が部外者のアドレスを入れても、招待は飛ばない。
    var staff = authFindStaffByEmail_(prefix, email);
    var devv = staff ? null : authFindDeviceByEmail_(prefix, email);
    if (!staff && !devv) return makeResponse(JSON.stringify({ ok: false, err: 'not_registered' }));

    var cache = CacheService.getScriptCache();
    var cntKey = 'authinv:' + email;
    var cnt = Number(cache.get(cntKey) || 0);
    if (cnt >= AUTH_MAX_SEND_PER_HR) return makeResponse(JSON.stringify({ ok: false, err: 'too_many' }));
    cache.put(cntKey, String(cnt + 1), 3600);

    var url = AUTH_APP_URL[String(prefix)] || AUTH_APP_URL['hub-v8-'];
    // メールは1通で済ませる。招待に6桁を入れておき、受け取った端末で
    // そのまま入力できるようにする（2通に分けると必ず取り違える）。
    // リンクには印を付ける。開くだけで誰の登録か伝わり、アドレスを打つ段を飛ばせる。
    var inv = authNewInviteId_();
    var link = url + '?inv=' + inv;
    var code = authIssueCode_(prefix, email, inv);

    // 共有端末あての招待。人ではないので文面を分ける。
    if (devv) {
      MailApp.sendEmail(
        email,
        authMailHead_(prefix) + '共有端末「' + devv.name + '」の登録のご案内',
        '共有端末「' + devv.name + '」の登録手順です。\n\n' +
        'この端末の前で、次のとおり操作してください。\n\n' +
        '▼ 確認コード（24時間有効）\n' +
        '    ' + code + '\n\n' +
        '▼ 手順\n' +
        '1. その端末で、このリンクを開く\n' +
        '   ' + link + '\n' +
        '2. 上の6桁を入れる\n\n' +
        '※ リンクをその端末で開けない時は、' + url + ' を開いて\n' +
        '  「＋ スタッフを追加」→ このアドレス（' + email + '）→ 上の6桁 の順で入れてください。\n\n' +
        '登録が済むと、その端末では担当者を選ぶだけで使えるようになります。\n' +
        '※ 登録は端末ごとに1回だけです。\n' +
        '※ この登録はその端末を使う全員で共有します。個人のスマホには使わないでください。\n\n' +
        '心当たりが無い場合は、このメールを破棄してください。\n\n' +
        '--\nHub a Nice Day 自動送信（返信不要）'
      );
      return makeResponse(JSON.stringify({ ok: true, name: devv.name, device: true }));
    }

    MailApp.sendEmail(
      email,
      authMailHead_(prefix) + 'ログインの登録をお願いします',
      staff.name + ' さん\n\n' +
      'Hub a Nice Day のログイン用アドレスとして、\n' +
      'このアドレス（' + email + '）が登録されました。\n\n' +
      '▼ 確認コード（24時間有効）\n' +
      '    ' + code + '\n\n' +
      '▼ 使いはじめる手順\n' +
      '1. 使いたい端末で、このリンクを開く\n' +
      '   ' + link + '\n' +
      '2. 上の6桁を入れれば完了です\n\n' +
      '※ リンクをその端末で開けない時（店のPCなど）は、' + url + ' を開いて\n' +
      '  「＋ スタッフを追加」→ このアドレス → 上の6桁 の順で入れてください。\n' +
      '※ スマホは、LINEやメールの中で開いた場合、先に「Safariで開く」（Androidは「ブラウザで開く」）を\n' +
      '  選んでから登録してください。登録が終わった画面の案内で「ホーム画面に追加」できます。\n' +
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

// ── v15（2026-09-18）：招待コードのメール ───────────────────────────────
//   本人認証は Firebase に移った。コードの発行と照合は画面（Firestore の invites）が行い、
//   GAS はメールを送るだけ。送る先はスタッフ表か共有端末の名簿にあるアドレスに限る（部外者に飛ばさない）。
//   GET ?action=mailInvite&email=...&code=123456&prefix=hub-v8-dev-&apiKey=...
function mailInvite_(email, code, prefix) {
  try {
    email = String(email || '').trim().toLowerCase();
    code = String(code || '').replace(/[^0-9]/g, '');
    if (email.indexOf('@') <= 0) return makeResponse(JSON.stringify({ ok: false, err: 'bad_email' }));
    if (code.length !== 6) return makeResponse(JSON.stringify({ ok: false, err: 'bad_code' }));
    if (SNAP_ENV_PREFIXES.indexOf(String(prefix || '')) < 0) return makeResponse(JSON.stringify({ ok: false, err: 'bad_prefix' }));
    var staff = authFindStaffByEmail_(prefix, email);
    var devv = staff ? null : authFindDeviceByEmail_(prefix, email);
    if (!staff && !devv) return makeResponse(JSON.stringify({ ok: false, err: 'not_registered' }));
    var cache = CacheService.getScriptCache();
    var cntKey = 'authinv:' + email;
    var cnt = Number(cache.get(cntKey) || 0);
    if (cnt >= AUTH_MAX_SEND_PER_HR) return makeResponse(JSON.stringify({ ok: false, err: 'too_many' }));
    cache.put(cntKey, String(cnt + 1), 3600);
    var url = AUTH_APP_URL[String(prefix)] || AUTH_APP_URL['hub-v8-'];
    var link = url + '?e=' + encodeURIComponent(email);
    if (devv) {
      MailApp.sendEmail(email, authMailHead_(prefix) + '共有端末「' + devv.name + '」の登録のご案内',
        '共有端末「' + devv.name + '」の登録手順です。\n\n' +
        '▼ 招待コード（30日有効）\n    ' + code + '\n\n' +
        '▼ 手順（その端末の前で）\n' +
        '1. ' + link + ' を開く\n' +
        '2. このアドレス（' + email + '）と上の6桁を入れて「登録する」\n\n' +
        '登録が済むと、その端末では担当者を選ぶだけで使えます。登録は端末ごとに1回だけです。\n' +
        '※ この登録はその端末を使う全員で共有します。個人のスマホには使わないでください。\n\n' +
        '心当たりが無い場合は、このメールを破棄してください。\n\n--\nHub a Nice Day 自動送信（返信不要）');
      return makeResponse(JSON.stringify({ ok: true, name: devv.name, device: true }));
    }
    MailApp.sendEmail(email, authMailHead_(prefix) + 'ログインの登録をお願いします',
      staff.name + ' さん\n\n' +
      'Hub a Nice Day のログイン用アドレスとして、このアドレス（' + email + '）が登録されました。\n\n' +
      '▼ 招待コード（30日有効）\n    ' + code + '\n\n' +
      '▼ 使いはじめる手順\n' +
      '1. 使いたい端末で ' + link + ' を開く\n' +
      '2. このアドレスと上の6桁を入れて「登録する」で完了です\n\n' +
      '※ スマホは、LINEやメールの中で開いた場合、先に「Safariで開く」（Androidは「ブラウザで開く」）を\n' +
      '  選んでから登録してください。登録が終わった画面の案内で「ホーム画面に追加」できます。\n' +
      '※ 自分のスマホと店の共有PC、両方で登録できます（同じコードで）。端末ごとに1回ずつお願いします。\n' +
      '※ 一度登録した端末は、開くだけで使えます。期限はありません。\n\n' +
      '心当たりが無い場合は、このメールを破棄してください。\n\n--\nHub a Nice Day 自動送信（返信不要）');
    return makeResponse(JSON.stringify({ ok: true, name: staff.name }));
  } catch (err) {
    return makeResponse(JSON.stringify({ ok: false, err: 'send_failed' }));
  }
}

// ── 端末を台帳に登録して利用証を作る ──────────────────────────────────
//   台帳はシートへの書き込みなので、他の保存と同じく25秒ロックで直列化する
//   （同時に複数人が認証しても台帳が壊れないようにする）。ロックが取れなければ null。
function authRegisterDevice_(prefix, staff, email, ua, prev) {
  var jti = Utilities.getUuid();
  var exp = Date.now() + AUTH_TTL_DAYS * 86400000;
  var lock = LockService.getScriptLock();
  var locked = false;
  try { lock.waitLock(25000); locked = true; }
  catch (le) { return null; }
  try {
    var devices = authLoadDevices_(prefix);
    // この端末の前の登録（同じ人のものだけ）を消して置き換える。
    // 他人の行は、その利用証をこの端末が持っていても消さない（共有PCで別人を登録した場合）。
    String(prev || '').split(',').slice(0, 12).forEach(function (tk) {
      var old = authReadToken_(String(tk).trim(), true);
      if (!old || !old.j || old.j === jti) return;
      var row = devices[old.j];
      if (row && String(row.e || '').toLowerCase() === String(email).toLowerCase()) delete devices[old.j];
    });
    devices[jti] = {
      n: staff.name, m: staff.myNumber, s: staff.store, e: email,
      at: Date.now(), exp: exp, ua: String(ua || '').slice(0, 120)
    };
    if (staff.device) {   // 共有端末そのものの登録
      devices[jti].dev = 1;
      devices[jti].k = 'shared';
      devices[jti].l = staff.label;
    }
    authSaveDevices_(prefix, devices);
  } finally { if (locked) lock.releaseLock(); }
  return { token: authMakeToken_(staff.name, staff.myNumber, staff.store, jti, staff.admin, staff.device), exp: exp, jti: jti };
}

// ── ② コードの照合と利用証の発行 ─────────────────────────────────────
//   GET ?action=authVerify&email=...&code=123456&prefix=...&ua=...&apiKey=...
//   prev: この端末がすでに持っている利用証（カンマ区切り・期限切れでも可）。
//         同じ人の前の登録を置き換える＝同じPCで登録し直しても台帳に行が増えない。
//         管理者コンソールでログインするたびに行が増え、スケジュール画面の登録と
//         二重になっていた（2026-09-15 江川が2行になった件）。
//   envs: 'all' を付けると、管理者に限り 本番とDEVの両方の台帳に登録し、両方の利用証を返す（tokens: {prefix: token}）。
//         管理者コンソールは1つのページで本番とDEVを切り替えるので、片方でログインすれば両方に入れるようにする
//         （切り替えるたびにメール→6桁を求められて面倒、というユーザー指摘 2026-09-16）。
//         一般スタッフには効かない（環境ごとの登録は今までどおり）。
function authVerify_(email, code, prefix, ua, inv, prev, envs) {
  try {
    code = String(code || '').trim();
    if (SNAP_ENV_PREFIXES.indexOf(String(prefix || '')) < 0) {
      return makeResponse(JSON.stringify({ ok: false, err: 'bad_prefix' }));
    }
    // 招待リンクから来た（アドレス無し・印だけ）なら、印からアドレスを引く
    email = authEmailOrInvite_(prefix, email, inv);
    if (email === null) return makeResponse(JSON.stringify({ ok: false, err: 'bad_invite' }));
    // ★成功した返事の控え。混雑で返事（利用証）が届かないことがあり（2026-09-12に実測・竹林さん）、
    //   その直後に同じコードでやり直すと、コードは消えているので「期限切れ」と言われていた。
    //   しかも端末は登録済みなので、管理者コンソールでは「登録完了」に見える。
    //   同じ人が同じコードで15分以内に来たら、同じ返事（同じ利用証）を返す。登録は二重にしない。
    var replayKey = 'authok:' + String(prefix) + ':' + authCodeHash_(email, code);
    var cache = CacheService.getScriptCache();
    var codes = authLoadCodes_(prefix);
    var rec = codes[email];
    if (!rec || !rec.x || rec.x <= Date.now()) {
      var replay = null;
      try { replay = cache.get(replayKey); } catch (ce) {}
      if (replay) return makeResponse(replay);
      return makeResponse(JSON.stringify({ ok: false, err: 'expired' }));
    }
    var tries = Number(rec.t || 0);
    if (tries >= AUTH_MAX_TRY) {
      delete codes[email]; authSaveCodes_(prefix, codes);
      return makeResponse(JSON.stringify({ ok: false, err: 'too_many_tries' }));
    }
    if (authCodeHash_(email, code) !== rec.h) {
      rec.t = tries + 1; codes[email] = rec; authSaveCodes_(prefix, codes);
      return makeResponse(JSON.stringify({ ok: false, err: 'bad_code' }));
    }
    delete codes[email]; authSaveCodes_(prefix, codes);

    var staff = authResolve_(prefix, email);
    if (!staff) return makeResponse(JSON.stringify({ ok: false, err: 'not_registered' }));

    // 端末を台帳に登録して利用証を発行。
    var reg = authRegisterDevice_(prefix, staff, email, ua, prev);
    if (!reg) return makeResponse(JSON.stringify({ ok: false, err: 'busy' }));

    // 管理者コンソール向け：もう一方の環境（本番⇄DEV）にも登録し、その利用証も返す。
    // 管理者だけ。環境ごとに別の行ができる（取り消しも環境ごと）。
    var tokens = {}; tokens[String(prefix)] = reg.token;
    if (String(envs || '') === 'all' && staff.admin && !staff.device) {
      for (var pi = 0; pi < SNAP_ENV_PREFIXES.length; pi++) {
        var p2 = SNAP_ENV_PREFIXES[pi];
        if (p2 === String(prefix)) continue;
        var st2 = authResolve_(p2, email);          // その環境のスタッフ表で本人を確定（uidや店が違うことがある）
        if (!st2 || !st2.admin) continue;
        var reg2 = authRegisterDevice_(p2, st2, email, ua, prev);
        if (reg2) tokens[p2] = reg2.token;
      }
    }

    var out = JSON.stringify({
      ok: true,
      token: reg.token, tokens: tokens,
      name: staff.name, myNumber: staff.myNumber, store: staff.store,
      uid: staff.uid || '', exp: reg.exp, admin: !!staff.admin,
      device: !!staff.device, label: staff.label || ''
    });
    try { cache.put(replayKey, out, AUTH_REPLAY_SEC); } catch (ce) {}
    return makeResponse(out);
  } catch (err) {
    return makeResponse(JSON.stringify({ ok: false, err: 'verify_failed' }));
  }
}

// ── 端末の種類と名前を記録する ────────────────────────────────────────
//   GET ?action=authLabel&kind=own|shared&label=共有PC1&prefix=...&apiKey=キー|利用証
//   管理者の端末一覧を読めるようにするためのもの。名前が無いと
//   ブラウザの長い文字列しか出ず、どのPCか分からない。
//   自分の利用証が指す端末しか変えられない（他人の端末には触れない）。
function authLabel_(rawApiKey, prefix, kind, label) {
  try {
    var token = '';
    var i = String(rawApiKey || '').indexOf('|');
    if (i >= 0) token = String(rawApiKey).slice(i + 1);
    var payload = authReadToken_(token);
    if (!payload) return makeResponse(JSON.stringify({ ok: false, err: 'expired' }));
    if (!authValid_(payload, prefix)) return makeResponse(JSON.stringify({ ok: false, err: 'revoked' }));

    var k = (String(kind || '') === 'own') ? 'own' : 'shared';
    var l = String(label || '').trim().slice(0, 40);

    var lock = LockService.getScriptLock();
    var locked = false;
    try { lock.waitLock(25000); locked = true; }
    catch (le) { return makeResponse(JSON.stringify({ ok: false, err: 'busy' })); }
    try {
      var devices = authLoadDevices_(prefix);
      var d = devices[payload.j];
      if (!d) return makeResponse(JSON.stringify({ ok: false, err: 'revoked' }));
      d.k = k;
      if (l) d.l = l;
      // 同じ端末に登録済みの他の人の分も、種類と名前を揃える。
      // 端末の性質は人ではなく端末に付くので、行ごとに食い違うと点検できない。
      for (var j in devices) {
        var o = devices[j];
        if (!o || j === payload.j) continue;
        if (l && o.l === l) { o.k = k; }
      }
      authSaveDevices_(prefix, devices);
    } finally { if (locked) lock.releaseLock(); }
    return makeResponse(JSON.stringify({ ok: true, kind: k, label: l }));
  } catch (err) {
    return makeResponse(JSON.stringify({ ok: false, err: 'label_failed' }));
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
// ── 登録の引き継ぎ（同じ端末の別のブラウザ／ホーム画面のアイコンへ）──────────
//   iPhoneでは Safari・LINEの中のブラウザ・ホーム画面に追加したアイコン が、それぞれ別の保管場所を持つ。
//   Safariで登録してもアイコンから開くと「未登録」になり、もう一度メール→6桁をやらされていた
//   （2026-09-16 竹林。1日で3回登録し、台帳に3行できた）。
//   そこで、登録済みのブラウザが「引き継ぎの印」を作り、URLに付ける（?hand=…）。
//   その印つきURLから開いた側は、印を出して同じ利用証を受け取る＝同じ端末の行を共有し、台帳に行は増えない。
//   印は30分で消える。使い回しは30分の間だけ（Safari→アイコン と2回使うことがあるので1回限りにしない）。
//   GET ?action=authHandoff&prefix=...&apiKey=キー|利用証   → { ok, hand }
function authHandoff_(rawApiKey, prefix) {
  try {
    var token = '';
    var i = String(rawApiKey || '').indexOf('|');
    if (i >= 0) token = String(rawApiKey).slice(i + 1);
    var payload = authReadToken_(token);
    if (!payload) return makeResponse(JSON.stringify({ ok: false, err: 'expired' }));
    if (!authValid_(payload, prefix)) return makeResponse(JSON.stringify({ ok: false, err: 'revoked' }));
    var hand = String(Utilities.getUuid()).replace(/-/g, '');
    CacheService.getScriptCache().put('authhand:' + String(prefix) + ':' + hand, token, AUTH_HANDOFF_SEC);
    return makeResponse(JSON.stringify({ ok: true, hand: hand, exp: Date.now() + AUTH_HANDOFF_SEC * 1000 }));
  } catch (err) {
    return makeResponse(JSON.stringify({ ok: false, err: 'handoff_failed' }));
  }
}
//   GET ?action=authHandoffTake&hand=...&prefix=...&apiKey=キー   → 利用証と本人の情報（authVerify と同じ形）
function authHandoffTake_(hand, prefix) {
  try {
    var h = String(hand || '').trim();
    if (!/^[0-9a-f]{32}$/.test(h)) return makeResponse(JSON.stringify({ ok: false, err: 'bad_hand' }));
    if (SNAP_ENV_PREFIXES.indexOf(String(prefix || '')) < 0) {
      return makeResponse(JSON.stringify({ ok: false, err: 'bad_prefix' }));
    }
    var token = CacheService.getScriptCache().get('authhand:' + String(prefix) + ':' + h);
    if (!token) return makeResponse(JSON.stringify({ ok: false, err: 'bad_hand' }));
    var payload = authReadToken_(token);
    if (!payload) return makeResponse(JSON.stringify({ ok: false, err: 'expired' }));
    var row = authLoadDevices_(prefix)[payload.j];
    if (!row) return makeResponse(JSON.stringify({ ok: false, err: 'revoked' }));
    var staff = row.e ? authResolve_(prefix, String(row.e)) : null;
    return makeResponse(JSON.stringify({
      ok: true, token: token,
      name: row.n, myNumber: row.m, store: row.s || 'honten',
      uid: (staff && staff.uid) || '', exp: payload.x,
      admin: !!payload.a, device: !!row.dev, label: row.l || '', kind: row.k || ''
    }));
  } catch (err) {
    return makeResponse(JSON.stringify({ ok: false, err: 'handoff_failed' }));
  }
}

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

    // 管理者かどうかは毎回名簿を見て決め直す（印は画面表示の手掛かりに使うだけ）。
    var stillAdmin = false;
    try {
      var mail = (d && d.e) ? d.e : '';
      stillAdmin = mail ? !!authAdminOf_(mail) : false;
    } catch (e) { stillAdmin = false; }
    return makeResponse(JSON.stringify({
      ok: true, renewed: true, exp: exp, admin: stillAdmin,
      token: authMakeToken_(payload.n, payload.m, payload.s, payload.j, stillAdmin, payload.v)
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
