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
    rivalId: null, rivalQuery: '', loading: false,
    auth: { email: '', password: '', mode: 'in', busy: false, error: null, message: null },
    loader: { open: false, text: '', kind: 'masculina', slug: '', name: '', firstMonth: null,
              parsed: null, result: null, error: null, busy: false }
  };

  var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

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

    /* Cargar datos */
    h.push(loaderCard());

    view.innerHTML = h.join('');
    bindLoader(view, bind);
    bind();
  }

  /* ============================================================
     Cargar un mes de liga
     ============================================================ */
  function loaderCard() {
    var l = state.loader;
    var u = global.PadelAuth.user();

    var h = ['<div class="section" style="margin-top:26px"><div class="section-head">' +
      '<h2>Cargar datos</h2><span class="hint">' +
      (u ? esc(u.email || 'sesión iniciada') : 'hace falta sesión') + '</span></div>'];

    if (!l.open) {
      h.push('<button class="btn block" data-action="open-loader">Cargar una clasificación</button></div>');
      return h.join('');
    }

    h.push('<div class="card">');

    if (!u) {
      h.push(authForm());
      h.push('</div></div>');
      return h.join('');
    }

    h.push('<div class="btn-row" style="margin-bottom:16px">' +
      '<button class="btn ghost" data-action="sign-out">Cerrar sesión</button></div>');

    h.push('<div class="field"><span class="field-label">Competición</span>' +
      '<div class="chips tight" data-chips="kind">' +
      [['masculina', 'Masculina'], ['mixta', 'Mixta']].map(function (k) {
        return '<button type="button" class="chip" data-value="' + k[0] + '" aria-pressed="' +
          (l.kind === k[0] ? 'true' : 'false') + '">' + k[1] + '</button>';
      }).join('') + '</div></div>');

    h.push('<div class="row two">' +
      '<div class="field"><label for="ld-slug">Identificador</label>' +
      '<input type="text" id="ld-slug" placeholder="2026-s2" value="' + esc(l.slug) + '">' +
      '<p class="field-note">Corto y único. Cargar dos veces el mismo no duplica nada.</p></div>' +
      '<div class="field"><label for="ld-first">Primer mes</label>' +
      '<select id="ld-first"><option value="">—</option>' +
      MESES.map(function (m, i) {
        return '<option value="' + i + '"' + (l.firstMonth === i ? ' selected' : '') + '>' + m + '</option>';
      }).join('') + '</select></div></div>');

    h.push('<div class="field"><label for="ld-name">Nombre</label>' +
      '<input type="text" id="ld-name" placeholder="Temporada 2026 · segundo semestre" value="' +
      esc(l.name) + '"></div>');

    h.push('<div class="field"><label for="ld-text">Clasificación</label>' +
      '<textarea id="ld-text" rows="6" placeholder="Pega aquí la clasificación completa, con los MES y los Grupo">' +
      esc(l.text) + '</textarea></div>');

    if (l.error) h.push('<div class="notice bad">' + esc(l.error) + '</div>');

    if (l.parsed) {
      var p = l.parsed;
      h.push('<div class="notice good"><b>He leído esto:</b>' +
        '<ul><li><b>' + p.months.length + ' meses</b>: ' +
        p.months.map(function (M) {
          return esc(M.label || ('Mes ' + M.n)) + ' (' + M.groups.length + ')';
        }).join(' · ') + '</li>' +
        '<li>' + p.teams.length + ' parejas</li>' +
        '<li>' + p.matches.length + ' partidos, ' +
        p.matches.filter(function (m) { return m.walkover; }).length + ' de ellos WO</li>' +
        '<li>' + (p.warnings.length ? p.warnings.length + ' descuadres' : 'sin descuadres') + '</li>' +
        '</ul><p class="field-note">Los partidos con fecha pero sin resultado no se cargan: ' +
        'entrarán cuando se jueguen.</p></div>');

      if (p.warnings.length) {
        h.push('<div class="notice warn">' + p.warnings.slice(0, 4).map(esc).join('<br>') + '</div>');
      }

      /* Nombres que se van a unir, dentro del texto y contra la base. */
      var merges = (p.aliases || []).map(function (a) {
        return esc(a.from) + ' → ' + esc(a.to);
      });
      var known = knownPlayerNames();
      (global.LigaParser.mergesAgainstKnown(global.LigaParser.playerNames(p), known) || [])
        .forEach(function (m) {
          merges.push(esc(m.existing) + ' → ' + esc(m.keeps) + ' <span class="tag">ya en la base</span>');
        });
      if (merges.length) {
        h.push('<div class="notice warn"><b>Voy a tratar estos nombres como la misma persona</b>' +
          '<p class="field-note" style="margin:7px 0">La liga corta los nombres a 10 letras. ' +
          'Solo uno cuando el corto mide justo 10 y es el principio del largo. ' +
          'Si alguno no te cuadra, dímelo antes de guardar.</p>' +
          '<ul><li>' + merges.join('</li><li>') + '</li></ul></div>');
      }
      if ((p.suspicious || []).length) {
        h.push('<div class="notice"><b>Estos se parecen pero NO los uno</b>' +
          '<p class="field-note" style="margin:7px 0">El corto no mide 10 letras, así que puede ser ' +
          'un nombre completo de otra persona. Lo dejo como está.</p><ul><li>' +
          p.suspicious.slice(0, 6).map(function (x) {
            return esc(x.shorter) + ' ~ ' + esc(x.longer);
          }).join('</li><li>') + '</li></ul></div>');
      }
    }

    if (l.result) {
      var r = l.result;
      h.push('<div class="notice good"><b>Guardado.</b><ul>' +
        '<li>' + r.matchesAdded + ' partidos nuevos</li>' +
        '<li>' + r.teamsAdded + ' parejas nuevas · ' + r.playersAdded + ' jugadores nuevos</li>' +
        '<li>' + r.standingsUpserted + ' posiciones de clasificación</li>' +
        '</ul></div>');
    }

    h.push('<div class="btn-row">' +
      '<button class="btn" data-action="parse"' + (l.busy ? ' disabled' : '') + '>' +
      (l.busy ? 'Leyendo…' : 'Analizar') + '</button>' +
      (l.parsed ? '<button class="btn primary" data-action="save-league"' +
        (l.busy ? ' disabled' : '') + '>Guardar en la base</button>' : '') +
      '</div>');

    h.push('</div></div>');
    return h.join('');
  }

  /* Nombres de jugador que ya están cargados, para avisar de enlaces. */
  function knownPlayerNames() {
    if (!state.model) return [];
    var names = {};
    state.model.order.forEach(function (id) {
      var t = state.model.teams[id];
      if (t.playerA) names[t.playerA] = true;
      if (t.playerB) names[t.playerB] = true;
    });
    return Object.keys(names);
  }

  function authForm() {
    var a = state.auth;
    var up = a.mode === 'up';
    return '<p class="field-note" style="margin-bottom:14px">Leer la liga no pide nada. ' +
      'Para <b>escribir</b> sí hace falta tu cuenta: así puedes enseñar el enlace a quien quieras ' +
      'sin que nadie pueda tocar los datos.</p>' +
      (a.error ? '<div class="notice bad">' + esc(a.error) + '</div>' : '') +
      (a.message ? '<div class="notice good">' + esc(a.message) + '</div>' : '') +
      '<div class="field"><label for="au-email">Email</label>' +
      '<input type="email" id="au-email" autocomplete="username" value="' + esc(a.email) + '"></div>' +
      '<div class="field"><label for="au-pass">Contraseña</label>' +
      '<input type="password" id="au-pass" autocomplete="current-password" value="' + esc(a.password) + '"></div>' +
      '<div class="btn-row"><button class="btn primary" data-action="auth-go"' +
      (a.busy ? ' disabled' : '') + '>' +
      (a.busy ? 'Un momento…' : (up ? 'Crear cuenta' : 'Entrar')) + '</button>' +
      '<button class="btn ghost" data-action="auth-mode">' +
      (up ? 'Ya tengo cuenta' : 'Crear cuenta') + '</button></div>';
  }

  function bindLoader(view, repaint) {
    var l = state.loader, a = state.auth;
    var redraw = function () { paintLiga(view, repaint); };

    var open = view.querySelector('[data-action="open-loader"]');
    if (open) open.addEventListener('click', function () { l.open = true; redraw(); });

    /* --- sesión --- */
    var email = document.getElementById('au-email');
    if (email) email.addEventListener('input', function () { a.email = email.value; });
    var pass = document.getElementById('au-pass');
    if (pass) pass.addEventListener('input', function () { a.password = pass.value; });

    var mode = view.querySelector('[data-action="auth-mode"]');
    if (mode) mode.addEventListener('click', function () {
      a.mode = a.mode === 'in' ? 'up' : 'in';
      a.error = null; a.message = null;
      redraw();
    });

    var go = view.querySelector('[data-action="auth-go"]');
    if (go) go.addEventListener('click', function () {
      a.busy = true; a.error = null; a.message = null;
      redraw();
      var op = a.mode === 'up'
        ? global.PadelAuth.signUp(a.email, a.password)
        : global.PadelAuth.signIn(a.email, a.password);
      op.then(function (data) {
        a.busy = false;
        a.password = '';
        if (a.mode === 'up' && !(data && data.access_token)) {
          a.message = 'Cuenta creada. Confirma el email y vuelve a entrar.';
          a.mode = 'in';
        }
        redraw();
      }).catch(function (err) {
        a.busy = false; a.error = err.message; redraw();
      });
    });

    var out = view.querySelector('[data-action="sign-out"]');
    if (out) out.addEventListener('click', function () {
      global.PadelAuth.signOut().then(redraw);
    });

    /* --- carga --- */
    ['slug', 'name', 'text'].forEach(function (f) {
      var el = document.getElementById('ld-' + f);
      if (el) el.addEventListener('input', function () { l[f] = el.value; });
    });
    var first = document.getElementById('ld-first');
    if (first) first.addEventListener('change', function () {
      l.firstMonth = first.value === '' ? null : Number(first.value);
    });
    var kinds = view.querySelector('[data-chips="kind"]');
    if (kinds) kinds.addEventListener('click', function (ev) {
      var chip = ev.target.closest('.chip');
      if (!chip) return;
      l.kind = chip.getAttribute('data-value');
      redraw();
    });

    var parseBtn = view.querySelector('[data-action="parse"]');
    if (parseBtn) parseBtn.addEventListener('click', function () {
      l.error = null; l.result = null; l.parsed = null;
      if (!l.text.trim()) { l.error = 'Pega primero la clasificación.'; redraw(); return; }
      try {
        var parsed = global.LigaParser.parse(l.text);
        if (!parsed.matches.length) {
          l.error = 'No he encontrado ningún resultado. ¿Se han copiado las tabulaciones de la tabla?';
        } else {
          l.parsed = parsed;
        }
      } catch (e) {
        l.error = 'No he podido leerlo: ' + e.message;
      }
      redraw();
    });

    var saveBtn = view.querySelector('[data-action="save-league"]');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      if (!l.parsed) return;
      if (!l.slug.trim()) { l.error = 'Ponle un identificador a la temporada.'; redraw(); return; }
      l.busy = true; l.error = null; redraw();

      var labels = {};
      l.parsed.months.forEach(function (M, i) {
        labels[M.n] = l.firstMonth == null ? ('Mes ' + M.n) : MESES[(l.firstMonth + i) % 12];
      });
      var payload = global.LigaParser.toPayload(l.parsed, {
        slug: l.slug.trim(), name: l.name.trim() || l.slug.trim(),
        kind: l.kind, monthLabels: labels, source: 'paste'
      }, l.text);

      global.PadelDB.callAuthed('ingest_league', { payload: payload }).then(function (res) {
        l.busy = false; l.result = res; l.parsed = null; l.text = '';
        global.PadelDB.clearCache();
        module_reload(function () { paintLiga(view, repaint); });
      }).catch(function (err) {
        l.busy = false; l.error = err.message; redraw();
      });
    });
  }

  function module_reload(done) {
    global.PadelDB.load({ force: true }).then(function (res) {
      state.source = res.from; state.savedAt = res.savedAt; state.error = res.error || null;
      if (res.snapshot) {
        state.model = L.build(res.snapshot);
        state.calibration = L.calibrate(state.model);
        state.model.scale = state.calibration.scale;
      }
      done();
    });
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
