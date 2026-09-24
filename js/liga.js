/* ============================================================
   liga.js · motor de la liga
   Capas, heredadas de la estructura del motor predictivo:
     1. Fuerzas      → rating por pareja
     2. Distribución → probabilidad de ganar un juego
     3. Simulación   → matriz de marcadores (Monte Carlo)
     4. Derivados    → TODO sale de la misma matriz
     5. Calibración  → el acierto se mide contra los partidos ya jugados
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Liga = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CFG = {
    groupsPerMonth: 18,
    stepPerGroup: 30,     // distancia de rating entre grupos consecutivos
    baseRating: 1500,
    k: 30,
    superTieBreakTarget: 10,
    simulations: 4000
  };

  /* ---------- utilidades de marcador ---------- */

  function tally(sets) {
    var sf = 0, sa = 0, gf = 0, ga = 0;
    sets.forEach(function (s, i) {
      if (s[0] > s[1]) sf++; else if (s[1] > s[0]) sa++;
      if (i < 2) { gf += s[0]; ga += s[1]; }   // el super TB no son juegos
    });
    return { setsFor: sf, setsAgainst: sa, gamesFor: gf, gamesAgainst: ga };
  }

  /* ============================================================
     Modelo
     ============================================================ */
  function build(snapshot) {
    var teams = {}, order = [];
    snapshot.teams.forEach(function (t) {
      teams[t[0]] = { id: t[0], label: t[1], playerA: t[2], playerB: t[3], isMine: !!t[4],
                      firstGroup: null, rating: null, history: [], matches: [] };
      order.push(t[0]);
    });

    var months = snapshot.months.map(function (m) { return { n: m[0], label: m[1] }; })
      .sort(function (a, b) { return a.n - b.n; });

    /* Escalera real de la liga: equipos en los grupos de arriba + puesto en el grupo. */
    var ladder = {};          // ladder[month][teamId] = {group, inGroup, place, total}
    var groupSize = {};
    snapshot.standings.forEach(function (s) {
      var m = s[0], g = s[1];
      groupSize[m] = groupSize[m] || {};
      groupSize[m][g] = (groupSize[m][g] || 0) + 1;
    });
    snapshot.standings.forEach(function (s) {
      var m = s[0], g = s[1], id = s[2], pos = s[3];
      var above = 0, total = 0;
      Object.keys(groupSize[m]).forEach(function (k) {
        var n = groupSize[m][k];
        total += n;
        if (Number(k) < g) above += n;
      });
      ladder[m] = ladder[m] || {};
      ladder[m][id] = { group: g, inGroup: pos, place: above + pos, total: total };
      if (teams[id] && teams[id].firstGroup === null) teams[id].firstGroup = g;
    });

    /* El grupo de entrada ancla el rating: un grupo 3 no empieza como un grupo 17. */
    order.forEach(function (id) {
      var g = teams[id].firstGroup == null ? 9.5 : teams[id].firstGroup;
      teams[id].rating = CFG.baseRating + (9.5 - g) * CFG.stepPerGroup;
    });

    /* Partidos en orden cronológico: mes, grupo, orden de aparición. */
    var matches = snapshot.matches.map(function (m, i) {
      var sets = m[4], wo = m[5];
      var t = sets ? tally(sets) : null;
      return {
        idx: i, month: m[0], group: m[1], home: m[2], away: m[3],
        sets: sets, walkover: wo,
        provisional: !!m[6],      /* resultado apuntado por ti, aún no publicado por la liga */
        superTieBreak: !!(sets && sets.length === 3),
        setsHome: t ? t.setsFor : (wo === 'home' ? 1 : 0),
        setsAway: t ? t.setsAgainst : (wo === 'away' ? 1 : 0),
        gamesHome: t ? t.gamesFor : 0,
        gamesAway: t ? t.gamesAgainst : 0,
        homeWon: t ? t.setsFor > t.setsAgainst : wo === 'home'
      };
    }).sort(function (a, b) { return a.month - b.month || a.group - b.group || a.idx - b.idx; });

    /* --- Capa 1: rating partido a partido --- */
    matches.forEach(function (m) {
      var A = teams[m.home], B = teams[m.away];
      if (!A || !B) return;
      m.preHome = A.rating; m.preAway = B.rating;
      m.ratingDiff = A.rating - B.rating;
      /* Los WO no dicen nada del nivel de nadie: no mueven el rating. */
      if (!m.walkover) {
        var exp = 1 / (1 + Math.pow(10, (B.rating - A.rating) / 400));
        var margin = Math.max(0.6, Math.min(1.6,
          Math.log(Math.abs(m.gamesHome - m.gamesAway) + 1) / Math.log(7)));
        var delta = CFG.k * margin * ((m.homeWon ? 1 : 0) - exp);
        A.rating += delta; B.rating -= delta;
      }
      m.postHome = A.rating; m.postAway = B.rating;
      A.matches.push(m); B.matches.push(m);
      A.history.push({ month: m.month, rating: A.rating });
      B.history.push({ month: m.month, rating: B.rating });
    });

    var lastMonth = months.length ? months[months.length - 1].n : null;
    var mine = order.filter(function (id) { return teams[id].isMine; })[0] || null;

    return {
      cfg: CFG, teams: teams, order: order, months: months, matches: matches,
      ladder: ladder, lastMonth: lastMonth, myTeamId: mine,
      season: snapshot.season || null
    };
  }

  /* ============================================================
     Lectura de una pareja
     ============================================================ */
  function teamStats(model, id) {
    var t = model.teams[id];
    if (!t) return null;
    var played = t.matches.filter(function (m) { return !m.walkover; });
    var won = 0, lost = 0, gf = 0, ga = 0, stb = 0, stbWon = 0;
    played.forEach(function (m) {
      var home = m.home === id;
      var win = home ? m.homeWon : !m.homeWon;
      if (win) won++; else lost++;
      gf += home ? m.gamesHome : m.gamesAway;
      ga += home ? m.gamesAway : m.gamesHome;
      if (m.superTieBreak) { stb++; if (win) stbWon++; }
    });
    var wo = t.matches.filter(function (m) { return !!m.walkover; }).length;

    var byMonth = model.months.map(function (mo) {
      var l = model.ladder[mo.n] && model.ladder[mo.n][id];
      var ms = played.filter(function (m) { return m.month === mo.n; });
      var w = ms.filter(function (m) { return (m.home === id) === m.homeWon; }).length;
      return {
        month: mo.n, label: mo.label,
        group: l ? l.group : null, inGroup: l ? l.inGroup : null,
        place: l ? l.place : null, total: l ? l.total : null,
        played: ms.length, won: w, lost: ms.length - w
      };
    }).filter(function (x) { return x.group !== null || x.played > 0; });

    var present = byMonth.filter(function (x) { return x.group !== null; });
    var first = present[0] || null, last = present[present.length - 1] || null;

    /* Forma: últimos 5 partidos jugados, del más reciente al más antiguo. */
    var form = played.slice(-5).reverse().map(function (m) {
      return (m.home === id) === m.homeWon ? 'V' : 'D';
    });

    return {
      id: id, label: t.label, playerA: t.playerA, playerB: t.playerB, isMine: t.isMine,
      rating: t.rating, played: played.length, won: won, lost: lost, walkovers: wo,
      gamesFor: gf, gamesAgainst: ga,
      gamePct: (gf + ga) ? 100 * gf / (gf + ga) : null,
      superTieBreaks: stb, superTieBreaksWon: stbWon,
      byMonth: byMonth, first: first, last: last, form: form,
      climb: (first && last) ? first.group - last.group : null
    };
  }

  /* Otras parejas de un mismo jugador. En esta liga la gente cambia de
     compañero entre meses: la pareja de enfrente puede ser nueva, pero
     el jugador no. */
  function playerTeams(model, playerLabel, excludeTeamId) {
    return model.order.filter(function (id) {
      var t = model.teams[id];
      return id !== excludeTeamId && (t.playerA === playerLabel || t.playerB === playerLabel);
    }).map(function (id) {
      var t = model.teams[id];
      return {
        id: id, label: t.label,
        partner: t.playerA === playerLabel ? t.playerB : t.playerA,
        months: t.matches.map(function (m) { return m.month; })
          .filter(function (v, i, a) { return a.indexOf(v) === i; }).sort()
      };
    });
  }

  function headToHead(model, aId, bId) {
    var list = model.matches.filter(function (m) {
      return (m.home === aId && m.away === bId) || (m.home === bId && m.away === aId);
    });
    var aWon = list.filter(function (m) { return (m.home === aId) === m.homeWon; }).length;
    return {
      played: list.length,
      aWon: aWon, bWon: list.length - aWon,
      matches: list.map(function (m) {
        var aHome = m.home === aId;
        return {
          month: m.month, group: m.group, walkover: m.walkover,
          superTieBreak: m.superTieBreak,
          sets: m.sets ? (aHome ? m.sets : m.sets.map(function (s) { return [s[1], s[0]]; })) : null,
          aWon: aHome === m.homeWon
        };
      })
    };
  }

  /* ============================================================
     Capa 2 y 3: de la diferencia de rating a la matriz de marcadores
     ============================================================ */

  /* Probabilidad de ganar un juego suelto. La escala se ajusta con los
     partidos reales (ver calibrate), no se elige a ojo. */
  function gameProbability(diff, scale) {
    return 1 / (1 + Math.pow(10, -diff / (scale || 900)));
  }

  function playSet(p, rnd) {
    var a = 0, b = 0;
    while (true) {
      if (rnd() < p) a++; else b++;
      if (a >= 6 && a - b >= 2) return [a, b];
      if (b >= 6 && b - a >= 2) return [a, b];
      if (a === 7 || b === 7) return [a, b];      // 7-5 y 7-6 (tie-break)
      if (a === 6 && b === 6) {                    // tie-break del set
        if (rnd() < p) return [7, 6];
        return [6, 7];
      }
    }
  }

  function playSuperTieBreak(p, rnd) {
    var a = 0, b = 0;
    while (a < CFG.superTieBreakTarget && b < CFG.superTieBreakTarget) {
      if (rnd() < p) a++; else b++;
    }
    return [a, b];
  }

  /* Semilla fija: dos visitas a la misma pantalla dan el mismo número. */
  function seeded(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* Matriz de marcadores. De aquí sale TODO lo que se muestra:
     probabilidad de ganar, marcador más probable y juegos esperados.
     Nunca se calcula un dato por un lado y otro por otro. */
  function project(model, aId, bId, options) {
    var opts = options || {};
    var a = model.teams[aId], b = model.teams[bId];
    if (!a || !b) return null;
    var diff = (a.rating - b.rating) + (opts.boost || 0);
    var scale = opts.scale || model.scale || 900;
    var p = gameProbability(diff, scale);
    var n = opts.simulations || CFG.simulations;
    var rnd = seeded(aId * 7919 + bId * 104729 + Math.round(diff));

    var scores = {}, wins = 0, threeSets = 0, gamesA = 0, gamesB = 0;
    var outcome = { '2-0': 0, '2-1': 0, '1-2': 0, '0-2': 0 };
    for (var i = 0; i < n; i++) {
      var s1 = playSet(p, rnd), s2 = playSet(p, rnd);
      var aSets = (s1[0] > s1[1] ? 1 : 0) + (s2[0] > s2[1] ? 1 : 0);
      var sets = [s1, s2];
      if (aSets === 1) {
        var stb = playSuperTieBreak(p, rnd);
        sets.push(stb);
        aSets += stb[0] > stb[1] ? 1 : 0;
        threeSets++;
      }
      if (aSets === 2) wins++;
      outcome[aSets + '-' + (sets.length - aSets)]++;
      gamesA += s1[0] + s2[0];
      gamesB += s1[1] + s2[1];
      var key = sets.map(function (s) { return s[0] + '-' + s[1]; }).join(' ');
      scores[key] = (scores[key] || 0) + 1;
    }

    var top = Object.keys(scores).map(function (k) {
      return { score: k, p: scores[k] / n };
    }).sort(function (x, y) { return y.p - x.p; });

    return {
      ratingDiff: diff,
      gameProbability: p,
      winProbability: wins / n,
      threeSetProbability: threeSets / n,
      expectedGamesFor: gamesA / n,
      expectedGamesAgainst: gamesB / n,
      topScores: top.slice(0, 5),
      /* Todo sale de la misma simulación: la probabilidad de ganar es la
         suma de 2-0 y 2-1, nunca un cálculo aparte. */
      setOutcomes: [
        { label: '2-0', p: outcome['2-0'] / n },
        { label: '2-1', p: outcome['2-1'] / n },
        { label: '1-2', p: outcome['1-2'] / n },
        { label: '0-2', p: outcome['0-2'] / n }
      ],
      simulations: n
    };
  }

  /* ============================================================
     Capa 4b: el grupo del mes (subidas, bajadas y simulación)
     ============================================================ */

  /* Cuántos grupos se mueve cada puesto, sacado del histórico de 2026:
     masculino (grupos de 4) 1.º sube 2, 2.º sube 1, 3.º baja 1, 4.º baja 2
     (~92 % de los casos); mixto (grupos de 3) 1.º sube 1, 2.º se queda,
     3.º baja 1 (~88 %). Negativo = sube (grupo de número menor). */
  var MOVES = {
    masculina: { 3: [-1, 0, 1], 4: [-2, -1, 1, 2], 5: [-2, -1, 0, 0, 1] },
    mixta: { 2: [-1, 1], 3: [-1, 0, 1], 4: [-1, 0, 0, 1] }
  };

  function movesFor(kind, size) {
    var t = MOVES[kind === 'mixta' ? 'mixta' : 'masculina'];
    if (t[size]) return t[size];
    var out = [];
    for (var i = 0; i < size; i++) out.push(i < size / 2 - 0.5 ? -1 : (i > size / 2 - 0.5 ? 1 : 0));
    return out;
  }

  /* Grupo previsto del mes siguiente para cada pareja, con las reglas de arriba. */
  function predictGroups(model, kind, month) {
    var m = month == null ? model.lastMonth : month;
    var lad = model.ladder[m] || {};
    var size = {}, maxG = 1;
    Object.keys(lad).forEach(function (id) {
      var g = lad[id].group;
      size[g] = (size[g] || 0) + 1;
      if (g > maxG) maxG = g;
    });
    var out = {};
    Object.keys(lad).forEach(function (id) {
      var l = lad[id], mv = movesFor(kind, size[l.group])[l.inGroup - 1] || 0;
      out[id] = Math.max(1, Math.min(maxG, l.group + mv));
    });
    return out;
  }

  /* Tus rivales previstos: quienes caen en tu mismo grupo previsto. Si
     sobran o faltan, se ordena por cercanía en la escalera actual. */
  function suggestRivals(model, myId, kind) {
    var pred = predictGroups(model, kind);
    var mine = pred[myId];
    if (mine == null) return { group: null, rivals: [] };
    var lad = model.ladder[model.lastMonth] || {};
    var want = kind === 'mixta' ? 2 : 3;
    var myPlace = lad[myId] ? lad[myId].place : 0;
    var cand = Object.keys(pred).map(Number).filter(function (id) { return id !== myId; })
      .map(function (id) {
        return { id: id, exact: pred[id] === mine, dist: Math.abs(pred[id] - mine) * 100 +
          Math.abs((lad[id] ? lad[id].place : 999) - myPlace) };
      }).sort(function (a, b) { return a.dist - b.dist; });
    var exact = cand.filter(function (c) { return c.exact; });
    var list = (exact.length >= want ? exact : cand).slice(0, want);
    return { group: mine, rivals: list.map(function (c) { return c.id; }), exactCount: exact.length };
  }

  /* Puntos de la liga: victoria 4; derrota en super tie-break 2; en dos
     sets 1; WO perdido 0 (sale de las columnas de la clasificación). */
  function pointsFor(setsWon, setsLost, wo) {
    if (wo) return setsWon > setsLost ? 4 : 0;
    if (setsWon > setsLost) return 4;
    return setsWon === 1 ? 2 : 1;
  }

  /* Simula el grupo entero: los partidos ya jugados cuentan tal cual y el
     resto se juega con el motor. Devuelve en qué puesto acabas y, con las
     reglas de la competición, si subes, te mantienes o bajas. */
  function groupOutlook(model, members, known, kind, options) {
    var opts = options || {};
    var n = opts.simulations || 3000;
    var me = members[0];
    var pairs = [];
    for (var i = 0; i < members.length; i++) {
      for (var j = i + 1; j < members.length; j++) {
        var a = members[i], b = members[j];
        var k = (known || []).filter(function (x) {
          return (x.a === a && x.b === b) || (x.a === b && x.b === a);
        })[0];
        var res = null;
        if (k) res = k.a === a ? k : { a: a, b: b, sa: k.sb, sb: k.sa, wo: k.wo };
        var dist = null;
        if (!res) {
          var pr = project(model, a, b, { simulations: 1500, scale: model.scale });
          dist = pr ? pr.setOutcomes.map(function (o) { return o.p; }) : [0.25, 0.25, 0.25, 0.25];
        }
        pairs.push({ a: a, b: b, res: res, dist: dist });
      }
    }
    var rnd = seeded(members.reduce(function (s, x) { return s * 31 + x; }, 7) % 2147483647);
    var place = members.map(function () { return 0; });
    for (var it = 0; it < n; it++) {
      var pts = {};
      members.forEach(function (x) { pts[x] = rnd() * 0.01; });   /* desempate al azar */
      pairs.forEach(function (p) {
        var sa, sb, wo = false;
        if (p.res) { sa = p.res.sa; sb = p.res.sb; wo = !!p.res.wo; }
        else {
          var r = rnd(), acc = 0, pick = 3;
          for (var q = 0; q < 4; q++) { acc += p.dist[q]; if (r < acc) { pick = q; break; } }
          sa = [2, 2, 1, 0][pick]; sb = [0, 1, 2, 2][pick];
        }
        pts[p.a] += pointsFor(sa, sb, wo);
        pts[p.b] += pointsFor(sb, sa, wo);
      });
      var rank = members.slice().sort(function (x, y) { return pts[y] - pts[x]; });
      place[rank.indexOf(me)]++;
    }
    var mv = movesFor(kind, members.length);
    var up = 0, stay = 0, down = 0;
    place.forEach(function (c, i) {
      if (mv[i] < 0) up += c; else if (mv[i] > 0) down += c; else stay += c;
    });
    return {
      places: place.map(function (c) { return c / n; }),
      up: up / n, stay: stay / n, down: down / n,
      moves: mv, remaining: pairs.filter(function (p) { return !p.res; }).length
    };
  }

  /* Tabla de un grupo con los resultados que se saben (oficiales o tuyos).
     known: [{a, b, sa, sb, wo, prov}] con sa/sb = sets de cada uno. */
  function groupTable(members, known) {
    var row = {};
    members.forEach(function (id) { row[id] = { id: id, pj: 0, g: 0, p: 0, sf: 0, sc: 0, pts: 0, prov: false }; });
    (known || []).forEach(function (k) {
      var A = row[k.a], B = row[k.b];
      if (!A || !B) return;
      var aWon = k.sa > k.sb;
      A.pj++; B.pj++;
      if (aWon) { A.g++; B.p++; } else { B.g++; A.p++; }
      if (!k.wo) { A.sf += k.sa; A.sc += k.sb; B.sf += k.sb; B.sc += k.sa; }
      A.pts += pointsFor(k.sa, k.sb, k.wo); B.pts += pointsFor(k.sb, k.sa, k.wo);
      if (k.prov) { A.prov = true; B.prov = true; }
    });
    return members.map(function (id) { return row[id]; }).sort(function (x, y) {
      return y.pts - x.pts || (y.sf - y.sc) - (x.sf - x.sc) || y.g - x.g;
    });
  }

  /* «Cómo se cocina el próximo mes»: se juega lo que queda de TODOS los grupos
     del mes (lo ya jugado cuenta tal cual) y se aplican las subidas y bajadas.
     Devuelve en qué grupo caes y con qué probabilidad te toca cada pareja. */
  function nextMonthOutlook(model, month, kind, me, extraKnown, options) {
    var opts = options || {};
    var n = opts.simulations || 1200;
    var lad = model.ladder[month] || {};
    var groups = {}, maxG = 1;
    Object.keys(lad).forEach(function (id) {
      var g = lad[id].group;
      (groups[g] = groups[g] || []).push(Number(id));
      if (g > maxG) maxG = g;
    });
    if (!groups[lad[me] && lad[me].group]) return null;
    var key = function (a, b) { return Math.min(a, b) + '-' + Math.max(a, b); };
    var known = {};
    model.matches.forEach(function (x) {
      if (x.month !== month) return;
      known[key(x.home, x.away)] = { a: x.home, b: x.away, sa: x.setsHome, sb: x.setsAway, wo: !!x.walkover };
    });
    (extraKnown || []).forEach(function (k) { if (!known[key(k.a, k.b)]) known[key(k.a, k.b)] = k; });

    /* Por grupo: los pares y, para los que faltan, la distribución 2-0/2-1/1-2/0-2. */
    var plan = Object.keys(groups).map(function (g) {
      var ms = groups[g].slice().sort(function (a, b) { return lad[a].inGroup - lad[b].inGroup; });
      var pairs = [];
      for (var i = 0; i < ms.length; i++) for (var j = i + 1; j < ms.length; j++) {
        var k = known[key(ms[i], ms[j])], dist = null;
        if (!k) {
          var pr = project(model, ms[i], ms[j], { simulations: 600, scale: model.scale });
          dist = pr ? pr.setOutcomes.map(function (o) { return o.p; }) : [0.25, 0.25, 0.25, 0.25];
        }
        pairs.push({ a: ms[i], b: ms[j], k: k, dist: dist });
      }
      return { g: Number(g), members: ms, pairs: pairs, moves: movesFor(kind, ms.length) };
    });

    var rnd = seeded((me * 2654435761) % 2147483647 || 7);
    var myG = {}, together = {};
    for (var it = 0; it < n; it++) {
      var dest = {};
      plan.forEach(function (G) {
        var pts = {};
        G.members.forEach(function (x) { pts[x] = rnd() * 0.01; });
        G.pairs.forEach(function (p) {
          var sa, sb, wo = false;
          if (p.k) {
            if (p.k.a === p.a) { sa = p.k.sa; sb = p.k.sb; } else { sa = p.k.sb; sb = p.k.sa; }
            wo = !!p.k.wo;
          } else {
            var r = rnd(), acc = 0, pick = 3;
            for (var q = 0; q < 4; q++) { acc += p.dist[q]; if (r < acc) { pick = q; break; } }
            sa = [2, 2, 1, 0][pick]; sb = [0, 1, 2, 2][pick];
          }
          pts[p.a] += pointsFor(sa, sb, wo); pts[p.b] += pointsFor(sb, sa, wo);
        });
        G.members.slice().sort(function (x, y) { return pts[y] - pts[x]; }).forEach(function (id, pos) {
          dest[id] = Math.max(1, Math.min(maxG, G.g + (G.moves[pos] || 0)));
        });
      });
      var mine = dest[me];
      myG[mine] = (myG[mine] || 0) + 1;
      Object.keys(dest).forEach(function (id) {
        if (+id !== me && dest[id] === mine) together[id] = (together[id] || 0) + 1;
      });
    }
    return {
      groups: Object.keys(myG).map(function (g) { return { group: +g, p: myG[g] / n }; })
        .sort(function (a, b) { return b.p - a.p; }),
      rivals: Object.keys(together).map(function (id) { return { id: +id, p: together[id] / n }; })
        .sort(function (a, b) { return b.p - a.p; }),
      simulations: n
    };
  }

  /* ============================================================
     Capa 5: calibración contra los partidos ya jugados
     ============================================================ */

  /* Busca la escala que mejor explica los resultados reales y devuelve
     cómo de bien acierta.

     Importante: la clasificación de la liga lista primero al equipo que
     acabó más arriba en el grupo, así que "el primero de la fila" gana el
     89% de los partidos. Ese dato NO mide nada: el orden ya depende del
     resultado. La calibración se hace en orientación neutra, preguntando
     si gana el favorito por rating, que es lo único que se sabe antes de
     jugar. */
  function calibrate(model) {
    var played = model.matches.filter(function (m) { return !m.walkover; });
    var usable = played.filter(function (m) { return Math.abs(m.ratingDiff) >= 1; });

    function score(scale) {
      var loss = 0;
      usable.forEach(function (m) {
        var pm = matchFromGame(gameProbability(Math.abs(m.ratingDiff), scale));
        var favWon = (m.ratingDiff > 0) === m.homeWon;
        var y = favWon ? 1 : 0;
        loss += Math.pow(pm - y, 2);
      });
      return loss / (usable.length || 1);
    }

    var best = null;
    for (var scale = 200; scale <= 2500; scale += 25) {
      var brier = score(scale);
      if (!best || brier < best.brier) best = { scale: scale, brier: brier };
    }

    var hits = 0, buckets = {};
    usable.forEach(function (m) {
      var pm = matchFromGame(gameProbability(Math.abs(m.ratingDiff), best.scale));
      var favWon = (m.ratingDiff > 0) === m.homeWon;
      if (favWon) hits++;
      var b = Math.min(9, Math.floor(pm * 10));
      buckets[b] = buckets[b] || { n: 0, wins: 0, sum: 0 };
      buckets[b].n++; buckets[b].wins += favWon ? 1 : 0; buckets[b].sum += pm;
    });

    return {
      scale: best.scale,
      matches: usable.length,
      skipped: played.length - usable.length,
      /* Cuántas veces gana el favorito. 50% sería tirar una moneda. */
      accuracy: usable.length ? hits / usable.length : null,
      brier: best.brier,
      orderBias: played.length
        ? played.filter(function (m) { return m.homeWon; }).length / played.length
        : null,
      buckets: Object.keys(buckets).sort(function (a, b) { return a - b; }).map(function (k) {
        var x = buckets[k];
        return { predicted: x.sum / x.n, observed: x.wins / x.n, n: x.n };
      })
    };
  }

  /* Probabilidad de ganar el partido a partir de la de ganar un juego.
     Cerrada, sin simular: se usa solo para ajustar la escala rápido. */
  function matchFromGame(pg) {
    var pSet = setProbability(pg);
    var pStb = tieBreakProbability(pg, CFG.superTieBreakTarget);
    return pSet * pSet + 2 * pSet * (1 - pSet) * pStb;
  }

  function setProbability(p) {
    /* Set al mejor de 6 juegos con diferencia de 2, tie-break a 6-6. */
    var q = 1 - p, total = 0, i;
    function comb(n, k) {
      var r = 1;
      for (i = 0; i < k; i++) r = r * (n - i) / (i + 1);
      return r;
    }
    for (var l = 0; l <= 4; l++) total += comb(5 + l, l) * Math.pow(p, 6) * Math.pow(q, l);
    var p66 = comb(10, 5) * Math.pow(p * q, 5);           // llegar a 5-5
    var p75 = p66 * p * p;                                 // cerrar 7-5
    var pTb = p66 * 2 * p * q * tieBreakProbability(p, 7); // 6-6 y tie-break
    return total + p75 + pTb;
  }

  function tieBreakProbability(p, target) {
    /* Carrera a "target" puntos con diferencia de 2, resuelta por recursión
       sobre el estado; suficiente para el tamaño de estos tie-breaks. */
    var memo = {};
    function f(a, b) {
      if (a >= target && a - b >= 2) return 1;
      if (b >= target && b - a >= 2) return 0;
      if (a >= target && b >= target) {
        /* A partir del empate en target-1 la ventaja depende solo de p. */
        var d = a - b;
        if (d >= 2) return 1;
        if (d <= -2) return 0;
        var pp = p * p, qq = (1 - p) * (1 - p), den = pp + qq;
        var base = den > 0 ? pp / den : 0.5;
        if (d === 1) return p + (1 - p) * base;
        if (d === -1) return p * base;
        return base;
      }
      var key = a + ':' + b;
      if (memo[key] != null) return memo[key];
      var v = p * f(a + 1, b) + (1 - p) * f(a, b + 1);
      memo[key] = v;
      return v;
    }
    return f(0, 0);
  }

  return {
    CFG: CFG,
    build: build,
    teamStats: teamStats,
    playerTeams: playerTeams,
    headToHead: headToHead,
    project: project,
    calibrate: calibrate,
    gameProbability: gameProbability,
    matchFromGame: matchFromGame,
    setProbability: setProbability,
    tieBreakProbability: tieBreakProbability,
    tally: tally,
    movesFor: movesFor, predictGroups: predictGroups, suggestRivals: suggestRivals,
    pointsFor: pointsFor, groupOutlook: groupOutlook, groupTable: groupTable, nextMonthOutlook: nextMonthOutlook
  };
});
