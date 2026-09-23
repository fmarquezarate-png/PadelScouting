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
    return authFetch('signup', { email: email, password: password })
      .then(function (data) {
        /* Si el proyecto pide confirmar por email no llega token todavía. */
        if (data && data.access_token) writeSession(data);
        return data;
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
    signIn: signIn, signUp: signUp, signOut: signOut,
    token: token, user: user, session: readSession
  };
})(window);
