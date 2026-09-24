/* ============================================================
   auth.js · sesión con Supabase
   Leer la liga no pide nada. Escribir (cargar un mes, guardar
   scouting) exige sesión: así el enlace se puede enseñar a quien
   sea sin que nadie pueda tocar los datos.
   ============================================================ */
(function (global) {
  'use strict';

  var CFG = global.PadelDB.CFG;
  var KEY = 'padel-scouting.session.v1';

  function readSession() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.access_token) return null;
      return s;
    } catch (e) { return null; }
  }

  function writeSession(s) {
    try {
      if (s) global.localStorage.setItem(KEY, JSON.stringify(s));
      else global.localStorage.removeItem(KEY);
    } catch (e) { /* navegación privada */ }
  }

  function expired(s) {
    if (!s || !s.expires_at) return false;
    return (s.expires_at * 1000) - Date.now() < 60000;   // margen de un minuto
  }

  /* Adónde vuelve el enlace del correo: a esta misma web (no a «localhost»). */
  function homeUrl() {
    var l = global.location;
    return l.origin + l.pathname.replace(/index\.html$/, '');
  }

  function authFetch(path, body) {
    return global.fetch(CFG.url + '/auth/v1/' + path, {
      method: 'POST',
      headers: { 'apikey': CFG.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var e = new Error(friendly(data, res.status));
          e.data = data;
          throw e;
        }
        return data;
      });
    });
  }

  /* Mensajes en castellano: los de Supabase vienen en inglés y técnicos. */
  function friendly(data, status) {
    var msg = (data && (data.msg || data.error_description || data.message || data.error)) || '';
    var m = String(msg).toLowerCase();
    if (m.indexOf('invalid login') >= 0) return 'Email o contraseña incorrectos.';
    if (m.indexOf('email not confirmed') >= 0) return 'Confirma el email antes de entrar. Revisa tu bandeja.';
    if (m.indexOf('already registered') >= 0) return 'Ese email ya tiene cuenta. Entra en vez de crearla.';
    if (m.indexOf('password') >= 0 && m.indexOf('6') >= 0) return 'La contraseña necesita al menos 6 caracteres.';
    if (m.indexOf('signups not allowed') >= 0 || m.indexOf('signup is disabled') >= 0) {
      return 'El registro está desactivado en el proyecto. Créate la cuenta desde el panel de Supabase.';
    }
    if (status === 429) return 'Demasiados intentos seguidos. Espera un minuto.';
    return msg || 'No he podido completar la operación.';
  }

  function signIn(email, password) {
    return authFetch('token?grant_type=password', { email: email, password: password })
      .then(function (data) { writeSession(data); return data; });
  }

  function signUp(email, password) {
    return authFetch('signup?redirect_to=' + encodeURIComponent(homeUrl()), { email: email, password: password })
      .then(function (data) {
        /* Si el proyecto pide confirmar por email no llega token todavía. */
        if (data && data.access_token) writeSession(data);
        return data;
      });
  }

  /* Volver a mandar el correo de confirmación (si caducó o no llegó). */
  function resend(email) {
    return authFetch('resend?redirect_to=' + encodeURIComponent(homeUrl()), { type: 'signup', email: email });
  }

  /* Vuelta desde el correo. Supabase deja la sesión (o el error) en el #
     de la dirección: #access_token=…&refresh_token=…&type=signup
     o #error=access_denied&error_code=otp_expired&error_description=…
     Devuelve { ok, type } o { error, code } o null si no venía de un correo. */
  function consumeRedirect() {
    var h = String(global.location.hash || '').replace(/^#/, '');
    var q = String(global.location.search || '').replace(/^\?/, '');
    var all = h + '&' + q;
    if (!/(access_token|error_code|error_description)=/.test(all)) return Promise.resolve(null);
    var p = {};
    all.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    });
    /* La dirección se limpia ya: que un recargar no repita nada. */
    try { global.history.replaceState(null, '', global.location.pathname); } catch (e) {}
    if (!p.access_token) {
      return Promise.resolve({ error: p.error_description || p.error || 'El enlace no es válido.', code: p.error_code || p.error || '' });
    }
    var sess = { access_token: p.access_token, refresh_token: p.refresh_token, token_type: p.token_type || 'bearer',
      expires_in: +p.expires_in || 3600,
      expires_at: +p.expires_at || Math.floor(Date.now() / 1000) + (+p.expires_in || 3600) };
    return global.fetch(CFG.url + '/auth/v1/user', {
      headers: { 'apikey': CFG.key, 'Authorization': 'Bearer ' + p.access_token }
    }).then(function (res) { return res.ok ? res.json() : null; }).catch(function () { return null; })
      .then(function (u) {
        sess.user = u || { email: '' };
        writeSession(sess);
        return { ok: true, type: p.type || 'signup', email: sess.user.email || '' };
      });
  }

  function refresh() {
    var s = readSession();
    if (!s || !s.refresh_token) return Promise.resolve(null);
    return authFetch('token?grant_type=refresh_token', { refresh_token: s.refresh_token })
      .then(function (data) { writeSession(data); return data; })
      .catch(function () { writeSession(null); return null; });
  }

  function signOut() {
    var s = readSession();
    writeSession(null);
    if (!s) return Promise.resolve();
    return global.fetch(CFG.url + '/auth/v1/logout', {
      method: 'POST',
      headers: { 'apikey': CFG.key, 'Authorization': 'Bearer ' + s.access_token }
    }).catch(function () { /* da igual: la sesión local ya no está */ });
  }

  /* Devuelve un token válido, renovándolo si toca. null si no hay sesión. */
  function token() {
    var s = readSession();
    if (!s) return Promise.resolve(null);
    if (!expired(s)) return Promise.resolve(s.access_token);
    return refresh().then(function (r) { return r ? r.access_token : null; });
  }

  function user() {
    var s = readSession();
    return s && s.user ? s.user : null;
  }

  global.PadelAuth = {
    signIn: signIn, signUp: signUp, signOut: signOut, resend: resend, consumeRedirect: consumeRedirect, homeUrl: homeUrl,
    token: token, user: user, session: readSession
  };
})(window);
