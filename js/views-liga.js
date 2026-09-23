/* ============================================================
   views-liga.js · pantallas Liga y Rival
   La Liga resume nuestra temporada sobre datos consolidados.
   Rival responde a una sola pregunta: qué puede pasar el sábado.
   ============================================================ */
(function (global) {
  'use strict';

  var L = global.Liga;

  var state = {
    model: null, calibration: null, source: null, savedAt: null, error: null,
    rivalId: null, rivalQuery: '', loading: false
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* Coma decimal: es lo que se lee en castellano. */
  function pct(x, digits) {
    return (100 * x).toFixed(digits == null ? 0 : digits).replace('.', ',') + '%';
  }

  /* ---------- carga ---------- */
  function ensureLoaded(onDone) {
    if (state.model || state.loading) { onDone(); return; }
    state.loading = true;
    global.PadelDB.load().then(function (res) {
      state.loading = false;
      state.source = res.from;
      state.savedAt = res.savedAt;
      state.error = res.error || null;
      if (res.snapshot) {
        state.model = L.build(res.snapshot);
        state.calibration = L.calibrate(state.model);
        state.model.scale = state.calibration.scale;
      }
      onDone();
    });
  }

  function sourceNote() {
    if (!state.model) return '';
    if (state.error) {
      return '<div class="notice warn">Sin conexión con la base de datos. Estás viendo la última ' +
        'descarga' + (state.savedAt ? ' del ' + shortDate(state.savedAt) : '') + '.</div>';
    }
    if (state.source === 'cache') {
      return '<p class="field-note">Datos guardados en el móvil · ' + esc(shortDate(state.savedAt)) +
        ' · <button class="linkish" data-action="refresh">actualizar</button></p>';
    }
    return '<p class="field-note">Datos al día desde la liga · ' +
      '<button class="linkish" data-action="refresh">actualizar</button></p>';
  }

  function shortDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') +
      ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function loadingHtml(text) {
    return '<div class="empty"><img class="mark" src="assets/logo.png" alt=""><p>' +
      esc(text) + '</p></div>';
  }

  /* ============================================================
     LIGA
     ============================================================ */
  function renderLiga(view, bind) {
    ensureLoaded(function () { paintLiga(view, bind); });
    if (!state.model) view.innerHTML = loadingHtml('Cargando la liga…');
  }

  function paintLiga(view, bind) {
    if (!state.model) {
      view.innerHTML = '<div class="notice bad"><b>No he podido cargar la liga.</b> ' +
        'Comprueba la conexión y vuelve a entrar.</div>';
      return;
    }
    var m = state.model;
    if (!m.myTeamId) {
      view.innerHTML = '<div class="notice bad">No encuentro tu pareja en los datos.</div>';
      return;
    }
    var me = L.teamStats(m, m.myTeamId);
    var h = [];

    h.push(sourceNote());
    h.push('<div class="stat-grid">' +
      stat(me.won + '–' + me.lost, 'Victorias / derrotas', me.played + ' partidos') +
      stat('#' + (me.last ? me.last.place : '—'), 'Puesto en la liga',
        me.last ? 'de ' + me.last.total : '') +
      stat('G' + (me.last ? me.last.group : '—'), 'Grupo',
        me.climb > 0 ? 'ha subido ' + me.climb : (me.climb < 0 ? 'ha bajado ' + (-me.climb) : 'sin cambios')) +
      stat(Math.round(me.gamePct) + '<small>%</small>', 'Juegos ganados',
        me.gamesFor + '–' + me.gamesAgainst) +
      '</div>');

    /* Escalera mes a mes */
    h.push('<div class="section" style="margin-top:26px"><div class="section-head">' +
      '<h2>Nuestra escalera</h2><span class="hint">puesto al cierre de cada mes</span></div>');
    h.push('<div class="card">' + ladderChart(me) + '</div></div>');

    /* Forma reciente */
    h.push('<div class="section"><div class="section-head"><h2>Mes a mes</h2></div><div class="card">' +
      me.byMonth.map(function (x) {
        return '<div class="freq"><span>' + esc(x.label) + '</span><span class="c">' +
          (x.played ? x.won + '–' + x.lost : '—') +
          (x.group ? ' · G' + x.group + ' · #' + x.place : '') + '</span></div>';
      }).join('') + '</div></div>');

    /* Nuestros partidos */
    h.push('<div class="section"><div class="section-head"><h2>Nuestros partidos</h2>' +
      '<span class="hint">toca para abrir el rival</span></div>');
    h.push(myMatches(m, me).map(function (x) {
      return '<button class="match-line' + (x.win ? '' : ' is-loss') + '" data-rival="' + x.rivalId + '">' +
        '<span class="ml-when">' + esc(x.monthLabel) + '</span>' +
        '<span class="ml-who">' + esc(x.rival) + '</span>' +
        '<span class="ml-score">' + esc(x.score) + '</span></button>';
    }).join('') + '</div>');

    /* Fiabilidad del motor */
    h.push(calibrationCard());

    view.innerHTML = h.join('');
    bind();
  }

  function myMatches(m, me) {
    var monthLabel = {};
    m.months.forEach(function (x) { monthLabel[x.n] = x.label; });
    return m.matches.filter(function (x) {
      return x.home === m.myTeamId || x.away === m.myTeamId;
    }).map(function (x) {
      var mine = x.home === m.myTeamId;
      var rivalId = mine ? x.away : x.home;
      var win = mine === x.homeWon;
      var score;
      if (x.walkover) score = 'WO';
      else score = x.sets.map(function (s) {
        return mine ? s[0] + '-' + s[1] : s[1] + '-' + s[0];
      }).join('  ');
      return {
        monthLabel: monthLabel[x.month] || ('Mes ' + x.month),
        rival: m.teams[rivalId] ? m.teams[rivalId].label : '?',
        rivalId: rivalId, win: win, score: score
      };
    }).reverse();
  }

  function ladderChart(me) {
    var pts = me.byMonth.filter(function (x) { return x.place != null; });
    if (pts.length < 2) return '<p class="field-note">Hace falta más de un mes para ver la escalera.</p>';
    var places = pts.map(function (p) { return p.place; });
    var min = Math.min.apply(null, places), max = Math.max.apply(null, places);
    var span = Math.max(1, max - min);
    var W = 300, H = 90, pad = 10;
    var x = function (i) { return pad + i * (W - 2 * pad) / (pts.length - 1); };
    /* Menos puesto es mejor: el eje va invertido a propósito. */
    var y = function (v) { return pad + (v - min) / span * (H - 2 * pad); };
    var d = pts.map(function (p, i) { return (i ? 'L ' : 'M ') + x(i) + ' ' + y(p.place); }).join(' ');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ladder" role="img" ' +
      'aria-label="Evolución del puesto en la liga">' +
      '<path d="' + d + '" fill="none" stroke="#8FA678" stroke-width="2.4" ' +
      'stroke-linejoin="round" stroke-linecap="round"/>' +
      pts.map(function (p, i) {
        return '<circle cx="' + x(i) + '" cy="' + y(p.place) + '" r="4" fill="#ED6C05"/>' +
          '<text x="' + x(i) + '" y="' + (y(p.place) - 9) + '" fill="#EDEBE3" font-size="9" ' +
          'font-family="IBM Plex Mono" text-anchor="middle">' + p.place + '</text>' +
          '<text x="' + x(i) + '" y="' + (H - 1) + '" fill="#9AA48C" font-size="8" ' +
          'font-family="IBM Plex Mono" text-anchor="middle">' + esc(p.label.slice(0, 3)) + '</text>';
      }).join('') + '</svg>';
  }

  function calibrationCard() {
    var c = state.calibration;
    if (!c) return '';
    return '<div class="section"><div class="section-head"><h2>Fiabilidad de la proyección</h2></div>' +
      '<div class="card"><p class="field-note">' +
      'El motor acierta quién gana en el <b>' + pct(c.accuracy, 1) + '</b> de los ' + c.matches +
      ' partidos ya jugados de la liga. Tirar una moneda sería 50%. ' +
      'Es una ayuda para preparar, no un pronóstico fiable.</p>' +
      '<div style="margin-top:12px">' + c.buckets.map(function (b) {
        return '<div class="freq"><span>Cuando dice ' + pct(b.predicted) + '</span>' +
          '<span class="c">gana el ' + pct(b.observed) + ' · n=' + b.n + '</span></div>';
      }).join('') + '</div>' +
      '<p class="field-note" style="margin-top:12px">Dato aparte, por si alguna vez cuadra algo raro: ' +
      'en la tabla de la liga el equipo listado primero gana el ' + pct(c.orderBias, 1) +
      ' de los partidos. Ese orden depende del resultado, así que no se usa para nada.</p>' +
      '</div></div>';
  }

  function stat(value, key, sub) {
    return '<div class="stat"><div class="n">' + value + '</div>' +
      '<div class="k">' + esc(key) + '</div>' +
      (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  /* ============================================================
     RIVAL
     ============================================================ */
  function renderRival(view, bind) {
    ensureLoaded(function () { paintRival(view, bind); });
    if (!state.model) view.innerHTML = loadingHtml('Cargando la liga…');
  }

  function paintRival(view, bind) {
    if (!state.model) {
      view.innerHTML = '<div class="notice bad">No he podido cargar la liga.</div>';
      return;
    }
    var m = state.model;
    var h = [];

    h.push('<p class="lede">Elige la pareja que te toca. Verás cómo va, cómo le ha ido ' +
      '<b>contra nosotros</b> y qué dice el motor que puede pasar.</p>');
    h.push('<div class="field"><input type="text" id="rival-search" placeholder="Buscar pareja o jugador" ' +
      'autocomplete="off" value="' + esc(state.rivalQuery) + '"></div>');

    if (!state.rivalId) {
      h.push(rivalList(m));
      view.innerHTML = h.join('');
      bind();
      return;
    }

    h.push(rivalReport(m, state.rivalId));
    view.innerHTML = h.join('');
    bind();
  }

  function rivalList(m) {
    var q = state.rivalQuery.trim().toLowerCase();
    var last = m.lastMonth;
    var rows = m.order.filter(function (id) { return id !== m.myTeamId; })
      .map(function (id) {
        var t = m.teams[id];
        var l = m.ladder[last] && m.ladder[last][id];
        return { id: id, label: t.label, place: l ? l.place : null, group: l ? l.group : null,
                 rating: t.rating };
      })
      .filter(function (r) { return !q || r.label.toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) {
        if (a.place == null && b.place == null) return b.rating - a.rating;
        if (a.place == null) return 1;
        if (b.place == null) return -1;
        return a.place - b.place;
      });

    if (!rows.length) return '<div class="notice">Ninguna pareja coincide.</div>';

    var mine = m.ladder[last] && m.ladder[last][m.myTeamId];
    return '<p class="field-note" style="margin-bottom:10px">' + rows.length +
      ' parejas · ordenadas por puesto</p>' +
      rows.slice(0, 40).map(function (r) {
        var rel = (mine && r.place != null)
          ? (r.place < mine.place ? 'arriba' : (r.place > mine.place ? 'abajo' : 'igual'))
          : '';
        return '<button class="rival-line" data-rival="' + r.id + '">' +
          '<span class="rl-place">' + (r.place == null ? '—' : '#' + r.place) + '</span>' +
          '<span class="rl-name">' + esc(r.label) + '</span>' +
          (rel ? '<span class="rl-rel is-' + rel + '">' + rel + '</span>' : '') +
          '</button>';
      }).join('');
  }

  function rivalReport(m, id) {
    var me = L.teamStats(m, m.myTeamId);
    var them = L.teamStats(m, id);
    var h2h = L.headToHead(m, m.myTeamId, id);
    var proj = L.project(m, m.myTeamId, id, { scale: m.scale });
    var monthLabel = {};
    m.months.forEach(function (x) { monthLabel[x.n] = x.label; });

    var h = ['<button class="btn ghost" data-action="clear-rival" style="margin-bottom:16px">← Otra pareja</button>'];

    h.push('<div class="card card-top"><h3>' + esc(them.label) + '</h3>' +
      '<p class="field-note">' + esc(them.playerA) + ' · ' + esc(them.playerB) + '</p></div>');

    /* --- Proyección --- */
    var strong = proj.winProbability >= 0.5;
    h.push('<div class="section" style="margin-top:20px"><div class="section-head">' +
      '<h2>Qué puede pasar</h2><span class="hint">' + proj.simulations + ' simulaciones</span></div>');
    h.push('<div class="card projection">' +
      '<div class="proj-main"><div class="proj-n ' + (strong ? 'good' : 'bad') + '">' +
      pct(proj.winProbability) + '</div>' +
      '<div class="proj-k">probabilidad de que ganemos</div></div>' +
      '<div class="proj-bars">' + proj.setOutcomes.map(function (o) {
        var mineWin = o.label === '2-0' || o.label === '2-1';
        return '<div class="bar-row"><span class="lab">' + o.label + '</span>' +
          '<span class="track"><i class="' + (mineWin ? '' : 'low') + '" style="width:' +
          Math.max(2, Math.round(o.p * 100)) + '%"></i></span>' +
          '<span class="val">' + pct(o.p) + '</span></div>';
      }).join('') + '</div>' +
      '<p class="field-note">Juegos esperados ' + proj.expectedGamesFor.toFixed(1) + '–' +
      proj.expectedGamesAgainst.toFixed(1) + ' · a tres sets ' + pct(proj.threeSetProbability) +
      '. El motor acierta el ' + pct(state.calibration.accuracy, 1) + ' de las veces: ' +
      'úsalo para decidir el plan, no para dar el partido por hecho.</p>' +
      '</div></div>');

    /* --- Historial directo --- */
    h.push('<div class="section"><div class="section-head"><h2>¿Ya hemos jugado?</h2></div><div class="card">');
    if (!h2h.played) {
      h.push('<p class="field-note">Nunca os habéis cruzado en esta temporada.</p>');
    } else {
      h.push('<p class="lede" style="margin-bottom:12px"><b>' + h2h.aWon + '–' + h2h.bWon +
        '</b> a nuestro favor en ' + h2h.played + (h2h.played === 1 ? ' partido' : ' partidos') + '.</p>');
      h.push(h2h.matches.map(function (x) {
        return '<div class="freq"><span>' + esc(monthLabel[x.month] || ('Mes ' + x.month)) +
          (x.superTieBreak ? ' <span class="tag tb">TB</span>' : '') + '</span><span class="c">' +
          (x.walkover ? 'WO' : x.sets.map(function (s) { return s[0] + '-' + s[1]; }).join('  ')) +
          ' · ' + (x.aWon ? 'ganamos' : 'perdimos') + '</span></div>';
      }).join(''));
    }
    h.push('</div></div>');

    /* --- Comparativa --- */
    h.push('<div class="section"><div class="section-head"><h2>Ellos vs nosotros</h2></div>');
    h.push('<div class="card">' + compareRow('Puesto en la liga',
        them.last ? '#' + them.last.place : '—', me.last ? '#' + me.last.place : '—',
        them.last && me.last ? (them.last.place < me.last.place ? 'them' : 'me') : null) +
      compareRow('Grupo', them.last ? 'G' + them.last.group : '—', me.last ? 'G' + me.last.group : '—',
        them.last && me.last ? (them.last.group < me.last.group ? 'them' : 'me') : null) +
      compareRow('Balance', them.won + '–' + them.lost, me.won + '–' + me.lost,
        (them.won - them.lost) > (me.won - me.lost) ? 'them' : 'me') +
      compareRow('% de juegos', them.gamePct == null ? '—' : Math.round(them.gamePct) + '%',
        me.gamePct == null ? '—' : Math.round(me.gamePct) + '%',
        (them.gamePct || 0) > (me.gamePct || 0) ? 'them' : 'me') +
      compareRow('Super tie-breaks', them.superTieBreaksWon + '/' + them.superTieBreaks,
        me.superTieBreaksWon + '/' + me.superTieBreaks, null) +
      compareRow('Movimiento', climbText(them.climb), climbText(me.climb),
        (them.climb || 0) > (me.climb || 0) ? 'them' : 'me') +
      '</div></div>');

    /* --- Su trayectoria --- */
    h.push('<div class="section"><div class="section-head"><h2>Cómo vienen</h2>' +
      '<span class="hint">forma: ' + (them.form.length ? them.form.join(' ') : 'sin datos') +
      '</span></div><div class="card">' +
      them.byMonth.map(function (x) {
        return '<div class="freq"><span>' + esc(x.label) + '</span><span class="c">' +
          (x.played ? x.won + '–' + x.lost : '—') +
          (x.group ? ' · G' + x.group + ' · #' + x.place : ' · no jugó') + '</span></div>';
      }).join('') + '</div></div>');

    /* --- Las otras parejas de esos jugadores --- */
    var others = L.playerTeams(m, them.playerA, id).concat(L.playerTeams(m, them.playerB, id));
    if (others.length) {
      h.push('<div class="section"><div class="section-head"><h2>Los mismos jugadores, otra pareja</h2>' +
        '<span class="hint">en esta liga se cambia de compañero</span></div><div class="card">' +
        others.map(function (o) {
          var st = L.teamStats(m, o.id);
          return '<button class="rival-line" data-rival="' + o.id + '">' +
            '<span class="rl-place">' + (st.last ? '#' + st.last.place : '—') + '</span>' +
            '<span class="rl-name">' + esc(o.label) + '<br>' +
            '<small style="color:var(--mute);font:400 11px/1.5 var(--mono)">' +
            st.won + '–' + st.lost + ' · ' + o.months.map(function (n) {
              return (monthLabel[n] || n).slice(0, 3);
            }).join(' ') + '</small></span></button>';
        }).join('') +
        '<p class="field-note">Si el que te preocupa es el jugador y no la pareja, mira también ' +
        'cómo le ha ido aquí.</p></div></div>');
    }

    /* --- Lectura --- */
    h.push('<div class="section"><div class="section-head"><h2>Lectura</h2></div>' +
      readings(m, me, them, h2h, proj).map(function (t, i) {
        return '<div class="brief-bullet"><span class="i">' + (i + 1) + '</span><div><p>' +
          t + '</p></div></div>';
      }).join('') + '</div>');

    return h.join('');
  }

  function climbText(c) {
    if (c == null) return '—';
    if (c > 0) return '↑ ' + c;
    if (c < 0) return '↓ ' + (-c);
    return '=';
  }

  function compareRow(label, them, mine, winner) {
    return '<div class="cmp"><span class="cmp-them' + (winner === 'them' ? ' win' : '') + '">' +
      esc(them) + '</span><span class="cmp-k">' + esc(label) + '</span>' +
      '<span class="cmp-me' + (winner === 'me' ? ' win' : '') + '">' + esc(mine) + '</span></div>';
  }

  /* Frases derivadas de los datos. Ninguna se inventa: si el dato no
     está, la frase no aparece. */
  function readings(m, me, them, h2h, proj) {
    var out = [];
    var gap = (them.last && me.last) ? me.last.place - them.last.place : null;

    if (gap != null && gap > 0) {
      out.push('Hoy están <b>' + gap + ' puesto' + (gap === 1 ? '' : 's') + ' por encima</b> ' +
        'en la escalera. Tus ' + me.lost + ' derrotas fueron todas contra equipos que, ' +
        'el mes en que jugasteis, estaban por encima (' + lossesAbove(m, me) + ' de ' + me.lost + ').');
    } else if (gap != null && gap < 0) {
      out.push('Hoy están <b>' + (-gap) + ' puesto' + (gap === -1 ? '' : 's') + ' por debajo</b>. ' +
        'Ojo: lo que cuenta es dónde estaban <b>el mes que os cruzáis</b>; contra quien estaba por ' +
        'debajo en ese momento tu balance es ' + recordBelow(m, me) + '.');
    }

    if (h2h.played) {
      var tight = h2h.matches.filter(function (x) { return x.superTieBreak; }).length;
      out.push('Ya os habéis cruzado ' + h2h.played + (h2h.played === 1 ? ' vez' : ' veces') +
        ': ' + h2h.aWon + '–' + h2h.bWon +
        (tight ? ', con ' + tight + ' partido' + (tight === 1 ? '' : 's') + ' decidido en super tie-break' : '') +
        '.');
    } else {
      out.push('No os habéis cruzado todavía, así que la proyección solo se apoya en cómo le ha ido ' +
        'a cada uno contra el resto.');
    }

    var f = them.form.slice(0, 3);
    if (f.length === 3) {
      var w = f.filter(function (x) { return x === 'V'; }).length;
      if (w === 3) out.push('Vienen lanzados: <b>han ganado los últimos 3</b>. Cuenta con que salgan enchufados.');
      else if (w === 0) out.push('Vienen de <b>perder los últimos 3</b>. Un arranque sólido puede hundirles el partido.');
      else out.push('Forma irregular: ' + f.join(' ') + ' en sus últimos tres. El arranque va a pesar.');
    }

    if (proj.threeSetProbability > 0.45) {
      out.push('El motor da <b>' + pct(proj.threeSetProbability) + ' de que se vaya al super tie-break</b>. ' +
        'Prepárate para un partido largo: el físico y las decisiones del final cuentan.');
    }

    return out.slice(0, 4);
  }

  function lossesAbove(m, me) {
    var n = 0;
    m.matches.forEach(function (x) {
      if (x.home !== m.myTeamId && x.away !== m.myTeamId) return;
      if (x.walkover) return;
      var mine = x.home === m.myTeamId;
      if (mine === x.homeWon) return;
      var rivalId = mine ? x.away : x.home;
      var l = m.ladder[x.month];
      if (l && l[rivalId] && l[m.myTeamId] && l[rivalId].place < l[m.myTeamId].place) n++;
    });
    return n;
  }

  function recordBelow(m, me) {
    var w = 0, l = 0;
    m.matches.forEach(function (x) {
      if (x.home !== m.myTeamId && x.away !== m.myTeamId) return;
      if (x.walkover) return;
      var mine = x.home === m.myTeamId;
      var rivalId = mine ? x.away : x.home;
      var lad = m.ladder[x.month];
      if (!lad || !lad[rivalId] || !lad[m.myTeamId]) return;
      if (lad[rivalId].place <= lad[m.myTeamId].place) return;
      if (mine === x.homeWon) w++; else l++;
    });
    return w + '–' + l;
  }

  global.PadelLiga = {
    state: state,
    renderLiga: renderLiga,
    renderRival: renderRival,
    ensureLoaded: ensureLoaded,
    reload: function (onDone) {
      state.loading = true;
      global.PadelDB.load({ force: true }).then(function (res) {
        state.loading = false;
        state.source = res.from; state.savedAt = res.savedAt; state.error = res.error || null;
        if (res.snapshot) {
          state.model = L.build(res.snapshot);
          state.calibration = L.calibrate(state.model);
          state.model.scale = state.calibration.scale;
        }
        onDone();
      });
    }
  };
})(window);
