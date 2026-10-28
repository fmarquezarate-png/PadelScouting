/* ============================================================
   recorrido.js · «¿Cómo funciona?» — recorrido guiado por la pista
   Cinco paradas que cuentan la historia de la pista:
   la red (lo que te toca ahora), el fondo (la liga), tu lado (tu libreta
   de scouting), la puerta (el rival) y la barra de arriba.
   Sale sola la primera vez que se abre la pista; se repite desde el menú ☰.
   ============================================================ */
(function (global) {
  'use strict';

  var KEY = 'padel-scouting.tour.v1';
  var N = function (k) { return global.PadelData.NAMES[k]; };

  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Rectángulo que abarca varios elementos (las tres zonas del fondo, por ejemplo). */
  function union(sel) {
    var els = document.querySelectorAll(sel), r = null;
    Array.prototype.forEach.call(els, function (el) {
      var b = el.getBoundingClientRect();
      if (!b.width) return;
      r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) }
        : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    });
    return r;
  }

  function stops() {
    return [
      { sel: '.net-btn', title: 'La red: ' + N('estemes'),
        text: 'Lo que te toca <b>ahora</b>: tu grupo de este mes, la fecha de cada partido y su resultado. Es el botón principal: empieza siempre por aquí.' },
      { sel: '.zone[data-zone="liga"] .zb, .zone[data-zone="temporada"] .zb, .zone[data-zone="cronica"] .zb, .zone[data-zone="liga"] .zt, .zone[data-zone="cronica"] .zt',
        title: 'Tu lado: la liga',
        text: '<b>' + esc(N('liga')) + '</b>: todos los grupos del mes y la general. <b>' + esc(N('temporada')) + '</b>: vuestro semestre. <b>' +
          esc(N('cronica')) + '</b>: la temporada contada.' },
      { sel: '.zone[data-zone="registro"] .zb, .zone[data-zone="historial"] .zb, .zone[data-zone="analisis"] .zb, .zone[data-zone="registro"] .zt, .zone[data-zone="analisis"] .zt',
        title: 'Al fondo: tu libreta de scouting',
        text: '<b>' + esc(N('registro')) + '</b>: cómo jugó el rival y qué os funcionó. <b>' + esc(N('historial')) + '</b>: todas tus notas. <b>' +
          esc(N('analisis')) + '</b>: un plan corto para el próximo partido. (El resultado no va aquí: va en ' + esc(N('estemes')) + '.)' },
      { sel: '.zone.door .zb, .zone.door .zt', title: 'La puerta: ' + N('rival'),
        text: 'Antes de jugar, mira cómo juega la pareja que te toca, contra quién gana y cómo os comparáis.' },
      { sel: '.topbar', title: 'Arriba: competición, pareja y menú',
        text: 'Junto al título cambias de <b>competición</b> (masculina, mixta…). El botón de la pareja elige <b>a quién miras</b>. El menú <b>☰</b> lo tiene todo, también este recorrido (<b>«¿Cómo funciona?»</b>).' }
    ];
  }

  var st = null;

  function start() {
    if (st) return;
    var list = stops().filter(function (s) { return union(s.sel); });
    if (!list.length) return;
    st = { i: 0, list: list };
    document.body.classList.add('touring');
    var root = document.createElement('div');
    root.id = 'tour';
    root.className = 'tour';
    root.innerHTML = '<div class="tour-hole" aria-hidden="true"></div>' +
      '<div class="tour-bubble" role="dialog" aria-modal="true" aria-labelledby="tour-t"></div>';
    document.body.appendChild(root);
    root.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-tour]');
      if (!b) return;
      var a = b.getAttribute('data-tour');
      if (a === 'skip' || a === 'end') finish();
      else if (a === 'next') { st.i++; paint(); }
      else if (a === 'prev') { st.i = Math.max(0, st.i - 1); paint(); }
    });
    global.addEventListener('resize', place);
    global.addEventListener('keydown', onKey);
    paint();
  }

  function onKey(ev) {
    if (!st) return;
    if (ev.key === 'Escape') finish();
    if (ev.key === 'ArrowRight' && st.i < st.list.length - 1) { st.i++; paint(); }
    if (ev.key === 'ArrowLeft' && st.i > 0) { st.i--; paint(); }
  }

  function paint() {
    var s = st.list[st.i], last = st.i === st.list.length - 1;
    var bub = document.querySelector('#tour .tour-bubble');
    bub.innerHTML = '<div class="tour-n">' + (st.i + 1) + ' de ' + st.list.length + '</div>' +
      '<h3 id="tour-t">' + esc(s.title) + '</h3><p>' + s.text + '</p>' +
      '<div class="tour-btns">' +
      (last ? '' : '<button type="button" class="btn small ghost" data-tour="skip">Saltar</button>') +
      (st.i ? '<button type="button" class="btn small ghost" data-tour="prev">Atrás</button>' : '') +
      '<button type="button" class="btn small primary" data-tour="' + (last ? 'end' : 'next') + '">' + (last ? '¡A jugar!' : 'Siguiente') + '</button></div>';
    place();
    var focus = bub.querySelector('.btn.primary');
    if (focus) focus.focus({ preventScroll: true });
  }

  function place() {
    if (!st) return;
    var s = st.list[st.i], r = union(s.sel);
    var hole = document.querySelector('#tour .tour-hole'), bub = document.querySelector('#tour .tour-bubble');
    if (!r || !hole) return;
    var pad = 10, vw = global.innerWidth, vh = global.innerHeight;
    var L = Math.max(4, r.left - pad), T = Math.max(4, r.top - pad);
    var W = Math.min(vw - 8, r.right + pad) - L, H = Math.min(vh - 8, r.bottom + pad) - T;
    hole.style.left = L + 'px'; hole.style.top = T + 'px'; hole.style.width = W + 'px'; hole.style.height = H + 'px';
    /* La burbuja va debajo del hueco si cabe; si no, encima. */
    var bw = Math.min(360, vw - 24), bh = bub.offsetHeight || 180;
    var left = Math.max(12, Math.min(vw - bw - 12, L + W / 2 - bw / 2));
    var top = T + H + 12;
    if (top + bh > vh - 12) top = Math.max(12, T - bh - 12);
    bub.style.width = bw + 'px'; bub.style.left = left + 'px'; bub.style.top = top + 'px';
  }

  function finish() {
    lsSet(KEY, 'done');
    var root = document.getElementById('tour');
    if (root) root.parentNode.removeChild(root);
    document.body.classList.remove('touring');
    global.removeEventListener('resize', place);
    global.removeEventListener('keydown', onKey);
    st = null;
  }

  /* La primera vez que se ve la pista. Nunca encima de otra ventana. */
  function maybeStart(tries) {
    tries = tries || 0;
    if (lsGet(KEY) === 'done' || st) return;
    if (navigator.webdriver && !global.__PADEL_TOUR__) return;
    var A = global.PadelApp;
    if (!A || A.state.view !== 'inicio') return;
    var root = document.getElementById('modal-root'), dr = document.getElementById('drawer');
    var busy = (root && root.innerHTML.trim()) || (dr && !dr.hidden) || !document.querySelector('.net-btn');
    if (busy) { if (tries < 30) setTimeout(function () { maybeStart(tries + 1); }, 1500); return; }
    start();
  }

  /* Desde el menú: vuelve a la pista y arranca. */
  function replay() {
    var A = global.PadelApp;
    if (A && A.state.view !== 'inicio') A.go('inicio');
    var t = 0;
    (function wait() {
      if (document.querySelector('.net-btn')) { setTimeout(start, 350); return; }
      if (++t < 30) setTimeout(wait, 200);
    })();
  }

  global.PadelRecorrido = { start: start, replay: replay, maybeStart: maybeStart, finish: finish, active: function () { return !!st; } };
})(window);
