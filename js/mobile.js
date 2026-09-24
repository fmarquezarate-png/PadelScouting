/* ============================================================
   mobile.js · pequeños gestos del móvil
   1. Tirar hacia abajo desde arriba del todo recarga los datos
      (en la app instalada no hay recarga nativa).
   2. El zoom con dos dedos está permitido, pero al soltar y
      esperar un momento la pantalla vuelve a su tamaño real.
   ============================================================ */
(function (global) {
  'use strict';

  var doc = global.document;
  var standalone = global.navigator.standalone === true ||
    (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches);
  var touch = 'ontouchstart' in global;

  /* ---------- tirar para recargar ---------- */
  var startY = null, pulling = false, pull = 0, ind = null;
  var THRESHOLD = 80;

  function indicator() {
    if (ind) return ind;
    ind = doc.createElement('div');
    ind.className = 'ptr';
    ind.innerHTML = '<span class="ptr-ball"></span><span class="ptr-t">Tira para actualizar</span>';
    doc.body.appendChild(ind);
    return ind;
  }

  function reset() {
    pulling = false; startY = null; pull = 0;
    if (ind) { ind.style.transform = ''; ind.classList.remove('on', 'ready'); }
  }

  function refresh() {
    if (ind) { ind.classList.add('loading'); ind.querySelector('.ptr-t').textContent = 'Actualizando…'; }
    try { global.PadelDB.clearCache(); } catch (e) {}
    setTimeout(function () { global.location.reload(); }, 250);
  }

  if (touch && standalone) {
    doc.addEventListener('touchstart', function (ev) {
      if (ev.touches.length !== 1 || global.scrollY > 0 || doc.querySelector('.modal') ||
          doc.body.classList.contains('has-modal')) return;
      startY = ev.touches[0].clientY; pulling = true;
    }, { passive: true });
    doc.addEventListener('touchmove', function (ev) {
      if (!pulling || startY == null) return;
      pull = ev.touches[0].clientY - startY;
      if (pull <= 0 || global.scrollY > 0) { reset(); return; }
      var el = indicator();
      var d = Math.min(pull * 0.5, THRESHOLD * 0.9);
      el.classList.add('on');
      el.classList.toggle('ready', pull > THRESHOLD);
      el.querySelector('.ptr-t').textContent = pull > THRESHOLD ? 'Suelta para actualizar' : 'Tira para actualizar';
      el.style.transform = 'translate(-50%, ' + d + 'px)';
    }, { passive: true });
    doc.addEventListener('touchend', function () {
      if (pulling && pull > THRESHOLD) refresh(); else reset();
    }, { passive: true });
  }

  /* ---------- el zoom vuelve solo ---------- */
  var vv = global.visualViewport;
  var meta = doc.querySelector('meta[name="viewport"]');
  var original = meta ? meta.getAttribute('content') : '';
  var timer = null, fingers = 0;

  function snapBack() {
    if (!vv || vv.scale <= 1.01 || fingers > 0 || !meta) return;
    /* Fijar la escala máxima un instante hace que el navegador vuelva a 1. */
    meta.setAttribute('content', original + ', maximum-scale=1');
    setTimeout(function () { meta.setAttribute('content', original); }, 300);
  }

  if (vv && meta) {
    doc.addEventListener('touchstart', function (ev) { fingers = ev.touches.length; }, { passive: true });
    doc.addEventListener('touchend', function (ev) {
      fingers = ev.touches.length;
      clearTimeout(timer);
      timer = setTimeout(snapBack, 1400);
    }, { passive: true });
    vv.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(snapBack, 1400);
    });
  }

  global.PadelMobile = { snapBack: snapBack, refresh: refresh, standalone: standalone };
})(window);
