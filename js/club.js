/* ============================================================
   club.js · histórico de nivel del club
   Lee lo que se copia de la web del club («Histórico del nivel de
   juego»), lo guarda en tu cuenta y lo prepara para la escalera.
   · Las filas «Restaurar por corrección…» no son partidos: fuera.
   · Si dos filas tienen la misma fecha y hora, cuenta la primera.
   · El nivel del club es uno: vale igual en masculino y en mixto.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PadelClub = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LINE = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(ganado|perdido)\b(.*?)(-?\d+(?:[.,]\d+)?)\s*$/i;

  function pad(n) { return String(n).padStart(2, '0'); }

  /* Devuelve { ranking, rows: [{ at, won, level }], dropped, duplicates } en orden de fecha.
     «at» es la hora de la web tal cual (se guarda como si fuera UTC para no moverla). */
  function parse(text) {
    var out = { ranking: null, rows: [], dropped: 0, duplicates: 0 };
    var rk = /ranking\s*:?\s*(\d+)/i.exec(text || '');
    if (rk) out.ranking = +rk[1];
    var seen = {};
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var m = LINE.exec(line.trim());
      if (!m) return;
      if (/restaurar|correcci[oó]n/i.test(m[8])) { out.dropped++; return; }
      var at = m[3] + '-' + pad(m[2]) + '-' + pad(m[1]) + 'T' + pad(m[4]) + ':' + m[5] + ':' + (m[6] || '00') + 'Z';
      if (seen[at]) { out.duplicates++; return; }
      seen[at] = true;
      out.rows.push({ at: at, won: /ganado/i.test(m[7]), level: +m[9].replace(',', '.') });
    });
    out.rows.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    return out;
  }

  /* Rango de fechas de una temporada a partir de sus meses («Febrero» … «Julio-Agosto»).
     El año sale del identificador (2026-s1). Sin datos suficientes: sin filtro. */
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function monthIdx(label) {
    var words = String(label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/);
    var found = [];
    words.forEach(function (w) { var i = MESES.indexOf(w); if (i >= 0) found.push(i); });
    return found;
  }
  function seasonRange(model) {
    var s = (model && model.season) || {};
    if (!s.slug || /^all:/.test(s.slug)) return null;
    var y = /^(\d{4})/.exec(s.slug);
    if (!y || !model.months || !model.months.length) return null;
    var first = monthIdx(model.months[0].label), last = monthIdx(model.months[model.months.length - 1].label);
    if (!first.length || !last.length) return null;
    var y0 = +y[1], a = first[0], b = last[last.length - 1];
    var y1 = b < a ? y0 + 1 : y0;
    return { from: y0 + '-' + pad(a + 1) + '-01', to: (b === 11 ? (y1 + 1) + '-01' : y1 + '-' + pad(b + 2)) + '-01' };
  }

  /* Filas → formato de la escalera ({ fecha: 'dd/mm', win, nivel }), dentro del rango. */
  function toSeries(rows, range) {
    return (rows || []).map(function (r) {
      return Array.isArray(r) ? { at: String(r[0]), won: !!r[1], level: +r[2] } : r;
    }).filter(function (r) {
      var d = r.at.slice(0, 10);
      return !range || (d >= range.from && d < range.to);
    }).map(function (r) {
      return { fecha: r.at.slice(8, 10) + '/' + r.at.slice(5, 7), at: r.at, win: !!r.won, nivel: +r.level };
    });
  }

  return { parse: parse, seasonRange: seasonRange, toSeries: toSeries };
});
