/* ============================================================
   app.js · navegación, render y eventos
   Conecta los módulos. La lógica de cálculo vive en analysis.js,
   la persistencia en storage.js y los catálogos en data.js.
   ============================================================ */
(function (global) {
  'use strict';

  var D = global.PadelData;
  var S = global.PadelStorage;
  var A = global.PadelAnalysis;
  var B = global.PadelBriefing;
  var R = D.RULES;

  var VIEWS = {
    inicio:    { title: 'La pista' },
    temporada: { title: 'Nuestra temporada' },
    rival:     { title: 'El rival' },
    liga:      { title: 'La liga' },
    registro:  { title: 'Registro rápido' },
    historial: { title: 'Historial' },
    analisis:  { title: 'Análisis' },
    cronica:   { title: 'Crónica' }
  };

  var state = {
    view: 'inicio',
    form: null,
    errors: [],
    savedId: null,
    filters: { result: 'all', archetype: 'all', rival: '', month: 'all' },
    briefArchetype: 'A',
    openCards: {}
  };

  var $view, $title, $nav;

  /* ============================================================
     utilidades
     ============================================================ */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(message, bad) {
    var t = document.getElementById('toast');
    t.textContent = message;
    t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.className = 'toast'; }, 3200);
  }

  function prettyDate(iso) {
    var p = (iso || '').split('-');
    if (p.length !== 3) return iso || '';
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function chipsHtml(list, name, selected, multi, extraClass) {
    return '<div class="chips ' + (extraClass || '') + '" data-chips="' + name +
      '" data-multi="' + (multi ? '1' : '0') + '">' +
      list.map(function (item) {
        var on = multi ? selected.indexOf(item.id) >= 0 : selected === item.id;
        return '<button type="button" class="chip" data-value="' + esc(item.id) + '" ' +
          'aria-pressed="' + (on ? 'true' : 'false') + '">' +
          (item.key ? '<span class="chip-k">' + esc(item.key) + '</span>' : '') +
          esc(item.label) + '</button>';
      }).join('') + '</div>';
  }

  function emptyState(mark, text, actionLabel, actionView) {
    return '<div class="empty"><img class="mark" src="assets/logo.png" alt=""><p>' + esc(text) + '</p>' +
      (actionLabel ? '<button class="btn primary" data-goto="' + actionView + '">' +
        esc(actionLabel) + '</button>' : '') + '</div>';
  }

  /* ============================================================
     formulario: estado inicial
     ============================================================ */
  function blankForm() {
    return {
      id: null,
      date: S.today(),
      rivals: [{ name: '', archetype: 'por-definir' }, { name: '', archetype: 'por-definir' }],
      status: 'normal',
      statusNote: '',
      result: null,
      sets: [{ own: null, opponent: null }, { own: null, opponent: null }, { own: null, opponent: null }],
      readSet: null,
      readGame: null,
      didNotRead: false,
      patterns: [],
      patternOther: '',
      worked: [],
      notWorked: [],
      physicalState: 'normal',
      mentalState: 'normal',
      partnerNotes: ''
    };
  }

  function formFromMatch(m) {
    var f = blankForm();
    f.id = m.id;
    f.date = m.date;
    f.rivals = (m.rivals || []).map(function (r) {
      return { name: r.name || '', archetype: r.archetype || 'por-definir' };
    });
    while (f.rivals.length < 2) f.rivals.push({ name: '', archetype: 'por-definir' });
    f.status = m.status || 'normal';
    f.statusNote = m.statusNote || '';
    f.result = m.result || null;
    f.sets = [0, 1, 2].map(function (i) {
      var s = (m.sets || [])[i];
      return { own: s ? s.own : null, opponent: s ? s.opponent : null };
    });
    f.readSet = m.readSet != null ? m.readSet : null;
    f.readGame = m.readGame != null ? m.readGame : null;
    f.didNotRead = m.readSet == null;
    f.patterns = (m.patterns || []).slice();
    f.patternOther = m.patternOther || '';
    f.worked = (m.worked || []).slice();
    f.notWorked = (m.notWorked || []).slice();
    f.physicalState = m.physicalState || 'normal';
    f.mentalState = m.mentalState || 'normal';
    f.partnerNotes = m.partnerNotes || '';
    return f;
  }

  /* Convierte el formulario en el partido que se guarda.
     Los datos derivados se recalculan siempre desde los sets. */
  function matchFromForm(f) {
    var status = D.findById(D.MATCH_STATUS, f.status);
    var sets = [];
    if (status && status.needsSets) {
      var raw = f.sets.slice(0, needsSuperTieBreak(f) ? 3 : R.normalSets);
      sets = raw.filter(function (s) { return s.own != null || s.opponent != null; });
    }
    var match = {
      id: f.id || S.newId(),
      date: f.date,
      rivals: f.rivals.map(function (r) {
        return { name: (r.name || '').trim(), archetype: r.archetype };
      }),
      status: f.status,
      statusNote: f.status === 'otro' ? (f.statusNote || '').trim() : '',
      sets: sets,
      readSet: f.didNotRead ? null : f.readSet,
      readGame: f.didNotRead ? null : f.readGame,
      patterns: f.patterns.slice(),
      patternOther: f.patterns.indexOf('otro') >= 0 ? (f.patternOther || '').trim() : '',
      worked: f.worked.slice(),
      notWorked: f.notWorked.slice(),
      physicalState: f.physicalState,
      mentalState: f.mentalState,
      partnerNotes: (f.partnerNotes || '').trim()
    };
    if (!status || !status.needsSets) match.result = f.result;
    var derived = A.deriveMatch(match);
    match.result = derived.result;
    match.totalGames = derived.totalGames;
    match.setsWon = derived.setsWon;
    match.setsLost = derived.setsLost;
    return match;
  }

  /* El tercer set solo existe si los dos primeros van repartidos. */
  function needsSuperTieBreak(f) {
    var a = f.sets[0], b = f.sets[1];
    if (a.own == null || a.opponent == null || b.own == null || b.opponent == null) return false;
    return (a.own > a.opponent) !== (b.own > b.opponent);
  }

  /* ============================================================
     VISTA · REGISTRO
     ============================================================ */
  function renderRegistro() {
    if (!state.form) state.form = blankForm();
    if (state.savedId) return renderSaved();

    var f = state.form;
    var status = D.findById(D.MATCH_STATUS, f.status);
    var h = [];

    if (state.errors.length) {
      h.push('<div class="notice bad"><b>Falta algo antes de guardar</b><ul>' +
        state.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>');
    }
    if (!S.available()) {
      h.push('<div class="notice warn">Este navegador no deja guardar datos de forma permanente. ' +
        'Podrás registrar el partido, pero exporta el backup antes de cerrar.</div>');
    }
    if (f.id) {
      h.push('<div class="notice good">Estás editando un partido ya guardado.</div>');
    }

    /* fecha */
    h.push('<div class="field"><label for="f-date">Fecha</label>' +
      '<input type="date" id="f-date" data-field="date" value="' + esc(f.date) + '"></div>');

    /* rivales */
    f.rivals.forEach(function (r, i) {
      h.push('<div class="field">' +
        '<span class="field-label">Rival ' + (i + 1) + '</span>' +
        '<div class="suggest"><input type="text" data-rival-name="' + i + '" autocomplete="off" ' +
        'placeholder="Nombre" value="' + esc(r.name) + '"></div>' +
        '<div style="margin-top:10px">' +
        chipsHtml(D.ARCHETYPES, 'rival-archetype-' + i, r.archetype, false, 'grid2') +
        '</div></div>');
    });

    /* estado */
    h.push('<div class="field"><span class="field-label">Estado del partido</span>' +
      chipsHtml(D.MATCH_STATUS, 'status', f.status, false, 'grid2') + '</div>');

    if (f.status === 'otro') {
      h.push('<div class="field"><label for="f-note">Aclaración</label>' +
        '<input type="text" id="f-note" data-field="statusNote" maxlength="80" ' +
        'placeholder="Breve" value="' + esc(f.statusNote) + '"></div>');
    }

    /* resultado */
    if (status && status.needsSets) {
      h.push(setsBlock(f));
    } else {
      h.push('<div class="field"><span class="field-label">Resultado</span>' +
        chipsHtml([{ id: 'win', label: 'Ganamos' }, { id: 'loss', label: 'Perdimos' }],
          'result', f.result, false, 'tight accent') + '</div>');
    }

    /* lectura */
    h.push(readBlock(f));

    /* patrones */
    var remaining = R.maxPatterns - f.patterns.length;
    h.push('<div class="field"><span class="field-label">Patrones del rival ' +
      '<span class="opt">· máx. ' + R.maxPatterns + '</span></span>' +
      chipsHtml(D.PATTERNS, 'patterns', f.patterns, true) +
      '<p class="field-note">' + (remaining > 0
        ? 'Puedes marcar ' + remaining + ' más.'
        : 'Ya tienes ' + R.maxPatterns + '. Desmarca uno para cambiarlo.') + '</p></div>');

    if (f.patterns.indexOf('otro') >= 0) {
      h.push('<div class="field"><label for="f-pother">¿Qué otro patrón?</label>' +
        '<input type="text" id="f-pother" data-field="patternOther" maxlength="90" ' +
        'placeholder="En pocas palabras" value="' + esc(f.patternOther) + '"></div>');
    }

    /* funcionó / no funcionó */
    h.push('<div class="field"><span class="field-label">Qué funcionó <span class="opt">· opcional</span></span>' +
      chipsHtml(D.WORKED_OPTIONS, 'worked', f.worked, true) + '</div>');
    h.push('<div class="field"><span class="field-label">Qué no funcionó <span class="opt">· opcional</span></span>' +
      chipsHtml(D.NOT_WORKED_OPTIONS, 'notWorked', f.notWorked, true) + '</div>');

    /* estado propio */
    h.push('<div class="row two">' +
      '<div class="field"><span class="field-label">Físico</span>' +
      chipsHtml(D.LEVELS, 'physicalState', f.physicalState, false, 'tight') + '</div>' +
      '<div class="field"><span class="field-label">Mental</span>' +
      chipsHtml(D.LEVELS, 'mentalState', f.mentalState, false, 'tight') + '</div></div>');

    /* notas */
    h.push('<div class="field"><label for="f-notes">Nota de la pareja <span class="opt">· opcional</span></label>' +
      '<textarea id="f-notes" data-field="partnerNotes" maxlength="220" ' +
      'placeholder="Una frase, no un diario.">' + esc(f.partnerNotes) + '</textarea></div>');

    h.push('<div class="btn-row"><button class="btn primary block" data-action="save">' +
      (f.id ? 'Guardar cambios' : 'Guardar partido') + '</button></div>');
    if (f.id) {
      h.push('<div class="btn-row" style="margin-top:10px">' +
        '<button class="btn ghost block" data-action="cancel-edit">Cancelar edición</button></div>');
    }

    $view.innerHTML = h.join('');
    bindRegistro();
  }

  function setsBlock(f) {
    var showThird = needsSuperTieBreak(f);
    var rows = [
      { i: 0, name: 'Set 1' },
      { i: 1, name: 'Set 2' }
    ];
    if (showThird) rows.push({ i: 2, name: 'Super TB' });

    var html = '<div class="field"><span class="field-label">Resultado por sets</span>' +
      '<div class="set-legend"><span></span><span>Nosotros</span><span></span><span>Rivales</span></div>';
    rows.forEach(function (r) {
      var s = f.sets[r.i];
      var max = r.i >= R.normalSets ? 40 : R.maxGamesPerSet;
      html += '<div class="set-row"><span class="set-name">' + r.name + '</span>' +
        '<input type="number" inputmode="numeric" min="0" max="' + max + '" ' +
        'data-set="' + r.i + '" data-side="own" value="' + (s.own == null ? '' : s.own) + '">' +
        '<span class="vs">–</span>' +
        '<input type="number" inputmode="numeric" min="0" max="' + max + '" ' +
        'data-set="' + r.i + '" data-side="opponent" value="' + (s.opponent == null ? '' : s.opponent) + '">' +
        '</div>';
    });

    html += '<p class="field-note" id="sets-note">' + esc(setsNoteText(f)) + '</p></div>';
    return html;
  }

  /* Texto que resume lo calculado. Se actualiza en caliente, sin
     volver a dibujar el formulario: si se redibujara mientras Fran
     salta de casilla en casilla, perdería el foco y el dato. */
  function setsNoteText(f) {
    var derived = A.deriveMatch(matchFromForm(f));
    if (derived.result) {
      return (derived.result === 'win' ? 'Victoria' : 'Derrota') + ' ' +
        derived.setsWon + '–' + derived.setsLost + ' · ' + derived.totalGames + ' juegos.';
    }
    if (needsSuperTieBreak(f)) return 'Vais 1-1: completa el super tie-break.';
    return 'Sets ganados, resultado y juegos se calculan solos. El super tie-break aparece si acabáis 1-1.';
  }

  function readBlock(f) {
    var html = '<div class="field"><span class="field-label">¿En qué juego leíste al rival? ' +
      '<span class="opt">· opcional</span></span>' +
      '<div class="chips tight"><button type="button" class="chip" data-action="toggle-read" ' +
      'aria-pressed="' + (f.didNotRead ? 'true' : 'false') + '">No lo leí</button></div>';
    if (!f.didNotRead) {
      html += '<div class="row two" style="margin-top:12px">' +
        '<div><span class="field-label">Set</span><select data-field="readSet">' +
        '<option value="">—</option>' +
        [1, 2, 3].map(function (n) {
          return '<option value="' + n + '"' + (f.readSet === n ? ' selected' : '') + '>' +
            (n === 3 ? 'Super TB' : 'Set ' + n) + '</option>';
        }).join('') + '</select></div>' +
        '<div><span class="field-label">Juego</span>' +
        '<input type="number" inputmode="numeric" min="1" max="' + R.maxGameInSet + '" ' +
        'data-field="readGame" value="' + (f.readGame == null ? '' : f.readGame) + '"' +
        (f.readSet === 3 ? ' disabled placeholder="—"' : '') + '></div></div>';
      html += '<p class="field-note" id="read-note">' + esc(readNoteText(f)) + '</p>';
    }
    return html + '</div>';
  }

  function readNoteText(f) {
    var abs = A.deriveMatch(matchFromForm(f)).readGameAbsolute;
    if (!abs) return 'Marca el set y el juego, o «No lo leí».';
    return 'Juego ' + abs + ' del partido. Es el número que se usa para la media.';
  }

  /* Actualiza lo que depende de los sets sin redibujar, salvo que
     haya que añadir o quitar la fila del super tie-break. */
  function refreshAfterSetInput() {
    var f = state.form;
    var need = needsSuperTieBreak(f);
    var present = !!$view.querySelector('[data-set="2"]');
    if (need !== present) {
      var active = document.activeElement;
      var set = active && active.getAttribute && active.getAttribute('data-set');
      var side = active && active.getAttribute && active.getAttribute('data-side');
      renderRegistro();
      if (set != null) {
        var again = $view.querySelector('[data-set="' + set + '"][data-side="' + side + '"]');
        if (again) { again.focus(); again.select(); }
      }
      return;
    }
    var note = document.getElementById('sets-note');
    if (note) note.textContent = setsNoteText(f);
    var rnote = document.getElementById('read-note');
    if (rnote) rnote.textContent = readNoteText(f);
  }

  function bindRegistro() {
    var f = state.form;

    /* campos de texto y selects */
    $view.querySelectorAll('[data-field]').forEach(function (el) {
      el.addEventListener('input', function () {
        var key = el.getAttribute('data-field');
        if (key === 'readSet') {
          f.readSet = el.value ? Number(el.value) : null;
          if (f.readSet === 3) f.readGame = null;
          renderRegistro();
          return;
        }
        if (key === 'readGame') {
          f.readGame = el.value === '' ? null : Number(el.value);
          var rnote = document.getElementById('read-note');
          if (rnote) rnote.textContent = readNoteText(f);
          return;
        }
        f[key] = el.value;
      });
    });

    /* sets */
    $view.querySelectorAll('[data-set]').forEach(function (el) {
      el.addEventListener('input', function () {
        var i = Number(el.getAttribute('data-set'));
        var side = el.getAttribute('data-side');
        f.sets[i][side] = el.value === '' ? null : Number(el.value);
        refreshAfterSetInput();
      });
    });

    /* nombres de rival con sugerencias */
    $view.querySelectorAll('[data-rival-name]').forEach(function (el) {
      var i = Number(el.getAttribute('data-rival-name'));
      el.addEventListener('input', function () {
        f.rivals[i].name = el.value;
        showSuggestions(el, i);
      });
      el.addEventListener('focus', function () { showSuggestions(el, i); });
      el.addEventListener('blur', function () {
        setTimeout(function () { clearSuggestions(el); }, 160);
      });
    });

    /* chips */
    $view.querySelectorAll('[data-chips]').forEach(function (group) {
      var name = group.getAttribute('data-chips');
      var multi = group.getAttribute('data-multi') === '1';
      group.addEventListener('click', function (ev) {
        var chip = ev.target.closest('.chip');
        if (!chip) return;
        var value = chip.getAttribute('data-value');
        applyChip(name, value, multi);
      });
    });

    var toggleRead = $view.querySelector('[data-action="toggle-read"]');
    if (toggleRead) {
      toggleRead.addEventListener('click', function () {
        f.didNotRead = !f.didNotRead;
        if (f.didNotRead) { f.readSet = null; f.readGame = null; }
        renderRegistro();
      });
    }

    var saveBtn = $view.querySelector('[data-action="save"]');
    if (saveBtn) saveBtn.addEventListener('click', doSave);

    var cancel = $view.querySelector('[data-action="cancel-edit"]');
    if (cancel) cancel.addEventListener('click', function () {
      state.form = blankForm();
      state.errors = [];
      renderRegistro();
    });
  }

  function applyChip(name, value, multi) {
    var f = state.form;
    if (name.indexOf('rival-archetype-') === 0) {
      f.rivals[Number(name.split('-')[2])].archetype = value;
    } else if (multi) {
      var list = f[name];
      var at = list.indexOf(value);
      if (at >= 0) list.splice(at, 1);
      else {
        if (name === 'patterns' && list.length >= R.maxPatterns) {
          toast('Máximo ' + R.maxPatterns + ' patrones. Desmarca uno primero.', true);
          return;
        }
        list.push(value);
      }
    } else {
      f[name] = f[name] === value ? (name === 'result' ? null : f[name]) : value;
    }
    renderRegistro();
  }

  function showSuggestions(input, index) {
    clearSuggestions(input);
    var q = (input.value || '').trim().toLowerCase();
    var names = S.rivalNames().filter(function (n) {
      return !q || n.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 6);
    if (!names.length || (names.length === 1 && names[0].toLowerCase() === q)) return;

    var box = document.createElement('div');
    box.className = 'suggest-list';
    box.innerHTML = names.map(function (n) {
      return '<button type="button">' + esc(n) + '</button>';
    }).join('');
    box.addEventListener('mousedown', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      ev.preventDefault();
      var name = b.textContent;
      state.form.rivals[index].name = name;
      var arch = S.lastArchetypeFor(name);
      if (arch) state.form.rivals[index].archetype = arch;
      renderRegistro();
    });
    input.parentNode.appendChild(box);
  }

  function clearSuggestions(input) {
    var old = input.parentNode.querySelector('.suggest-list');
    if (old) old.parentNode.removeChild(old);
  }

  function doSave() {
    var match = matchFromForm(state.form);
    var errors = S.validate(match);
    state.errors = errors;
    if (errors.length) {
      renderRegistro();
      global.scrollTo({ top: 0, behavior: 'smooth' });
      toast('Faltan datos para guardar', true);
      return;
    }
    S.save(match);
    state.savedId = match.id;
    state.form = blankForm();
    renderRegistro();
    global.scrollTo({ top: 0 });
    toast('Partido guardado');
  }

  /* ---------- resumen posterior al guardado ---------- */
  function renderSaved() {
    var raw = S.get(state.savedId);
    if (!raw) { state.savedId = null; return renderRegistro(); }
    var m = A.decorate(raw);
    var resText, cls;
    if (!m.isNormal) {
      resText = D.labelOf(D.MATCH_STATUS, m.status).toUpperCase();
      cls = 's';
    } else {
      resText = (m.result === 'win' ? 'VICTORIA' : 'DERROTA') + ' ' + m.setsWon + '–' + m.setsLost;
      cls = m.result === 'win' ? 'w' : 'l';
    }

    var h = ['<div class="notice good">Guardado. Los datos ya están en el historial.</div>'];
    h.push('<div class="saved-hero"><div class="res ' + cls + '">' + esc(resText) + '</div>' +
      '<div class="sub">' + esc(prettyDate(m.date)) + ' · ' + esc(rivalLine(m)) + '</div></div>');
    h.push('<div class="card">' + matchDetailHtml(m) + '</div>');
    h.push('<div class="btn-row" style="margin-top:16px">' +
      '<button class="btn" data-action="edit-saved">Editar</button>' +
      '<button class="btn primary" data-action="new-match">Registrar otro</button></div>');
    h.push('<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn ghost block" data-goto="historial">Ver historial</button></div>');

    $view.innerHTML = h.join('');

    $view.querySelector('[data-action="edit-saved"]').addEventListener('click', function () {
      state.form = formFromMatch(S.get(state.savedId));
      state.savedId = null;
      state.errors = [];
      renderRegistro();
    });
    $view.querySelector('[data-action="new-match"]').addEventListener('click', function () {
      state.savedId = null;
      state.form = blankForm();
      state.errors = [];
      renderRegistro();
    });
  }

  function rivalLine(m) {
    return (m.rivals || []).map(function (r) {
      return (r.name || 'Sin nombre');
    }).join(' / ');
  }

  function scoreLine(m) {
    if (!m.sets || !m.sets.length) return '—';
    return m.sets.map(function (s) { return s.own + '–' + s.opponent; })
      .join('<span class="sep">·</span>');
  }

  function matchDetailHtml(m) {
    var rows = [];
    m.rivals.forEach(function (r, i) {
      rows.push(['Rival ' + (i + 1),
        esc(r.name || 'Sin nombre') + ' · ' + esc(D.labelOf(D.ARCHETYPES, r.archetype))]);
    });
    if (m.isNormal) {
      rows.push(['Resultado', scoreLine(m) + ' · ' + m.totalGames + ' juegos']);
    } else if (m.statusNote) {
      rows.push(['Aclaración', esc(m.statusNote)]);
    }
    if (m.readGameAbsolute) {
      var where = m.readSet === 3 ? 'en el super tie-break' : 'set ' + m.readSet + ', juego ' + m.readGame;
      rows.push(['Lectura', esc(where) + ' · juego ' + m.readGameAbsolute + ' del partido']);
    } else {
      rows.push(['Lectura', 'No lo leyó']);
    }
    if (m.patterns && m.patterns.length) {
      rows.push(['Patrones', m.patterns.map(function (p) {
        return esc(p === 'otro' && m.patternOther ? m.patternOther : D.labelOf(D.PATTERNS, p));
      }).join(' · ')]);
    }
    if (m.worked && m.worked.length) {
      rows.push(['Funcionó', m.worked.map(function (w) {
        return esc(D.labelOf(D.WORKED_OPTIONS, w));
      }).join(' · ')]);
    }
    if (m.notWorked && m.notWorked.length) {
      rows.push(['No funcionó', m.notWorked.map(function (w) {
        return esc(D.labelOf(D.NOT_WORKED_OPTIONS, w));
      }).join(' · ')]);
    }
    rows.push(['Estado', 'Físico ' + esc(D.labelOf(D.LEVELS, m.physicalState)).toLowerCase() +
      ' · mental ' + esc(D.labelOf(D.LEVELS, m.mentalState)).toLowerCase()]);
    if (m.partnerNotes) rows.push(['Nota', esc(m.partnerNotes)]);

    return '<dl>' + rows.map(function (r) {
      return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>';
    }).join('') + '</dl>';
  }

  /* ============================================================
     VISTA · HISTORIAL
     ============================================================ */
  function renderHistorial() {
    var all = A.decorateAll(S.all()).reverse();
    if (!all.length) {
      $view.innerHTML = emptyState('—', 'Todavía no hay partidos registrados.',
        'Registrar partido', 'registro') + dataCard();
      bindCommon();
      bindDataCard();
      return;
    }

    var months = {};
    all.forEach(function (m) { months[(m.date || '').slice(0, 7)] = true; });
    var monthList = Object.keys(months).sort().reverse();

    var f = state.filters;
    var filtered = all.filter(function (m) {
      if (f.result === 'win' && m.result !== 'win') return false;
      if (f.result === 'loss' && m.result !== 'loss') return false;
      if (f.result === 'special' && m.isNormal) return false;
      if (f.archetype !== 'all' && !(m.rivals || []).some(function (r) {
        return r && r.archetype === f.archetype;
      })) return false;
      if (f.month !== 'all' && (m.date || '').slice(0, 7) !== f.month) return false;
      if (f.rival) {
        var q = f.rival.toLowerCase();
        if (!(m.rivals || []).some(function (r) {
          return (r.name || '').toLowerCase().indexOf(q) >= 0;
        })) return false;
      }
      return true;
    });

    var h = [];
    h.push('<div class="filters">' +
      filterChip('result', 'all', 'Todos') +
      filterChip('result', 'win', 'Victorias') +
      filterChip('result', 'loss', 'Derrotas') +
      filterChip('result', 'special', 'WO / abandono') + '</div>');
    h.push('<div class="filters">' +
      filterChip('archetype', 'all', 'Todo perfil') +
      D.ARCHETYPES.map(function (a) {
        return filterChip('archetype', a.id, a.key === '?' || a.key === '·' ? a.label : a.key);
      }).join('') + '</div>');
    h.push('<div class="row two" style="margin-bottom:16px">' +
      '<input type="text" id="h-rival" placeholder="Buscar rival" value="' + esc(f.rival) + '">' +
      '<select id="h-month"><option value="all">Todas las fechas</option>' +
      monthList.map(function (k) {
        return '<option value="' + k + '"' + (f.month === k ? ' selected' : '') + '>' +
          esc(A.monthLabel(k)) + '</option>';
      }).join('') + '</select></div>');

    h.push('<p class="lede">' + filtered.length +
      (filtered.length === 1 ? ' partido' : ' partidos') +
      (filtered.length !== all.length ? ' de ' + all.length : '') + '.</p>');

    if (!filtered.length) {
      h.push('<div class="notice">Ningún partido cumple estos filtros.</div>');
    } else {
      h.push(filtered.map(matchCardHtml).join(''));
    }
    h.push(dataCard());

    $view.innerHTML = h.join('');
    bindHistorial();
  }

  function filterChip(group, value, label) {
    var on = state.filters[group] === value;
    return '<button type="button" class="chip" data-filter="' + group + '" data-value="' +
      esc(value) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }

  function matchCardHtml(m) {
    var cls = !m.isNormal ? 'is-special' : (m.result === 'win' ? '' : 'is-loss');
    var badge, badgeCls;
    if (!m.isNormal) {
      badge = D.labelOf(D.MATCH_STATUS, m.status);
      badgeCls = 's';
    } else {
      badge = (m.result === 'win' ? 'V' : 'D') + ' ' + m.setsWon + '–' + m.setsLost;
      badgeCls = m.result === 'win' ? 'w' : 'l';
    }
    var open = state.openCards[m.id] ? ' open' : '';

    return '<article class="match-card ' + cls + open + '" data-card="' + esc(m.id) + '">' +
      '<div class="match-top"><div>' +
      '<div class="match-date">' + esc(prettyDate(m.date)) + '</div>' +
      '<div class="match-rivals">' + esc(rivalLine(m)) + '</div></div>' +
      '<span class="badge ' + badgeCls + '">' + esc(badge) + '</span></div>' +
      (m.isNormal ? '<div class="match-score">' + scoreLine(m) + '</div>' : '') +
      '<div class="tag-row">' +
      archetypeTags(m) +
      (m.readGameAbsolute ? '<span class="tag">Leído en el juego ' + m.readGameAbsolute + '</span>' : '') +
      '</div>' +
      '<div class="match-detail">' + matchDetailHtml(m) +
      '<div class="match-actions">' +
      '<button class="btn" data-edit="' + esc(m.id) + '">Editar</button>' +
      '<button class="btn danger" data-delete="' + esc(m.id) + '">Borrar</button>' +
      '</div></div></article>';
  }

  /* Si los dos rivales comparten perfil no se repite la etiqueta:
     se marca «×2». Así la tarjeta se lee de un vistazo. */
  function archetypeTags(m) {
    var order = [], count = {};
    (m.rivals || []).forEach(function (r) {
      if (!r || !r.archetype) return;
      if (count[r.archetype] == null) { count[r.archetype] = 0; order.push(r.archetype); }
      count[r.archetype]++;
    });
    return order.map(function (id) {
      var a = D.findById(D.ARCHETYPES, id);
      var cls = id === 'A' ? 'a' : (id === 'B' ? 'b' : '');
      return '<span class="tag ' + cls + '">' + esc(a ? a.label : id) +
        (count[id] > 1 ? ' ×' + count[id] : '') + '</span>';
    }).join('');
  }

  function dataCard() {
    return '<div class="card card-top" style="margin-top:26px">' +
      '<h3>Datos</h3>' +
      '<p class="field-note" style="margin-bottom:14px">Los partidos viven en este navegador. ' +
      'Exporta de vez en cuando: si borras los datos del sitio, se van con ellos.</p>' +
      '<div class="btn-row">' +
      '<button class="btn" data-action="export">Exportar JSON</button>' +
      '<button class="btn" data-action="import">Importar JSON</button></div>' +
      '<input type="file" id="import-file" accept="application/json,.json" hidden>' +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn ghost danger block" data-action="wipe">Borrar todos los partidos</button>' +
      '</div></div>';
  }

  function bindHistorial() {
    $view.querySelectorAll('[data-filter]').forEach(function (el) {
      el.addEventListener('click', function () {
        state.filters[el.getAttribute('data-filter')] = el.getAttribute('data-value');
        renderHistorial();
      });
    });
    var rival = document.getElementById('h-rival');
    if (rival) rival.addEventListener('input', function () {
      state.filters.rival = rival.value;
      var pos = rival.selectionStart;
      renderHistorial();
      var again = document.getElementById('h-rival');
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    });
    var month = document.getElementById('h-month');
    if (month) month.addEventListener('change', function () {
      state.filters.month = month.value;
      renderHistorial();
    });

    $view.querySelectorAll('[data-card]').forEach(function (card) {
      card.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-edit],[data-delete]')) return;
        var id = card.getAttribute('data-card');
        state.openCards[id] = !state.openCards[id];
        card.classList.toggle('open');
      });
    });
    $view.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var m = S.get(b.getAttribute('data-edit'));
        if (!m) return;
        state.form = formFromMatch(m);
        state.savedId = null;
        state.errors = [];
        go('registro');
      });
    });
    $view.querySelectorAll('[data-delete]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-delete');
        var m = S.get(id);
        if (!m) return;
        if (!global.confirm('¿Borrar el partido del ' + prettyDate(m.date) + '? No se puede deshacer.')) return;
        S.remove(id);
        toast('Partido borrado');
        renderHistorial();
      });
    });
    bindDataCard();
    bindCommon();
  }

  function bindDataCard() {
    var exportBtn = $view.querySelector('[data-action="export"]');
    if (exportBtn) exportBtn.addEventListener('click', function () {
      if (!S.all().length) { toast('No hay nada que exportar todavía', true); return; }
      S.download();
      toast('Backup descargado');
    });

    var importBtn = $view.querySelector('[data-action="import"]');
    var file = document.getElementById('import-file');
    if (importBtn && file) {
      importBtn.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var chosen = file.files && file.files[0];
        if (!chosen) return;
        var reader = new FileReader();
        reader.onload = function () {
          var check = S.inspectBackup(String(reader.result));
          file.value = '';
          if (!check.ok) { toast(check.message, true); return; }
          var current = S.all().length;
          var msg = 'El backup tiene ' + check.matches.length +
            (check.matches.length === 1 ? ' partido' : ' partidos') +
            (check.discarded ? ' (' + check.discarded + ' descartados por formato)' : '') + '.\n\n' +
            (current ? 'Se reemplazarán los ' + current + ' que tienes ahora. ' : '') +
            '¿Continuar?';
          if (!global.confirm(msg)) { toast('Importación cancelada'); return; }
          var n = S.replaceAll(check.matches);
          toast(n + ' partidos importados');
          renderHistorial();
        };
        reader.onerror = function () { toast('No he podido leer el archivo', true); };
        reader.readAsText(chosen);
      });
    }

    var wipe = $view.querySelector('[data-action="wipe"]');
    if (wipe) wipe.addEventListener('click', function () {
      var n = S.all().length;
      if (!n) { toast('No hay partidos que borrar', true); return; }
      if (!global.confirm('Vas a borrar los ' + n + ' partidos. Esto no se puede deshacer.\n\n' +
        '¿Has exportado un backup antes?')) return;
      S.clear();
      toast('Datos borrados');
      renderHistorial();
    });
  }

  /* ============================================================
     VISTA · ANÁLISIS
     ============================================================ */
  function renderAnalisis() {
    var sum = A.summary(S.all());
    if (!sum.total) {
      $view.innerHTML = emptyState('—',
        'Necesitamos más partidos para empezar a detectar patrones.',
        'Registrar partido', 'registro') + briefingHtml();
      bindBriefing();
      bindCommon();
      return;
    }

    var h = [];

    /* resumen */
    h.push('<div class="stat-grid">' +
      stat(sum.played, 'Partidos jugados', sum.special ? sum.special + ' WO/abandono aparte' : '') +
      stat(sum.won + '–' + sum.lost, 'Victorias / derrotas') +
      stat(sum.level === 'insufficient' ? '—' : sum.winRate + '<small>%</small>', 'Partidos ganados',
        sum.level === 'insufficient' ? 'Datos insuficientes' : sum.note) +
      stat(sum.reading.average == null ? '—' : Math.round(sum.reading.average * 10) / 10,
        'Juego medio de lectura',
        sum.reading.n ? sum.reading.n + ' observaciones' : 'Sin lecturas registradas') +
      '</div>');

    /* win rate por arquetipo */
    h.push('<div class="section" style="margin-top:26px"><div class="section-head">' +
      '<h2>Por arquetipo</h2><span class="hint">un partido cuenta una vez</span></div>');
    h.push('<div class="card">');
    D.ARCHETYPES.forEach(function (a) {
      var b = sum.byArchetype[a.id];
      var pct = b.rate == null ? 0 : b.rate;
      var cls = b.rate == null ? '' : (b.rate >= 60 ? '' : (b.rate >= 40 ? 'mid' : 'low'));
      h.push('<div class="bar-row"><span class="lab">' + esc(a.label) + '</span>' +
        '<span class="track"><i class="' + cls + '" style="width:' +
        (b.rate == null ? 0 : Math.max(pct, 3)) + '%"></i></span>' +
        (b.rate == null
          ? '<span class="val muted">' + (b.played ? b.played + ' part.' : 'sin datos') + '</span>'
          : '<span class="val">' + b.rate + '%</span>') +
        '</div>');
    });
    h.push('<p class="field-note">' + esc(sampleFootnote(sum)) + '</p></div></div>');

    /* lectura por arquetipo */
    h.push('<div class="section"><div class="section-head"><h2>Juego de lectura</h2>' +
      '<span class="hint">los «no lo leí» no entran en la media</span></div><div class="card">');
    var anyRead = false;
    D.ARCHETYPES.forEach(function (a) {
      var r = sum.readingByArchetype[a.id];
      if (!r.n && !r.notRead) return;
      anyRead = true;
      h.push('<div class="freq"><span>' + esc(a.label) + '</span><span class="c">' +
        (r.average == null ? 'sin lecturas' : 'juego ' + (Math.round(r.average * 10) / 10)) +
        ' · n=' + r.n + '</span></div>');
    });
    if (!anyRead) h.push('<p class="field-note">Todavía no has registrado ninguna lectura.</p>');
    else if (sum.reading.n < R.minSample) {
      h.push('<p class="field-note">Con ' + sum.reading.n +
        ' observaciones la media todavía no dice mucho. A partir de ' + R.minSample + ' empieza a valer.</p>');
    }
    h.push('</div></div>');

    /* evolución */
    h.push('<div class="section"><div class="section-head"><h2>Evolución</h2>' +
      '<span class="hint">mes a mes</span></div><div class="card">');
    if (sum.months.length < 2) {
      h.push('<p class="field-note">Hace falta más de un mes registrado para ver evolución.</p>');
    } else {
      var maxGames = Math.max.apply(null, sum.months.map(function (b) { return b.matches.length; }));
      h.push('<div class="spark">' + sum.months.map(function (b) {
        var height = Math.max(8, Math.round(100 * b.matches.length / maxGames));
        var cls = b.won > b.lost ? '' : (b.lost > b.won ? 'loss' : 'special');
        return '<div class="' + cls + '" style="height:' + height + '%" title="' +
          esc(A.monthLabel(b.key) + ': ' + b.won + '–' + b.lost) + '"></div>';
      }).join('') + '</div>');
      h.push('<div class="spark-ax"><span>' + esc(A.monthLabel(sum.months[0].key)) +
        '</span><span>' + esc(A.monthLabel(sum.months[sum.months.length - 1].key)) + '</span></div>');
      h.push('<div style="margin-top:16px">' + sum.months.map(function (b) {
        return '<div class="freq"><span>' + esc(A.monthLabel(b.key)) + '</span><span class="c">' +
          b.won + '–' + b.lost + (b.gamePct != null ? ' · ' + b.gamePct + '% juegos' : '') +
          (b.readAverage != null ? ' · lectura ' + (Math.round(b.readAverage * 10) / 10) : '') +
          '</span></div>';
      }).join('') + '</div>');
    }
    h.push('</div></div>');

    /* frecuencias */
    h.push(freqSection('Patrones más vistos', sum.patterns,
      'Todavía no has marcado patrones.'));
    h.push(freqSection('Qué funciona', sum.worked,
      'Todavía no has marcado nada en «qué funcionó».'));
    h.push(freqSection('Qué no funciona', sum.notWorked,
      'Todavía no has marcado nada en «qué no funcionó».'));
    h.push(briefingHtml());

    $view.innerHTML = h.join('');
    bindBriefing();
    bindCommon();
  }

  function stat(value, key, sub) {
    var muted = String(value) === '—';
    return '<div class="stat"><div class="n' + (muted ? ' muted' : '') + '">' + value + '</div>' +
      '<div class="k">' + esc(key) + '</div>' +
      (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function sampleFootnote(sum) {
    var thin = [];
    D.ARCHETYPES.forEach(function (a) {
      var b = sum.byArchetype[a.id];
      if (b.played > 0 && b.played < R.minSample) thin.push(a.label + ' (' + b.played + ')');
    });
    if (thin.length) {
      return 'Sin porcentaje donde hay menos de ' + R.minSample + ' partidos: ' + thin.join(', ') + '.';
    }
    return 'Los WO y abandonos no cuentan: no dicen nada del rival.';
  }

  function freqSection(title, list, emptyText) {
    var h = '<div class="section"><div class="section-head"><h2>' + esc(title) + '</h2></div><div class="card">';
    if (!list.length) h += '<p class="field-note">' + esc(emptyText) + '</p>';
    else h += list.slice(0, 8).map(function (item) {
      return '<div class="freq"><span>' + esc(item.label) + '</span>' +
        '<span class="c">' + item.count + '</span></div>';
    }).join('');
    return h + '</div></div>';
  }

  /* ============================================================
     VISTA · BRIEFING
     ============================================================ */
  function briefingHtml() {
    var matches = S.all();
    var brief = B.build(state.briefArchetype, matches);
    var h = [];

    h.push('<div class="section"><div class="section-head"><h2>Briefing por arquetipo</h2>' +
      '<span class="hint">cuando no sabes quién te toca</span></div>');
    h.push('<p class="lede">Máximo 3 cosas, para leerlas en el coche antes de jugar. ' +
      'Si ya sabes la pareja, usa <b>El rival</b>: ahí el plan sale de sus datos reales.</p>');
    h.push(chipsHtml(D.ARCHETYPES, 'brief', state.briefArchetype, false, 'grid2 accent'));

    h.push('<div class="section" style="margin-top:22px">');
    if (brief.context) {
      h.push('<p class="lede">' + esc(brief.context) + '</p>');
    }
    brief.bullets.forEach(function (b, i) {
      h.push('<div class="brief-bullet"><span class="i">' + (i + 1) + '</span>' +
        '<div><p>' + esc(b.text) + '</p>' +
        (b.source ? '<div class="brief-src">' + esc(b.source) + '</div>' : '') + '</div></div>');
    });
    h.push('</div>');

    if (brief.sample.played < R.minSample) {
      h.push('<div class="notice warn">Este plan sale de las hipótesis de partida, no de datos: ' +
        'llevas ' + brief.sample.played +
        (brief.sample.played === 1 ? ' partido' : ' partidos') +
        ' contra este perfil. A partir de ' + R.minSample +
        ' el briefing empieza a construirse con lo que registras.</div>');
    } else if (!brief.dataBullets) {
      h.push('<div class="notice">Hay ' + brief.sample.played + ' partidos contra este perfil, ' +
        'pero todavía no se repite nada lo bastante como para convertirlo en regla. ' +
        'El plan sigue siendo el de partida.</div>');
    } else {
      h.push('<div class="notice good">' + brief.dataBullets +
        (brief.dataBullets === 1 ? ' punto sale' : ' puntos salen') +
        ' de tus propios partidos, no de la hipótesis inicial.</div>');
    }

    h.push('</div>');
    return h.join('');
  }

  function bindBriefing() {
    var group = $view.querySelector('[data-chips="brief"]');
    if (group) group.addEventListener('click', function (ev) {
      var chip = ev.target.closest('.chip');
      if (!chip) return;
      state.briefArchetype = chip.getAttribute('data-value');
      renderAnalisis();
    });
  }

  /* ============================================================
     navegación
     ============================================================ */
  function bindCommon() {
    $view.querySelectorAll('[data-goto]').forEach(function (b) {
      if (b._bound) return;
      b._bound = true;
      b.addEventListener('click', function () { go(b.getAttribute('data-goto')); });
    });
  }

  function go(view) {
    if (!VIEWS[view]) view = 'registro';
    state.view = view;
    $title.textContent = VIEWS[view].title;
    $nav.querySelectorAll('[data-nav]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-nav') === view);
    });
    global.scrollTo({ top: 0 });
    var back = document.getElementById('back');
    if (back) back.hidden = view === 'inicio';
    document.body.setAttribute('data-view', view);
    if (global.PadelTemporada) global.PadelTemporada.stopTimer();

    if (view === 'inicio') global.PadelGeneral.renderInicio($view, bindLiga, go);
    else if (view === 'temporada') global.PadelTemporada.renderTemporada($view, bindLiga);
    else if (view === 'liga') global.PadelGeneral.renderGeneral($view, bindLiga);
    else if (view === 'cronica') global.PadelGeneral.renderCronica($view, bindLiga);
    else if (view === 'rival') global.PadelLiga.renderRival($view, bindLiga);
    else if (view === 'registro') renderRegistro();
    else if (view === 'historial') renderHistorial();
    else renderAnalisis();
  }

  /* Eventos de las pantallas de liga: abrir un rival, buscar y refrescar. */
  function bindLiga() {
    var ls = global.PadelLiga.state;

    $view.querySelectorAll('[data-rival]').forEach(function (b) {
      if (b._bound) return;
      b._bound = true;
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        ls.rivalId = Number(b.getAttribute('data-rival'));
        go('rival');
      });
    });

    var search = document.getElementById('rival-search');
    if (search) search.addEventListener('input', function () {
      ls.rivalQuery = search.value;
      ls.rivalId = null;
      var pos = search.selectionStart;
      global.PadelLiga.renderRival($view, bindLiga);
      var again = document.getElementById('rival-search');
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    });

    var clear = $view.querySelector('[data-action="clear-rival"]');
    if (clear) clear.addEventListener('click', function () {
      ls.rivalId = null;
      global.PadelLiga.renderRival($view, bindLiga);
    });

    var refresh = $view.querySelector('[data-action="refresh"]');
    if (refresh) refresh.addEventListener('click', function () {
      refresh.textContent = 'actualizando…';
      global.PadelLiga.reload(function () {
        toast('Liga actualizada');
        go(state.view);
      });
    });

    bindCommon();
  }

  function init() {
    $view = document.getElementById('view');
    $title = document.getElementById('page-title');
    $nav = document.querySelector('.bottom-nav');
    $nav.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-nav]');
      if (b) go(b.getAttribute('data-nav'));
    });
    var back = document.getElementById('back');
    if (back) back.addEventListener('click', function () { go('inicio'); });
    initCompetition();
    /* Con sesión abierta, recuerda quién eres (vale para todas las competiciones). */
    if (global.PadelAuth.user && global.PadelAuth.user()) {
      global.PadelDB.fetchProfile().then(function () {
        var m = global.PadelLiga.state.model;
        if (m) { global.PadelLiga.applyMe(m); go(state.view); }
      }).catch(function () {});
    }
    go('inicio');
  }

  /* ============================================================
     competición: un interruptor arriba para toda la app
     ============================================================ */
  var KIND = { masculina: 'Masculina', mixta: 'Mixta', femenina: 'Femenina' };

  function initCompetition() {
    var btn = document.getElementById('comp-btn');
    var menu = document.getElementById('comp-menu');
    if (!btn || !menu) return;

    function paintButton() {
      var list = global.PadelLiga.state.seasons || [];
      var slug = global.PadelDB.currentSeason();
      var cur = list.filter(function (x) { return x.slug === slug; })[0];
      var kind = (cur && cur.kind) || 'masculina';
      btn.setAttribute('data-kind', kind);
      document.getElementById('comp-label').textContent = KIND[kind] || kind;
      btn.title = 'Competición: ' + ((cur && cur.name) || slug) + ' · cambiar';
    }

    function paintMenu() {
      var list = global.PadelLiga.state.seasons || [];
      var slug = global.PadelDB.currentSeason();
      menu.innerHTML = '<div class="comp-title">Competición</div>' + list.map(function (x) {
        return '<button type="button" class="comp-item" role="menuitemradio" data-slug="' + esc(x.slug) +
          '" data-kind="' + esc(x.kind) + '" aria-checked="' + (x.slug === slug) + '">' +
          '<i class="comp-dot"></i><span><b>' + esc(KIND[x.kind] || x.kind) + '</b><small>' +
          esc(x.name) + (x.matches != null ? ' · ' + x.matches + ' partidos' : '') + '</small></span></button>';
      }).join('') + (list.length < 2
        ? '<p class="comp-empty">Cuando cargues otra competición desde La liga, aparecerá aquí.</p>' : '');
    }

    function close() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    function open() {
      paintMenu(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
      var first = menu.querySelector('[aria-checked="true"]') || menu.querySelector('.comp-item');
      if (first) first.focus();
    }

    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (menu.hidden) open(); else close();
    });
    document.addEventListener('click', function (ev) {
      if (!menu.hidden && !menu.contains(ev.target)) close();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !menu.hidden) { close(); btn.focus(); }
    });
    menu.addEventListener('click', function (ev) {
      var item = ev.target.closest('[data-slug]');
      if (!item) return;
      var slug = item.getAttribute('data-slug');
      close();
      if (slug === global.PadelDB.currentSeason()) return;
      document.body.classList.add('switching');
      global.PadelLiga.switchSeason(slug, function () {
        document.body.classList.remove('switching');
        paintButton();
        var s = (global.PadelLiga.state.seasons || []).filter(function (x) { return x.slug === slug; })[0];
        toast('Ahora ves: ' + (s ? (KIND[s.kind] || s.kind) + ' · ' + s.name : slug));
        go(state.view);
      });
    });

    refreshSeasons = function () {
      return global.PadelDB.listSeasons().then(function (list) {
        global.PadelLiga.state.seasons = list;
        /* Si la temporada guardada ya no existe, vuelve a la de por defecto. */
        var slug = global.PadelDB.currentSeason();
        if (!list.some(function (x) { return x.slug === slug; }) && list.length) {
          global.PadelLiga.switchSeason(list.filter(function (x) {
            return x.slug === global.PadelDB.CFG.season; })[0] ? global.PadelDB.CFG.season : list[0].slug,
            function () { go(state.view); });
        }
        paintButton();
      });
    };
    paintButton();
    refreshSeasons();
  }

  var refreshSeasons = function () { return Promise.resolve(); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  global.PadelApp = { refreshSeasons: function () { return refreshSeasons(); }, go: go, state: state };
})(window);
