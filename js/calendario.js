/* ============================================================
   calendario.js · el calendario de la liga
   · Temporada 1 (S1): febrero → julio. La ronda de julio se puede
     jugar en julio y agosto.
   · Temporada 2 (S2): septiembre → diciembre. La ronda de diciembre
     se puede jugar en diciembre y enero (enero es del S2 del año anterior).
   · Master: torneo aparte, fuera del ranking. No entra aquí.
   Manda el mes en que se JUGÓ. La web del mixto nombra cada ronda con un
   mes de adelanto («Julio» se jugó en septiembre); la del masculino no.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PadelCalendario = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
    'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  function norm(x) {
    return String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  /* «Julio-Agosto» → 6 (índice 0-11); -1 si no es un mes. */
  function monthIdx(label) {
    var first = norm(label).split(/[^a-z]+/)[0];
    return MESES.map(norm).indexOf(first);
  }

  /* 1 = S1 (feb–ago), 2 = S2 (sep–ene). */
  function semesterOf(idx) {
    if (idx >= 1 && idx <= 7) return 1;
    if (idx >= 8 || idx === 0) return 2;
    return 0;
  }

  /* Año de la temporada a la que pertenece un mes jugado, visto desde «now».
     Enero es del S2 del año anterior; un mes posterior al actual es del año pasado. */
  function seasonYear(idx, now) {
    var d = now || new Date(), y = d.getFullYear(), cur = d.getMonth();
    if (idx === 0) return y - 1;
    return idx > cur + 1 ? y - 1 : y;
  }

  function slugFor(year, sem, kind) {
    return year + '-s' + sem + (!kind || kind === 'masculina' ? '' : '-' + kind);
  }
  function nameFor(year, sem) {
    return 'Temporada ' + year + ' · ' + (sem === 1 ? 'primer' : 'segundo') + ' semestre';
  }

  /* Cuántos meses de adelanto lleva el nombre de la web. */
  function defaultShift(kind) { return kind === 'mixta' ? 1 : 0; }

  /* Mes jugado por defecto para un nombre de la web. */
  function playedIdx(webLabel, kind) {
    var i = monthIdx(webLabel);
    if (i < 0) return -1;
    var p = (i + defaultShift(kind)) % 12;
    /* Agosto no tiene ronda propia (es la de julio): la siguiente es septiembre. */
    if (p === 7 && defaultShift(kind)) p = 8;
    return p;
  }

  /* Reparte los meses pegados entre sus temporadas.
     months: [{ n, label, played }] con played = índice 0-11 del mes jugado. */
  function plan(months, kind, now) {
    var by = {}, order = [];
    months.forEach(function (M) {
      if (M.played == null || M.played < 0) return;
      var sem = semesterOf(M.played), year = seasonYear(M.played, now);
      var slug = slugFor(year, sem, kind);
      if (!by[slug]) { by[slug] = { slug: slug, name: nameFor(year, sem), sem: sem, year: year, months: [] }; order.push(slug); }
      by[slug].months.push(M);
    });
    return order.sort().map(function (s) { return by[s]; });
  }

  return { MESES: MESES, monthIdx: monthIdx, semesterOf: semesterOf, seasonYear: seasonYear,
    slugFor: slugFor, nameFor: nameFor, defaultShift: defaultShift, playedIdx: playedIdx, plan: plan };
});
