/* ============================================================
   liga-parser.js · lee la clasificación de la liga
   Funciona igual en el navegador y en Node: es el mismo parser
   para la carga automática y para el pegado manual de respaldo.
   Hereda la lógica ya validada del dashboard del primer semestre.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LigaParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NORMAL_SETS = 2;

  /* Una celda de resultado: "6-3 / 6-4", "7-6 / 4-6 / 10-8" o un WO. */
  function parseScore(text) {
    if (!text) return null;
    var s = String(text).trim();
    if (s === 'WO+' || s === '0--1') return { wo: 1 };
    if (s === 'WO-' || s === '-1-0') return { wo: -1 };
    var parts = s.split('/').map(function (x) { return x.trim(); }).filter(Boolean);
    if (!parts.length) return null;
    var sets = [];
    for (var i = 0; i < parts.length; i++) {
      var m = parts[i].match(/^(\d+)\s*-\s*(\d+)$/);
      if (!m) return null;
      sets.push([Number(m[1]), Number(m[2])]);
    }
    return { sets: sets };
  }

  /* El tercer set es super tie-break, no un set normal. */
  function isSuperTieBreak(sets) {
    return sets.length === 3 && Math.max(sets[2][0], sets[2][1]) >= 8;
  }

  function tally(sets) {
    var setsFor = 0, setsAgainst = 0, gamesFor = 0, gamesAgainst = 0;
    sets.forEach(function (s, i) {
      if (s[0] > s[1]) setsFor++; else if (s[1] > s[0]) setsAgainst++;
      /* Los puntos del super tie-break no son juegos. */
      if (i < NORMAL_SETS) { gamesFor += s[0]; gamesAgainst += s[1]; }
    });
    return { setsFor: setsFor, setsAgainst: setsAgainst, gamesFor: gamesFor, gamesAgainst: gamesAgainst };
  }

  /* Divide "Francisco /Cristian C" en sus dos jugadores. La web de
     la liga corta los nombres, así que se guardan tal cual vienen:
     son la única forma estable de reconocer a una persona. */
  function splitTeam(label) {
    var parts = String(label).split('/');
    return {
      a: (parts[0] || '').trim(),
      b: (parts.slice(1).join('/') || '').trim()
    };
  }

  function parse(text) {
    var months = [], warnings = [];
    var month = null, group = null;

    String(text).split(/\r?\n/).forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      var mm = line.trim().match(/^MES\s+(\d+)$/i);
      if (mm) { month = { n: Number(mm[1]), groups: [] }; months.push(month); group = null; return; }

      var gm = line.trim().match(/^Grupo\s+(\d+)$/i);
      if (gm) {
        if (!month) { month = { n: months.length + 1, groups: [] }; months.push(month); }
        group = { n: Number(gm[1]), teams: [], order: [], grid: {} };
        month.groups.push(group);
        return;
      }
      if (!line.trim() || !group) return;

      var cells = line.split('\t').map(function (c) { return c.trim(); });

      if (!group.teams.length) {
        var ei = cells.findIndex(function (c) { return /^Equipo$/i.test(c); });
        if (ei >= 0) { group.teams = cells.slice(ei + 1).filter(function (c) { return c.length; }); return; }
        var cand = cells.filter(function (c) { return c.indexOf('/') >= 0; });
        if (cand.length >= 2) group.teams = cand;
        return;
      }

      var oi = -1;
      for (var i = 0; i < cells.length; i++) {
        if (group.teams.indexOf(cells[i]) >= 0) { oi = i; break; }
      }
      if (oi < 0) return;                       // fila de ruido (aplazados, notas)

      var owner = cells[oi], results = cells.slice(oi + 1);
      if (group.order.indexOf(owner) < 0) group.order.push(owner);
      group.teams.forEach(function (t, j) { group.grid[owner + '||' + t] = results[j] || ''; });
    });

    /* Cada enfrentamiento aparece dos veces en la tabla; se queda uno. */
    var matches = [];
    months.forEach(function (M) {
      M.groups.forEach(function (G) {
        for (var i = 0; i < G.teams.length; i++) {
          for (var j = i + 1; j < G.teams.length; j++) {
            var A = G.teams[i], B = G.teams[j];
            var pa = parseScore(G.grid[A + '||' + B]);
            var pb = parseScore(G.grid[B + '||' + A]);

            var sets = null, walkover = null;
            if (pa && pa.sets) sets = pa.sets;
            else if (pb && pb.sets) sets = pb.sets.map(function (s) { return [s[1], s[0]]; });
            else if (pa && pa.wo) walkover = pa.wo > 0 ? 'home' : 'away';
            else if (pb && pb.wo) walkover = pb.wo > 0 ? 'away' : 'home';

            if (!sets && !walkover) continue;   // partido aún no jugado

            if (pa && pa.sets && pb && pb.sets) {
              var x = tally(pa.sets);
              var y = tally(pb.sets.map(function (s) { return [s[1], s[0]]; }));
              if (x.setsFor !== y.setsFor || x.setsAgainst !== y.setsAgainst) {
                warnings.push('Mes ' + M.n + ' grupo ' + G.n + ': ' + A + ' vs ' + B + ' no cuadra entre las dos filas');
              }
            }

            var t = sets ? tally(sets) : null;
            matches.push({
              month: M.n, group: G.n, home: A, away: B,
              sets: sets, walkover: walkover,
              superTieBreak: sets ? isSuperTieBreak(sets) : false,
              setsHome: t ? t.setsFor : (walkover === 'home' ? 1 : 0),
              setsAway: t ? t.setsAgainst : (walkover === 'away' ? 1 : 0),
              gamesHome: t ? t.gamesFor : 0,
              gamesAway: t ? t.gamesAgainst : 0
            });
          }
        }
      });
    });

    var teams = {};
    months.forEach(function (M) {
      M.groups.forEach(function (G) { G.teams.forEach(function (t) { teams[t] = true; }); });
    });

    return { months: months, matches: matches, teams: Object.keys(teams), warnings: warnings };
  }

  return { parse: parse, parseScore: parseScore, splitTeam: splitTeam, tally: tally, isSuperTieBreak: isSuperTieBreak };
});
