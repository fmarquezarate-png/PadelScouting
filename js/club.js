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

  /* Fecha en cualquiera de los dos formatos de la web: 22/10/2026 14:54:26 o 10/22/2026 2:54:26 PM. */
  var LINE = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:([ap])\.?\s?m\.?)?\s+(ganado|perdido)\b(.*?)(-?\d+(?:[.,]\d+)?)\s*$/i;
  var STARTS = /^\s*\d{1,2}\/\d{1,2}\/\d{4}\s/;

  function pad(n) { return String(n).padStart(2, '0'); }

  /* Devuelve { ranking, rows: [{ at, won, level }], corrections, removed, duplicates } en orden de fecha.
     «at» es la hora de la web tal cual (se guarda como si fuera UTC para no moverla).
     Correcciones del club: «Restaurar por corrección… nivel X» devuelve tu nivel a como estaba antes
     de un partido mal apuntado, y la línea siguiente lo vuelve a apuntar bien. Así que:
       · se quitan los apuntes hechos desde que tenías X (el resultado erróneo), y
       · el apunte corregido se queda con la FECHA del partido original (no la de la corrección). */
  function parse(text) {
    var out = { ranking: null, rows: [], dropped: 0, duplicates: 0, corrections: 0, removed: 0 };
    var rk = /ranking\s*:?\s*(\d+)/i.exec(text || '');
    if (rk) out.ranking = +rk[1];
    var raw = [], src = String(text || '').split(/\r?\n/);
    for (var li = 0; li < src.length; li++) {
      var line = src[li].trim(), m = LINE.exec(line);
      /* Una observación larga puede venir partida en dos líneas: se junta con la siguiente. */
      if (!m && STARTS.test(line) && li + 1 < src.length && !STARTS.test(src[li + 1])) {
        m = LINE.exec(line + ' ' + src[li + 1].trim());
        if (m) li++;
      }
      if (m) raw.push(m);
    }
    /* ¿Día/mes o mes/día? Si algún número pasa de 12 se sabe; si no, con AM/PM es el formato americano. */
    var us = raw.some(function (m) { return +m[2] > 12; }) ? true
      : raw.some(function (m) { return +m[1] > 12; }) ? false
      : raw.some(function (m) { return m[7]; });
    out.format = us ? 'mm/dd' : 'dd/mm';
    var lines = raw.map(function (m) {
      var d = us ? m[2] : m[1], mo = us ? m[1] : m[2], hh = +m[4];
      if (m[7]) { hh = hh % 12; if (/p/i.test(m[7])) hh += 12; }
      return {
        at: m[3] + '-' + pad(mo) + '-' + pad(d) + 'T' + pad(hh) + ':' + m[5] + ':' + (m[6] || '00') + 'Z',
        won: /ganado/i.test(m[8]), level: +m[10].replace(',', '.'),
        restore: /restaurar|correcci[oó]n/i.test(m[9])
      };
    });
    /* La web lista de más antiguo a más nuevo; si viniera al revés, se le da la vuelta
       (dentro de la misma hora, la línea «Restaurar» va antes que su corrección). */
    if (lines.length > 1 && lines[0].at > lines[lines.length - 1].at) lines.reverse();
    /* Y por fecha (orden estable: a la misma hora se respeta el orden de la web). */
    lines.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    /* Lo que abarca el texto (con las correcciones): al guardar, lo que sobre dentro se oculta. */
    if (lines.length) out.span = { from: lines[0].at, to: lines[lines.length - 1].at };
    var rows = [], redate = null;
    lines.forEach(function (x) {
      if (x.restore) {
        out.dropped++; out.corrections++;
        /* Hasta 4 apuntes atrás: el último en el que tenías ese nivel. */
        var k = -1;
        for (var i = rows.length - 1; i >= Math.max(0, rows.length - 5); i--) {
          if (Math.abs(rows[i].level - x.level) < 0.005) { k = i; break; }
        }
        if (k >= 0 && k < rows.length - 1) {
          var gone = rows.splice(k + 1);
          out.removed += gone.length;
          redate = gone[0].at;          /* el partido corregido es el primero que se quitó */
        } else redate = null;
        return;
      }
      var row = { at: redate || x.at, won: x.won, level: x.level };
      redate = null;
      if (rows.some(function (r) { return r.at === row.at; })) { out.duplicates++; return; }
      rows.push(row);
    });
    out.rows = rows.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
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
