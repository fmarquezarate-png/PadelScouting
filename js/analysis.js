/* ============================================================
   analysis.js · cálculos y métricas
   Regla de la casa: honestidad estadística por encima de
   precisión aparente. Con pocos datos se dice que hay pocos
   datos; no se fabrican porcentajes ni conclusiones.
   ============================================================ */
(function (global) {
  'use strict';

  var D = global.PadelData;
  var R = D.RULES;

  /* ============================================================
     1. Datos derivados de un partido
     La fuente de verdad son los sets: resultado, sets ganados y
     juegos totales se calculan, no se escriben a mano.
     ============================================================ */
  function deriveMatch(match) {
    var sets = match.sets || [];
    var setsWon = 0, setsLost = 0, totalGames = 0;

    sets.forEach(function (s, i) {
      if (typeof s.own !== 'number' || typeof s.opponent !== 'number') return;
      if (s.own > s.opponent) setsWon++; else if (s.own < s.opponent) setsLost++;
      /* El super tie-break decide el partido pero son puntos, no
         juegos: sumarlo inflaría la cuenta de juegos. */
      if (i < R.normalSets) totalGames += s.own + s.opponent;
    });

    var status = D.findById(D.MATCH_STATUS, match.status);
    var result;
    if (status && status.needsSets) {
      result = setsWon > setsLost ? 'win' : (setsLost > setsWon ? 'loss' : null);
    } else {
      result = match.result === 'win' || match.result === 'loss' ? match.result : null;
    }

    return {
      setsWon: setsWon,
      setsLost: setsLost,
      totalGames: totalGames,
      result: result,
      readGameAbsolute: absoluteReadGame(match, sets)
    };
  }

  /* Juego de lectura en términos comparables entre partidos:
     "set 2, juego 3" no equivale a "set 1, juego 3", así que se
     traduce a número de juego acumulado del partido. */
  function absoluteReadGame(match, sets) {
    if (match.readSet == null) return null;
    if (match.readSet >= 3) {
      var played = 0;
      sets.slice(0, R.normalSets).forEach(function (s) { played += (s.own || 0) + (s.opponent || 0); });
      return played + 1;
    }
    if (match.readGame == null) return null;
    var before = 0;
    for (var i = 0; i < match.readSet - 1 && i < sets.length; i++) {
      before += (sets[i].own || 0) + (sets[i].opponent || 0);
    }
    return before + match.readGame;
  }

  function decorate(match) {
    var d = deriveMatch(match);
    var out = {};
    for (var k in match) if (Object.prototype.hasOwnProperty.call(match, k)) out[k] = match[k];
    out.setsWon = d.setsWon;
    out.setsLost = d.setsLost;
    out.totalGames = d.totalGames;
    out.result = d.result;
    out.readGameAbsolute = d.readGameAbsolute;
    out.isNormal = match.status === 'normal';
    return out;
  }

  function decorateAll(matches) { return (matches || []).map(decorate); }

  /* ============================================================
     2. Tamaño de muestra
     ============================================================ */
  function sampleLevel(n) {
    if (n < R.minSample) return 'insufficient';
    if (n < R.goodSample) return 'thin';
    return 'ok';
  }

  function sampleNote(n) {
    if (n === 0) return 'Sin partidos todavía.';
    if (n < R.minSample) return 'Datos insuficientes · ' + n + (n === 1 ? ' partido' : ' partidos');
    if (n < R.goodSample) return 'Muestra corta · ' + n + ' partidos';
    return n + ' partidos';
  }

  /* ============================================================
     3. Win rate por arquetipo
     Un partido cuenta UNA vez por arquetipo aunque los dos
     rivales compartan perfil. Los WO y abandonos quedan fuera:
     no dicen nada del rival, solo ensuciarían la métrica.
     ============================================================ */
  function winRateByArchetype(matches) {
    var out = {};
    D.ARCHETYPES.forEach(function (a) {
      out[a.id] = { id: a.id, label: a.label, played: 0, won: 0, lost: 0, excluded: 0, rate: null };
    });

    matches.forEach(function (m) {
      var seen = {};
      (m.rivals || []).forEach(function (r) {
        if (r && r.archetype && out[r.archetype]) seen[r.archetype] = true;
      });
      Object.keys(seen).forEach(function (id) {
        if (!m.isNormal || !m.result) { out[id].excluded++; return; }
        out[id].played++;
        if (m.result === 'win') out[id].won++; else out[id].lost++;
      });
    });

    Object.keys(out).forEach(function (id) {
      var b = out[id];
      b.level = sampleLevel(b.played);
      b.note = sampleNote(b.played);
      b.rate = b.level === 'insufficient' ? null : Math.round(100 * b.won / b.played);
    });
    return out;
  }

  /* ============================================================
     4. Juego de lectura
     Los partidos marcados «No lo leí» no entran en la media.
     Siempre se informa sobre cuántas observaciones se usan.
     ============================================================ */
  function readingStats(matches, filterFn) {
    var pool = matches.filter(function (m) {
      return m.isNormal && (!filterFn || filterFn(m));
    });
    var withRead = pool.filter(function (m) { return m.readGameAbsolute != null; });
    var notRead = pool.length - withRead.length;
    var avg = null;
    if (withRead.length) {
      var sum = withRead.reduce(function (s, m) { return s + m.readGameAbsolute; }, 0);
      avg = sum / withRead.length;
    }
    return {
      n: withRead.length,
      notRead: notRead,
      average: avg,
      level: sampleLevel(withRead.length),
      note: sampleNote(withRead.length)
    };
  }

  function readingByArchetype(matches) {
    var out = {};
    D.ARCHETYPES.forEach(function (a) {
      out[a.id] = readingStats(matches, function (m) {
        return (m.rivals || []).some(function (r) { return r && r.archetype === a.id; });
      });
    });
    return out;
  }

  /* ============================================================
     5. Evolución temporal
     ============================================================ */
  function byMonth(matches) {
    var buckets = {};
    matches.forEach(function (m) {
      var key = (m.date || '').slice(0, 7);
      if (!key) return;
      if (!buckets[key]) buckets[key] = { key: key, matches: [], won: 0, lost: 0, special: 0, games: 0, against: 0 };
      var b = buckets[key];
      b.matches.push(m);
      if (!m.isNormal) b.special++;
      else if (m.result === 'win') b.won++;
      else if (m.result === 'loss') b.lost++;
      m.sets.slice(0, R.normalSets).forEach(function (s) {
        b.games += (s.own || 0); b.against += (s.opponent || 0);
      });
    });
    return Object.keys(buckets).sort().map(function (k) {
      var b = buckets[k];
      var read = readingStats(b.matches);
      b.readAverage = read.average;
      b.readN = read.n;
      b.gamePct = (b.games + b.against) ? Math.round(100 * b.games / (b.games + b.against)) : null;
      return b;
    });
  }

  var MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                     'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function monthLabel(key) {
    var parts = (key || '').split('-');
    if (parts.length < 2) return key;
    return MONTH_NAMES[Number(parts[1]) - 1] + ' ' + parts[0].slice(2);
  }

  /* ============================================================
     6. Frecuencias de patrones y acciones
     ============================================================ */
  function frequency(matches, field, catalog, filterFn) {
    var counts = {};
    matches.forEach(function (m) {
      if (filterFn && !filterFn(m)) return;
      (m[field] || []).forEach(function (id) {
        counts[id] = (counts[id] || 0) + 1;
      });
    });
    return Object.keys(counts).map(function (id) {
      return { id: id, label: D.labelOf(catalog, id), count: counts[id] };
    }).sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label, 'es'); });
  }

  /* Acción asociada a las derrotas contra un arquetipo concreto.
     No es una predicción: es contar cuántas veces aparece la misma
     casilla marcada cuando el resultado fue malo. */
  function lossSignal(matches, archetypeId) {
    var losses = matches.filter(function (m) {
      return m.isNormal && m.result === 'loss' &&
        (m.rivals || []).some(function (r) { return r && r.archetype === archetypeId; });
    });
    if (losses.length < R.minSample) return null;
    var freq = frequency(losses, 'notWorked', D.NOT_WORKED_OPTIONS);
    if (!freq.length) return null;
    var top = freq[0];
    /* Solo se considera señal si aparece en más de la mitad de las derrotas. */
    if (top.count * 2 <= losses.length) return null;
    return { label: top.label, id: top.id, count: top.count, losses: losses.length };
  }

  function winSignal(matches, archetypeId) {
    var wins = matches.filter(function (m) {
      return m.isNormal && m.result === 'win' &&
        (m.rivals || []).some(function (r) { return r && r.archetype === archetypeId; });
    });
    if (wins.length < R.minSample) return null;
    var freq = frequency(wins, 'worked', D.WORKED_OPTIONS);
    if (!freq.length) return null;
    var top = freq[0];
    if (top.count * 2 <= wins.length) return null;
    return { label: top.label, id: top.id, count: top.count, wins: wins.length };
  }

  /* ============================================================
     7. Resumen global
     ============================================================ */
  function summary(rawMatches) {
    var matches = decorateAll(rawMatches);
    var normal = matches.filter(function (m) { return m.isNormal && m.result; });
    var won = normal.filter(function (m) { return m.result === 'win'; }).length;
    return {
      matches: matches,
      total: matches.length,
      played: normal.length,
      won: won,
      lost: normal.length - won,
      special: matches.length - normal.length,
      winRate: normal.length ? Math.round(100 * won / normal.length) : null,
      level: sampleLevel(normal.length),
      note: sampleNote(normal.length),
      byArchetype: winRateByArchetype(matches),
      reading: readingStats(matches),
      readingByArchetype: readingByArchetype(matches),
      months: byMonth(matches),
      patterns: frequency(matches, 'patterns', D.PATTERNS),
      worked: frequency(matches, 'worked', D.WORKED_OPTIONS),
      notWorked: frequency(matches, 'notWorked', D.NOT_WORKED_OPTIONS)
    };
  }

  global.PadelAnalysis = {
    deriveMatch: deriveMatch,
    decorate: decorate,
    decorateAll: decorateAll,
    summary: summary,
    winRateByArchetype: winRateByArchetype,
    readingStats: readingStats,
    frequency: frequency,
    lossSignal: lossSignal,
    winSignal: winSignal,
    sampleLevel: sampleLevel,
    sampleNote: sampleNote,
    monthLabel: monthLabel
  };
})(window);
