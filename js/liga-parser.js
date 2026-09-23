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

  /* Las dos ligas escriben el mes distinto: la masculina pone "MES 3" y
     la mixta el nombre del mes. Se aceptan las dos, en castellano y en
     catalán, con o sin acento. */
  var MONTH_NAMES = [
    ['enero', 'gener'], ['febrero', 'febrer'], ['marzo', 'marc', 'març'],
    ['abril'], ['mayo', 'maig'], ['junio', 'juny'], ['julio', 'juliol'],
    ['agosto', 'agost'], ['septiembre', 'setembre', 'setiembre'],
    ['octubre'], ['noviembre', 'novembre'], ['diciembre', 'desembre']
  ];

  function normalize(text) {
    return String(text).trim().toLowerCase()
      .normalize ? String(text).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                 : String(text).trim().toLowerCase();
  }

  /* Devuelve 1..12 si la línea es el nombre de un mes, o null. */
  function monthFromName(line) {
    var n = normalize(line);
    if (!n || n.indexOf('\t') >= 0) return null;
    for (var i = 0; i < MONTH_NAMES.length; i++) {
      if (MONTH_NAMES[i].indexOf(n) >= 0) return i + 1;
    }
    return null;
  }

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

  /* La liga corta los nombres a 10 caracteres. Cuando el mismo jugador
     aparece completo en unas jornadas y recortado en otras, hay que
     reconocerlo o acabaría duplicado.

     Regla deliberadamente estricta: solo se unifican si el nombre corto
     mide EXACTAMENTE el ancho de corte y es el principio del largo.
     Así "Carla Caye" se une a "Carla Cayero", pero "Jaume Bal" (9, o sea
     un nombre completo) NO se une a "Jaume Bale": serían dos personas
     distintas y no se adivina. Lo que no se une, se informa. */
  var TRUNCATED_AT = 10;

  function buildAliases(names) {
    var canonical = {}, aliases = [];
    var sorted = names.slice().sort(function (a, b) { return b.length - a.length; });
    sorted.forEach(function (long) {
      var nLong = normalize(long);
      sorted.forEach(function (short) {
        if (short === long) return;
        if (short.length !== TRUNCATED_AT) return;
        if (canonical[short]) return;
        var nShort = normalize(short);
        if (nShort.length >= nLong.length) return;
        if (nLong.indexOf(nShort) !== 0) return;
        canonical[short] = long;
        aliases.push({ from: short, to: long });
      });
    });
    return { canonical: canonical, aliases: aliases };
  }

  /* Jugadores que se parecen pero NO se unifican: se avisa para que lo
     mire una persona, en vez de decidirlo el programa. */
  function suspiciousPairs(names) {
    var out = [];
    names.forEach(function (a) {
      names.forEach(function (b) {
        if (a === b || a.length === TRUNCATED_AT) return;
        var na = normalize(a), nb = normalize(b);
        if (na.length >= nb.length) return;
        if (na.length < 6) return;
        if (nb.indexOf(na) === 0) out.push({ shorter: a, longer: b });
      });
    });
    return out;
  }

  /* Nombres del texto que se van a enlazar con gente que YA está en la
     base (el mismo jugador recortado en una liga y completo en otra).
     Se calcula antes de guardar para poder enseñarlo y que lo revise
     una persona: unir dos nombres es una decisión, no un detalle. */
  function mergesAgainstKnown(names, knownNames) {
    var out = [];
    (names || []).forEach(function (incoming) {
      var nIn = normalize(incoming);
      (knownNames || []).forEach(function (known) {
        if (known === incoming) return;
        var nKn = normalize(known);
        if (nIn === nKn) return;
        if (known.length === TRUNCATED_AT && nIn.indexOf(nKn) === 0 && nIn.length > nKn.length) {
          out.push({ incoming: incoming, existing: known, keeps: incoming });
        } else if (incoming.length === TRUNCATED_AT && nKn.indexOf(nIn) === 0 && nKn.length > nIn.length) {
          out.push({ incoming: incoming, existing: known, keeps: known });
        }
      });
    });
    return out;
  }

  function playerNames(parsed) {
    var names = {};
    (parsed.teams || []).forEach(function (label) {
      var p = splitTeam(label);
      if (p.a) names[p.a] = true;
      if (p.b) names[p.b] = true;
    });
    return Object.keys(names);
  }

  function parse(text) {
    var months = [], warnings = [];
    var month = null, group = null;

    String(text).split(/\r?\n/).forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      var mm = line.trim().match(/^MES\s+(\d+)$/i);
      if (mm) {
        month = { n: Number(mm[1]), label: null, groups: [] };
        months.push(month); group = null; return;
      }

      /* Mes escrito con su nombre: se numera por orden de aparición, que
         es el orden real de la temporada, y se guarda el nombre tal cual. */
      var calendar = monthFromName(line);
      if (calendar) {
        month = { n: months.length + 1, label: line.trim(), calendar: calendar, groups: [] };
        months.push(month); group = null; return;
      }

      var gm = line.trim().match(/^Grupo\s+(\d+)$/i);
      if (gm) {
        if (!month) { month = { n: months.length + 1, label: null, groups: [] }; months.push(month); }
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
    var teamLabels = Object.keys(teams);

    /* Unificación de nombres recortados. */
    var names = {};
    teamLabels.forEach(function (label) {
      var p = splitTeam(label);
      if (p.a) names[p.a] = true;
      if (p.b) names[p.b] = true;
    });
    var nameList = Object.keys(names);
    var al = buildAliases(nameList);

    function canonTeam(label) {
      var p = splitTeam(label);
      var a = al.canonical[p.a] || p.a;
      var b = al.canonical[p.b] || p.b;
      /* Si nada cambió se respeta la etiqueta original tal cual venía:
         reescribirla crearía parejas nuevas al recargar lo ya guardado. */
      if (a === p.a && b === p.b) return label;
      return a + '/' + b;
    }

    if (al.aliases.length) {
      teamLabels = teamLabels.map(canonTeam).filter(function (v, i, arr) {
        return arr.indexOf(v) === i;
      });
      matches.forEach(function (m) { m.home = canonTeam(m.home); m.away = canonTeam(m.away); });
      months.forEach(function (M) {
        M.groups.forEach(function (G) {
          G.teams = G.teams.map(canonTeam);
          G.order = G.order.map(canonTeam);
        });
      });
    }

    return {
      months: months, matches: matches, teams: teamLabels, warnings: warnings,
      aliases: al.aliases,
      suspicious: suspiciousPairs(nameList)
    };
  }

  /* Convierte lo leído en el paquete que espera ingest_league().
     Vive aquí porque es la forma de la liga, no de la pantalla: el
     bookmarklet que cargue el mes desde la web usará esto mismo. */
  function toPayload(parsed, season, rawText) {
    var groups = [];
    var seen = {};
    parsed.months.forEach(function (M) {
      M.groups.forEach(function (G) {
        var key = M.n + ':' + G.n;
        if (!seen[key]) { seen[key] = true; groups.push([M.n, G.n]); }
      });
    });

    var standings = [];
    parsed.months.forEach(function (M) {
      M.groups.forEach(function (G) {
        (G.order.length ? G.order : G.teams).forEach(function (t, i) {
          standings.push([M.n, G.n, t, i + 1]);
        });
      });
    });

    var teams = parsed.teams.map(function (label) {
      var p = splitTeam(label);
      return [label, p.a, p.b];
    });

    var months = parsed.months.map(function (M) {
      var label = M.label ||
        (season && season.monthLabels && season.monthLabels[M.n]) ||
        ('Mes ' + M.n);
      return [M.n, label];
    }).sort(function (a, b) { return a[0] - b[0]; });

    return {
      season: {
        slug: season.slug, name: season.name,
        kind: season.kind || 'masculina', startsOn: season.startsOn || null
      },
      months: months, groups: groups, teams: teams, standings: standings,
      matches: parsed.matches.map(function (m) {
        return [m.month, m.group, m.home, m.away, m.sets, m.walkover];
      }),
      source: season.source || 'paste',
      rawText: rawText || ''
    };
  }

  return { parse: parse, parseScore: parseScore, splitTeam: splitTeam, tally: tally,
           isSuperTieBreak: isSuperTieBreak, toPayload: toPayload,
           monthFromName: monthFromName, normalize: normalize,
           mergesAgainstKnown: mergesAgainstKnown, playerNames: playerNames };
});
