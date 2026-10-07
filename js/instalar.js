/* ============================================================
   instalar.js · «Descarga la app» y la invitación a los avisos
   · Detecta aparato y navegador, pide confirmar y da los pasos exactos.
   · Al entrar desde el navegador, invita a instalarla (una vez; «Ahora no» = 7 días).
   · Con cuenta y sin avisos en este aparato, invita a activarlos (igual).
     En iPhone sin instalar, la invitación lleva a instalarla primero.
   ============================================================ */
(function (global) {
  'use strict';

  var KEY_INSTALL = 'padel-scouting.invite.install.v1';
  var KEY_NOTIFY = 'padel-scouting.invite.notify.v1';
  var WEEK = 7 * 24 * 3600 * 1000;
  var deferred = null;          /* el «Instalar» nativo de Chrome / Edge / Android */
  var shownThisVisit = false;   /* como mucho una invitación por visita */

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} }
  function toast(m, bad) { if (global.PadelApp) global.PadelApp.toast(m, bad); }

  /* ---------- qué aparato y qué navegador ---------- */
  function detect() {
    var ua = navigator.userAgent || '';
    var device = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios'
      : /Android/i.test(ua) ? 'android' : 'pc';
    var inApp = /Instagram/i.test(ua) ? 'Instagram' : /FBAN|FBAV|FB_IAB/i.test(ua) ? 'Facebook'
      : /WhatsApp/i.test(ua) ? 'WhatsApp' : /Line\//i.test(ua) ? 'LINE' : /TikTok|musical_ly/i.test(ua) ? 'TikTok' : null;
    var browser;
    if (device === 'ios') browser = /CriOS/i.test(ua) ? 'chrome' : /FxiOS/i.test(ua) ? 'firefox' : /EdgiOS/i.test(ua) ? 'edge' : 'safari';
    else if (device === 'android') browser = /SamsungBrowser/i.test(ua) ? 'samsung' : /Firefox/i.test(ua) ? 'firefox' : /EdgA/i.test(ua) ? 'edge' : 'chrome';
    else browser = /Edg\//i.test(ua) ? 'edge' : /Firefox/i.test(ua) ? 'firefox' : /Chrome|CriOS/i.test(ua) ? 'chrome' : /Safari/i.test(ua) ? 'safari' : 'chrome';
    return { device: device, browser: browser, inApp: inApp };
  }
  function installed() {
    return (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }

  var DEVICES = { ios: 'iPhone o iPad', android: 'Android', pc: 'Ordenador' };
  var BROWSERS = {
    ios: [['safari', 'Safari'], ['chrome', 'Chrome'], ['edge', 'Edge'], ['firefox', 'Firefox']],
    android: [['chrome', 'Chrome'], ['samsung', 'Samsung Internet'], ['edge', 'Edge'], ['firefox', 'Firefox']],
    pc: [['chrome', 'Chrome'], ['edge', 'Edge'], ['safari', 'Safari (Mac)'], ['firefox', 'Firefox']]
  };
  function bName(dev, b) {
    var x = (BROWSERS[dev] || []).filter(function (o) { return o[0] === b; })[0];
    return x ? x[1] : b;
  }

  /* ---------- los pasos de cada caso ---------- */
  var SHARE = '<span class="ins-ico" aria-hidden="true">⬆︎</span>';
  function steps(dev, b) {
    if (dev === 'ios') {
      var after = 'Abre Padel Scouting desde el icono nuevo de tu pantalla de inicio y <b>vuelve a entrar con tu cuenta</b> (la app instalada no comparte la sesión del navegador).';
      if (b === 'safari') return { list: [
        'Toca el botón <b>Compartir</b> ' + SHARE + ' (abajo en el centro; en iPad, arriba a la derecha).',
        'Baja y elige <b>«Añadir a pantalla de inicio»</b>.',
        'Toca <b>Añadir</b> arriba a la derecha.', after] };
      return { list: [
        'Toca el botón <b>Compartir</b> ' + SHARE + ' (en ' + esc(bName(dev, b)) + ' está en la barra de la dirección, arriba a la derecha, o en el menú ⋯).',
        'Elige <b>«Añadir a pantalla de inicio»</b> y luego <b>Añadir</b>.', after],
        note: 'Si no te sale esa opción, abre esta misma dirección en <b>Safari</b> y sigue los pasos de Safari: en iPhone es la forma segura.' };
    }
    if (dev === 'android') {
      if (b === 'samsung') return { list: [
        'Toca el menú <b>☰</b> (abajo a la derecha).', 'Elige <b>«Añadir página a»</b> → <b>«Pantalla de inicio»</b>.',
        'Confirma con <b>Añadir</b>. El icono queda en tu pantalla de inicio.'] };
      if (b === 'firefox') return { list: [
        'Toca el menú <b>⋮</b>.', 'Elige <b>«Instalar»</b> (o «Añadir a pantalla de inicio»).', 'Confirma. El icono queda en tu pantalla de inicio.'] };
      return { native: true, list: [
        'Toca el menú <b>⋮</b> (arriba a la derecha).', 'Elige <b>«Instalar aplicación»</b> (en algunos móviles, «Añadir a pantalla de inicio»).',
        'Confirma con <b>Instalar</b>. Se abre como una app más, desde su icono.'] };
    }
    if (b === 'safari') return { list: [
      'En la barra de menús, abre <b>Archivo</b> → <b>«Añadir al Dock»</b> (macOS Sonoma o posterior).',
      'Confirma con <b>Añadir</b>. La tendrás en el Dock como una app.'] };
    if (b === 'firefox') return { list: [
      'Firefox en ordenador no instala apps web.', 'Ábrela con <b>Chrome</b> o <b>Edge</b> y sigue sus pasos, o guárdala en marcadores.'] };
    if (b === 'edge') return { native: true, list: [
      'En la barra de la dirección, toca el icono <b>«Aplicación disponible»</b> (un cuadrado con un +), o',
      'abre el menú <b>⋯</b> → <b>Aplicaciones</b> → <b>«Instalar este sitio como aplicación»</b>.', 'Confirma con <b>Instalar</b>.'] };
    return { native: true, list: [
      'En la barra de la dirección, a la derecha, toca el icono de <b>instalar</b> (una pantalla con una flecha), o',
      'abre el menú <b>⋮</b> → <b>«Enviar, guardar y compartir»</b> → <b>«Instalar página como aplicación»</b>.', 'Confirma con <b>Instalar</b>.'] };
  }

  /* ---------- el asistente ---------- */
  var wz = null;
  function modal(html) {
    var root = document.getElementById('modal-root');
    root.innerHTML = '<div class="modal"><div class="modal-card ins-card" role="dialog" aria-modal="true" aria-labelledby="ins-t">' + html + '</div></div>';
    document.body.classList.add('has-modal');
    return root;
  }
  function close() {
    wz = null;
    var root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
    document.body.classList.remove('has-modal');
  }

  function openWizard(from) {
    var d = detect();
    wz = { step: installed() ? 'done' : 'confirm', device: d.device, browser: d.browser, inApp: d.inApp, from: from || null };
    paint();
  }

  function paint() {
    var h = [];
    if (wz.step === 'done') {
      h.push('<div class="eyebrow">Descarga la app</div><h2 id="ins-t">Ya la tienes instalada ✅</h2>' +
        '<p class="lede">Estás usando Padel Scouting como app. Si quieres recibir avisos de tus partidos, actívalos en Configuración → Avisos.</p>' +
        '<div class="btn-row"><button class="btn primary" data-ins="avisos">Ir a Avisos</button><button class="btn ghost" data-ins="close">Cerrar</button></div>');
    } else if (wz.step === 'confirm') {
      h.push('<div class="eyebrow">Descarga la app · 1 de 2</div><h2 id="ins-t">Primero, ¿desde dónde entras?</h2>');
      if (wz.inApp) h.push('<div class="notice">Estás dentro de <b>' + esc(wz.inApp) + '</b>. Desde ahí no se puede instalar: toca el menú <b>⋯</b> de arriba y elige <b>«Abrir en ' +
        (wz.device === 'ios' ? 'Safari' : 'el navegador') + '»</b>; luego vuelve a tocar «Descarga la app».</div>');
      h.push('<p class="lede">Parece que usas <b>' + esc(DEVICES[wz.device]) + '</b> con <b>' + esc(bName(wz.device, wz.browser)) + '</b>. ¿Es así?</p>' +
        '<div class="btn-row"><button class="btn primary" data-ins="yes">Sí, dame los pasos</button><button class="btn" data-ins="pick">No, lo elijo yo</button></div>' +
        '<div class="btn-row tight"><button class="btn small ghost" data-ins="close">Ahora no</button></div>');
    } else if (wz.step === 'pick') {
      h.push('<div class="eyebrow">Descarga la app · 1 de 2</div><h2 id="ins-t">Elige tu aparato y tu navegador</h2>' +
        '<span class="field-label">Aparato</span><div class="chips tight" id="ins-dev">' +
        Object.keys(DEVICES).map(function (k) {
          return '<button type="button" class="chip" data-dev="' + k + '" aria-pressed="' + (wz.device === k) + '">' + esc(DEVICES[k]) + '</button>';
        }).join('') + '</div><span class="field-label">Navegador</span><div class="chips tight" id="ins-br">' +
        BROWSERS[wz.device].map(function (o) {
          return '<button type="button" class="chip" data-br="' + o[0] + '" aria-pressed="' + (wz.browser === o[0]) + '">' + esc(o[1]) + '</button>';
        }).join('') + '</div><p class="field-note">¿No sabes cuál es? Si en iPhone no has instalado ningún otro, es Safari; en Android suele ser Chrome (o Samsung Internet en móviles Samsung).</p>' +
        '<div class="btn-row"><button class="btn primary" data-ins="yes">Ver los pasos</button><button class="btn ghost" data-ins="close">Ahora no</button></div>');
    } else {
      var s = steps(wz.device, wz.browser);
      h.push('<div class="eyebrow">Descarga la app · 2 de 2 · ' + esc(DEVICES[wz.device]) + ' con ' + esc(bName(wz.device, wz.browser)) + '</div>' +
        '<h2 id="ins-t">Así la instalas</h2>');
      if (s.native && deferred) h.push('<div class="btn-row"><button class="btn primary" data-ins="native">Instalar ahora</button></div>' +
        '<p class="field-note">Un toque y listo. Si prefieres hacerlo a mano:</p>');
      h.push('<ol class="ins-steps">' + s.list.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>');
      if (s.note) h.push('<p class="field-note">' + s.note + '</p>');
      h.push('<p class="field-note">Una vez instalada, en Configuración → Avisos puedes activar los avisos de tus partidos.</p>' +
        '<div class="btn-row"><button class="btn primary" data-ins="close">Hecho</button><button class="btn ghost" data-ins="pick">Cambiar aparato o navegador</button></div>');
    }
    var root = modal(h.join(''));
    root.querySelectorAll('[data-ins]').forEach(function (b) {
      b.addEventListener('click', function () { action(b.getAttribute('data-ins')); });
    });
    root.querySelectorAll('[data-dev]').forEach(function (b) {
      b.addEventListener('click', function () {
        wz.device = b.getAttribute('data-dev');
        if (!BROWSERS[wz.device].some(function (o) { return o[0] === wz.browser; })) wz.browser = BROWSERS[wz.device][0][0];
        paint();
      });
    });
    root.querySelectorAll('[data-br]').forEach(function (b) {
      b.addEventListener('click', function () { wz.browser = b.getAttribute('data-br'); paint(); });
    });
  }

  function action(a) {
    if (a === 'close') { close(); return; }
    if (a === 'yes') { wz.step = 'steps'; paint(); return; }
    if (a === 'pick') { wz.step = 'pick'; paint(); return; }
    if (a === 'avisos') { close(); if (global.PadelApp) global.PadelApp.go('config'); return; }
    if (a === 'native' && deferred) {
      var ev = deferred; deferred = null;
      ev.prompt();
      (ev.userChoice || Promise.resolve({})).then(function (r) {
        if (r && r.outcome === 'accepted') { close(); toast('¡Instalada! Ábrela desde su icono.'); }
        else paint();
      });
    }
  }

  /* ---------- invitaciones al entrar ---------- */
  function due(key) {
    var v = lsGet(key);
    if (v === 'never') return false;
    return !v || Date.now() > +v;
  }
  function later(key) { lsSet(key, String(Date.now() + WEEK)); }
  function never(key) { lsSet(key, 'never'); }
  function busy() {
    var root = document.getElementById('modal-root');
    var dr = document.getElementById('drawer');
    return !!((root && root.innerHTML.trim()) || (dr && !dr.hidden));
  }

  function invite(html, key, onYes) {
    var root = modal(html + '<div class="btn-row tight ins-later"><button class="btn small ghost" data-inv="later">Ahora no</button>' +
      '<button class="btn small ghost" data-inv="never">No, gracias</button></div>');
    shownThisVisit = true;
    root.querySelector('[data-inv="yes"]').addEventListener('click', function () { later(key); onYes(); });
    root.querySelector('[data-inv="later"]').addEventListener('click', function () { later(key); close(); });
    root.querySelector('[data-inv="never"]').addEventListener('click', function () { never(key); close(); });
  }

  function inviteInstall() {
    invite('<div class="eyebrow">Padel Scouting en tu móvil</div><h2 id="ins-t">Descarga la app</h2>' +
      '<p class="lede">Instálala en tu pantalla de inicio: se abre a pantalla completa, como cualquier app, y puede avisarte de tus partidos.</p>' +
      '<p class="field-note">No pasa por ninguna tienda ni ocupa casi nada. Te digo los pasos exactos para tu móvil.</p>' +
      '<div class="btn-row"><button class="btn primary" data-inv="yes">Cómo instalarla</button></div>', KEY_INSTALL, function () { openWizard('invite'); });
  }

  function inviteNotify() {
    var AV = global.PadelAvisos;
    if (AV.needsInstall()) {
      invite('<div class="eyebrow">Avisos</div><h2 id="ins-t">¿Te avisamos de tus partidos?</h2>' +
        '<p class="lede">En iPhone los avisos solo funcionan con la app instalada en la pantalla de inicio. Te enseño cómo en dos pasos.</p>' +
        '<div class="btn-row"><button class="btn primary" data-inv="yes">Cómo instalarla</button></div>', KEY_NOTIFY, function () { openWizard('avisos'); });
      return;
    }
    invite('<div class="eyebrow">Avisos</div><h2 id="ins-t">¿Te avisamos de tus partidos?</h2>' +
      '<ul class="ins-list"><li>La víspera de cada partido, a las 20:00.</li><li>Cuando tu pareja apunta un resultado.</li>' +
      '<li>Cuando se carga la clasificación nueva, con vuestro puesto.</li></ul>' +
      '<p class="field-note">Cada tipo se puede apagar luego en Configuración → Avisos.</p>' +
      '<div class="btn-row"><button class="btn primary" data-inv="yes">Activar avisos</button></div>', KEY_NOTIFY, function () {
        var b = document.querySelector('[data-inv="yes"]');
        if (b) b.disabled = true;
        AV.enable().then(function () { close(); toast('Avisos activados en este aparato.'); })
          .catch(function (err) { close(); toast(err.message, true); });
      });
  }

  /* Al entrar: como mucho una invitación, sin pisar otra ventana abierta. */
  function maybeInvite(tries) {
    tries = tries || 0;
    /* Las pruebas automáticas (navegador manejado por un robot) no ven invitaciones salvo que las pidan. */
    if (shownThisVisit || (navigator.webdriver && !global.__PADEL_INVITES__)) return;
    if (busy()) { if (tries < 20) setTimeout(function () { maybeInvite(tries + 1); }, 3000); return; }
    if (!installed() && due(KEY_INSTALL)) { inviteInstall(); return; }
    var AV = global.PadelAvisos, logged = global.PadelAuth && global.PadelAuth.user();
    if (!logged || !AV || !due(KEY_NOTIFY)) return;
    if (AV.permission() === 'denied') return;
    if (!AV.supported() && !AV.needsInstall()) return;
    AV.status().then(function (s) {
      if (s.on || shownThisVisit || busy()) return;
      inviteNotify();
    }).catch(function () {});
  }

  global.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });
  global.addEventListener('appinstalled', function () { deferred = null; never(KEY_INSTALL); });

  function init() {
    /* El receptor de avisos también hace instalable la app en navegadores antiguos. */
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
    setTimeout(maybeInvite, 2500);
  }

  global.PadelInstalar = { detect: detect, installed: installed, steps: steps, openWizard: openWizard,
    maybeInvite: maybeInvite, close: close, keys: { install: KEY_INSTALL, notify: KEY_NOTIFY } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
