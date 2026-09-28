/* ============================================================
   avisos.js · activar los avisos en este aparato (web push)
   · Android y ordenador: directamente.
   · iPhone: solo con la app añadida a la pantalla de inicio (iOS 16.4+).
   La clave pública la da la base; la privada no sale nunca de allí.
   ============================================================ */
(function (global) {
  'use strict';

  var DB = function () { return global.PadelDB; };

  function supported() {
    return 'serviceWorker' in navigator && 'PushManager' in global && 'Notification' in global;
  }
  function isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent || ''); }
  function standalone() {
    return (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }
  /* En iPhone, fuera de la pantalla de inicio no hay avisos. */
  function needsInstall() { return isIOS() && !standalone(); }
  function permission() { return supported() ? Notification.permission : 'unsupported'; }

  function b64ToBytes(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function registration() {
    return navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; });
  }

  function publicKey() {
    return global.fetch(DB().CFG.url + '/rest/v1/rpc/vapid_public_key', {
      method: 'POST',
      headers: { 'apikey': DB().CFG.key, 'Authorization': 'Bearer ' + DB().CFG.key, 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  function save(sub) {
    var j = sub.toJSON ? sub.toJSON() : sub;
    j.ua = (navigator.userAgent || '').slice(0, 300);
    return DB().callAuthed('save_push_subscription', { sub: j });
  }

  /* ¿Este aparato ya recibe avisos? */
  function status() {
    if (!supported()) return Promise.resolve({ on: false, reason: needsInstall() ? 'install' : 'unsupported' });
    if (needsInstall()) return Promise.resolve({ on: false, reason: 'install' });
    if (Notification.permission === 'denied') return Promise.resolve({ on: false, reason: 'denied' });
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) return { on: false };
      return reg.pushManager.getSubscription().then(function (s) { return { on: !!s }; });
    });
  }

  function enable() {
    if (!supported()) return Promise.reject(new Error('Este navegador no admite avisos.'));
    if (needsInstall()) return Promise.reject(new Error('En iPhone, primero añade la app a la pantalla de inicio.'));
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') throw new Error(p === 'denied'
        ? 'Has bloqueado los avisos. Actívalos en los ajustes del navegador para esta web.'
        : 'Sin permiso no puedo enviarte avisos.');
      return Promise.all([registration(), publicKey()]);
    }).then(function (r) {
      var reg = r[0], key = r[1];
      if (!key) throw new Error('La base aún no tiene la clave de avisos.');
      return reg.pushManager.getSubscription().then(function (s) {
        return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      });
    }).then(save);
  }

  function disable() {
    if (!supported()) return Promise.resolve();
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) return;
      return reg.pushManager.getSubscription().then(function (s) {
        if (!s) return;
        var ep = s.endpoint;
        return s.unsubscribe().then(function () {
          return DB().callAuthed('delete_push_subscription', { p_endpoint: ep }).catch(function () {});
        });
      });
    });
  }

  function test() { return DB().callAuthed('send_test_push'); }

  /* Al abrir la app con sesión y permiso: se vuelve a guardar el aparato
     (los navegadores renuevan la suscripción de vez en cuando). */
  function refresh() {
    if (!supported() || needsInstall() || Notification.permission !== 'granted') return;
    if (!(global.PadelAuth && global.PadelAuth.user())) return;
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) return;
      return reg.pushManager.getSubscription().then(function (s) { if (s) return save(s); });
    }).catch(function () {});
  }

  global.PadelAvisos = { supported: supported, needsInstall: needsInstall, permission: permission,
    status: status, enable: enable, disable: disable, test: test, refresh: refresh };
})(window);
