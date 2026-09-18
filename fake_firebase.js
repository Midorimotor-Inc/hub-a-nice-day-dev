// 検査用の「にせの firebase」（compat API のうち、アプリが使う部分だけ）。本物には繋がない。
//   fb_mode_test.js / fb_auth_test.js がブラウザに差し込む。中身は localStorage に置くので、
//   ページを開き直しても（index → mobile → admin と移っても）同じ「サーバー」に見える。
//   window.__fakeFb で検査側から読み書きできる。
(function(){
  const LS_STORE = '__fakeFbStore', LS_USER = '__fakeFbUser';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const store = load(LS_STORE, {});           // { 'col/id': {fields} }
  const save = () => { try { localStorage.setItem(LS_STORE, JSON.stringify(store)); } catch (e) {} };
  const listeners = new Map();                // 'col/id' -> Set(fn)
  const stats = { writes: 0, txns: 0, reads: 0 };
  const key = (col, id) => col + '/' + id;
  const snapOf = (col, id) => ({ id, exists: key(col, id) in store, data: () => store[key(col, id)], metadata: { fromCache: false, hasPendingWrites: false } });
  const notify = (col, id) => (listeners.get(key(col, id)) || new Set()).forEach(fn => setTimeout(() => fn(snapOf(col, id)), 0));
  const deepMerge = (a, b) => { const o = Object.assign({}, a); for (const k in b) { const v = b[k]; if (v && v.__delete) delete o[k]; else if (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) o[k] = deepMerge(o[k], v); else o[k] = v; } return o; };
  const writeDoc = (col, id, d, opts) => {
    stats.writes++;
    const cur = store[key(col, id)];
    store[key(col, id)] = (opts && opts.merge && cur) ? deepMerge(cur, d) : deepMerge({}, d);
    save(); notify(col, id);
  };
  // 権限：許可簿に載っていない人の kv 読み書きは拒否（本物のルールの要点だけ真似る）
  const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  const allowedOf = () => (store['meta/allowed'] || {});
  const ekey = e => String(e || '').trim().toLowerCase().replace(/\./g, ',');
  const isAllowed = () => { const u = auth._user; if (!u) return false; const a = allowedOf()[ekey(u.email)]; return !!(a && a.active !== false); };
  const isAdmin = () => { const u = auth._user; if (!u) return false; const a = allowedOf()[ekey(u.email)]; return !!(a && a.active !== false && a.role === 'admin'); };
  const canRead = (col, id) => col === 'handoff' || (col === 'users') || (col === 'kv' && (id.indexOf('hub-v8-dev-') === 0 || isAllowed())) || (col !== 'kv' && isAllowed());
  const canWrite = (col, id) => (col === 'users') || (col === 'handoff' && isAllowed()) || (col === 'kv' && (id.indexOf('hub-v8-dev-') === 0 || isAllowed())) || (col === 'meta' && isAdmin()) || (col === 'devices' && isAllowed());
  const doc = (col, id) => ({
    id, __col: col, __id: id,
    get: async () => { stats.reads++; if (!canRead(col, id)) throw denied(); return snapOf(col, id); },
    set: async (d, opts) => { if (!canWrite(col, id)) throw denied(); writeDoc(col, id, d, opts); },
    delete: async () => { if (!(col === 'devices' ? isAdmin() : canWrite(col, id))) throw denied(); delete store[key(col, id)]; save(); notify(col, id); },
    onSnapshot: (opts, next, err) => {
      if (typeof opts === 'function') { err = next; next = opts; }
      if (!canRead(col, id)) { setTimeout(() => err && err(denied()), 0); return () => {}; }
      const s = listeners.get(key(col, id)) || new Set(); s.add(next); listeners.set(key(col, id), s);
      setTimeout(() => next(snapOf(col, id)), 0);
      return () => s.delete(next);
    },
  });
  const collection = col => ({
    doc: id => doc(col, id),
    where: (f, op, v) => ({ get: async () => { if (!isAllowed()) throw denied(); const rows = Object.keys(store).filter(k => k.indexOf(col + '/') === 0 && store[k] && store[k][f] === v).map(k => ({ id: k.slice(col.length + 1), data: () => store[k] })); return { forEach: fn => rows.forEach(fn), size: rows.length }; } }),
  });
  const db = {
    collection,
    runTransaction: async fn => {
      stats.txns++;
      const t = { get: async ref => { stats.reads++; if (!canRead(ref.__col, ref.__id)) throw denied(); return snapOf(ref.__col, ref.__id); },
                  set: (ref, d, opts) => { if (!canWrite(ref.__col, ref.__id)) throw denied(); writeDoc(ref.__col, ref.__id, d, opts); } };
      return fn(t);
    },
  };
  // ── Authentication ──
  const makeUser = u => u ? Object.assign({}, u, { updatePassword: async pw => { auth._user.pw = pw; try { localStorage.setItem(LS_USER, JSON.stringify(auth._user)); } catch (e) {} store['__pw/' + u.email] = { pw }; save(); } }) : null;
  const auth = {
    languageCode: '', _user: null, _listeners: [],
    get currentUser() { return this._user; },
    _set(u) { this._user = makeUser(u); try { if (u) localStorage.setItem(LS_USER, JSON.stringify(u)); else localStorage.removeItem(LS_USER); } catch (e) {} this._listeners.forEach(cb => { try { cb(this._user); } catch (e) {} }); },
    onAuthStateChanged(cb) { this._listeners.push(cb); setTimeout(() => cb(this._user), 30); return () => {}; },
    isSignInWithEmailLink: href => /[?&]oobCode=/.test(String(href)),
    sendSignInLinkToEmail: async (email, s) => { if (email.indexOf('@') < 1) throw Object.assign(new Error('bad'), { code: 'auth/invalid-email' }); const sent = load('__fakeFbSent', []); sent.push({ email, url: s.url }); try { localStorage.setItem('__fakeFbSent', JSON.stringify(sent)); } catch (e) {} },
    signInWithEmailLink: async (email, href) => {
      const code = new URL(href).searchParams.get('oobCode');
      if (code !== 'good') throw Object.assign(new Error('bad code'), { code: 'auth/invalid-action-code' });
      auth._set({ email, uid: 'uid_' + email.replace(/[^a-z0-9]/gi, '_') });
    },
    signInWithEmailAndPassword: async (email, pw) => {
      const rec = store['__pw/' + email];
      if (!rec || rec.pw !== pw) throw Object.assign(new Error('wrong'), { code: 'auth/wrong-password' });
      auth._set({ email, uid: 'uid_' + email.replace(/[^a-z0-9]/gi, '_') });
    },
    signOut: async () => { auth._set(null); },
  };
  auth._user = makeUser(load(LS_USER, null));
  window.__fakeFb = {
    set: (id, v, col) => writeDoc(col || 'kv', id, col && col !== 'kv' ? v : { v: JSON.stringify(v), u: Date.now() }),
    get: (id, col) => { const d = store[key(col || 'kv', id)]; if (!d) return null; return (col && col !== 'kv') ? d : JSON.parse(d.v); },
    del: (id, col) => { delete store[key(col || 'kv', id)]; save(); notify(col || 'kv', id); },
    docs: col => Object.keys(store).filter(k => k.indexOf(col + '/') === 0).map(k => ({ id: k.slice(col.length + 1), data: store[k] })),
    sent: () => load('__fakeFbSent', []),
    user: () => auth._user ? { email: auth._user.email, uid: auth._user.uid } : null,
    signInAs: email => auth._set({ email, uid: 'uid_' + email.replace(/[^a-z0-9]/gi, '_') }),
    stats: () => Object.assign({}, stats),
    reset: () => { try { localStorage.removeItem(LS_STORE); localStorage.removeItem(LS_USER); localStorage.removeItem('__fakeFbSent'); } catch (e) {} },
  };
  window.firebase = {
    apps: [], initializeApp() { this.apps.push({}); },
    firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 'ts', delete: () => ({ __delete: true }) } }),
    auth: () => auth,
  };
})();
