/* ============================================================
   horarios.js · «Nuestros horarios» (dentro de Este mes)
   Cada jugador marca en su móvil los días y bloques en que puede jugar
   la ronda; la app cruza los de la pareja y saca el calendario común,
   que se comparte a los rivales como imagen (WhatsApp).
   · Entre semana: 4 bloques de 1 h 15 min (18:00, 19:15, 20:30, 21:45).
   · Fin de semana: el día entero («Libre»); la hora la acuerda la pareja.
   · Los horarios son de la persona y valen para todas sus parejas, salvo
     que marque «Distinto para esta pareja».
   · Si la pareja no usa la app, el calendario son tus horarios (y lo dice).
   Base: get_pair_availability, save_availability, delete_pair_availability.
   ============================================================ */
(function (global) {
  'use strict';

  var BLOCKS = [['18:00', '19:15'], ['19:15', '20:30'], ['20:30', '21:45'], ['21:45', '23:00']];
  var ALL = 15;
  var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var LOAD_TIMEOUT_MS = 15000;
  var STALE_MS = 60000;

  function DB() { return global.PadelDB; }
  function app() { return global.PadelApp; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function now() { return global.__PADEL_NOW__ ? new Date(global.__PADEL_NOW__) : new Date(); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function isoOf(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function todayIso() { var d = now(); return isoOf(d.getFullYear(), d.getMonth(), d.getDate()); }
  function parts(iso) { var p = String(iso).split('-'); return [+p[0], +p[1] - 1, +(p[2] || 1)]; }
  function dow(iso) { var p = parts(iso); return new Date(p[0], p[1], p[2]).getDay(); }

  /* ---------- lógica pura ---------- */

  /* Primer día del mes de la ronda («2026-12-14» → «2026-12-01»). */
  function monthOf(iso) { var p = parts(iso); return isoOf(p[0], p[1], 1); }

  /* Meses que cubre la ronda: la de julio se juega en julio y agosto; la de
     diciembre, en diciembre y enero (js/calendario.js). El resto, un mes. */
  function windowMonths(monthIso) {
    var p = parts(monthIso), out = [[p[0], p[1]]];
    if (p[1] === 6) out.push([p[0], 7]);
    if (p[1] === 11) out.push([p[0] + 1, 0]);
    return out;
  }
  function daysOfMonth(y, m) {
    var n = new Date(y, m + 1, 0).getDate(), out = [];
    for (var d = 1; d <= n; d++) out.push(isoOf(y, m, d));
    return out;
  }
  /* Primer mes del periodo siguiente: tras julio (julio-agosto) va septiembre;
     tras diciembre (diciembre-enero), febrero; si no, el mes de después. */
  function nextPeriod(monthIso) {
    var w = windowMonths(monthIso), last = w[w.length - 1];
    var y = last[0], m = last[1] + 1;
    if (m > 11) { m = 0; y++; }
    return isoOf(y, m, 1);
  }
  function windowDays(monthIso) {
    return windowMonths(monthIso).reduce(function (a, ym) { return a.concat(daysOfMonth(ym[0], ym[1])); }, []);
  }
  function isWeekend(iso) { var w = dow(iso); return w === 0 || w === 6; }

  /* «18:00» → «18», «19:15» → «19:15». */
  function shortTime(t) { return /:00$/.test(t) ? t.slice(0, 2) : t; }

  /* Bloques encendidos → tramos seguidos: 6 (19:15 y 20:30) → [['19:15','21:45']]. */
  function runs(mask) {
    var out = [], cur = null;
    for (var i = 0; i < 4; i++) {
      if (mask & (1 << i)) {
        if (cur) cur[1] = BLOCKS[i][1]; else { cur = [BLOCKS[i][0], BLOCKS[i][1]]; out.push(cur); }
      } else cur = null;
    }
    return out;
  }
  /* Texto corto del día: «19:15–23», «18–19:15 · 21:45–23», «Libre» (fin de semana). */
  function rangeText(iso, mask) {
    if (!mask) return '';
    if (isWeekend(iso)) return 'Libre';
    return runs(mask).map(function (r) { return shortTime(r[0]) + '–' + shortTime(r[1]); }).join(' · ');
  }
  function bits(mask) { var n = 0; for (var i = 0; i < 4; i++) if (mask & (1 << i)) n++; return n; }

  /* Cruza los horarios de la pareja.
     players: lo que devuelve get_pair_availability.
     → { me, mate, mode, shared: {iso: mask}, mine, theirs }
     mode: 'sin-marcar' (tú aún no), 'solo' (tu pareja no usa la app),
           'pendiente' (tu pareja aún no ha marcado), 'pareja' (los dos). */
  function combine(players) {
    var list = players || [];
    var me = list.filter(function (p) { return p.is_me; })[0] || null;
    var mate = list.filter(function (p) { return !p.is_me; })[0] || null;
    var mine = (me && me.status === 'marcado') ? (me.days || {}) : null;
    var theirs = (mate && mate.status === 'marcado') ? (mate.days || {}) : null;
    var mode = !mine ? 'sin-marcar' : (mate && !mate.has_account && !theirs) ? 'solo' : !theirs ? 'pendiente' : 'pareja';
    var shared = {};
    if (mine) Object.keys(mine).forEach(function (d) {
      var m = +mine[d] || 0;
      if (theirs) m = m & (+theirs[d] || 0);
      if (m) shared[d] = m;
    });
    return { me: me, mate: mate, mode: mode, shared: shared, mine: mine || {}, theirs: theirs || {} };
  }

  /* ---------- estado ---------- */
  /* base = mes de la ronda en curso; period = 'actual' o 'siguiente' (el calendario del mes que viene,
     para tenerlo listo el día 1, cuando salen los rivales); month = el que se ve. */
  var state = { key: null, data: null, loading: false, error: null, at: 0, seq: 0, team: null, month: null, base: null,
    period: 'actual', label: '', ctx: null };

  function setMonth() {
    state.month = state.period === 'siguiente' ? nextPeriod(state.base) : state.base;
  }

  function keyOf(teamId, month) { return teamId + '|' + month; }

  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('La base no responde. Prueba otra vez.')); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function load(force) {
    if (!state.team || !state.month) return;
    var key = keyOf(state.team, state.month);
    if (!force && state.key === key && (state.loading || (state.data && Date.now() - state.at < STALE_MS))) return;
    if (state.key !== key) { state.data = null; state.error = null; }
    state.key = key; state.loading = true;
    var seq = ++state.seq;
    paintSection();
    withTimeout(DB().callAuthed('get_pair_availability', { p_team_id: state.team, p_month: state.month }), LOAD_TIMEOUT_MS)
      .then(function (rows) {
        if (seq !== state.seq) return;
        state.data = Array.isArray(rows) ? rows : []; state.error = null; state.at = Date.now();
      }, function (err) {
        if (seq !== state.seq) return;
        /* Sin red no se inventa un calendario vacío: se dice y se deja reintentar. */
        state.error = (err && err.message) || 'No se pudieron cargar los horarios.';
      }).then(function () {
        if (seq !== state.seq) return;
        state.loading = false; paintSection();
      });
  }

  /* ---------- bloque en Este mes ---------- */

  /* Lo llama Este mes al pintar la ronda. */
  function sectionHtml(round, model) {
    if (!round || !round.myTeamId || !round.monthStart) return '';
    state.team = round.myTeamId;
    var base = monthOf(round.monthStart);
    if (state.base !== base) {
      state.base = base;
      /* Si en la ronda ya no queda ningún día por jugar, se abre directamente el siguiente. */
      var t = todayIso();
      state.period = windowDays(base).some(function (d) { return d >= t; }) ? 'actual' : 'siguiente';
    }
    setMonth();
    var t = model && model.teams && model.teams[round.myTeamId];
    state.label = t ? t.label : '';
    state.ctx = { round: round, kind: (model && model.season && model.season.kind) || 'masculina' };
    return '<section class="blk em-av" id="em-av">' + innerHtml() + '</section>';
  }

  function bind(view) {
    var box = view.querySelector('#em-av');
    if (!box) return;
    bindSection(box);
    load(false);
  }

  function paintSection() {
    var box = global.document && document.getElementById('em-av');
    if (!box) return;
    box.innerHTML = innerHtml();
    bindSection(box);
  }

  function windowTitle(month) {
    var ms = windowMonths(month || state.month).map(function (ym) { return MESES[ym[1]]; });
    return ms.join(' y ');
  }
  /* «Septiembre» (la ronda en curso) o el mes que abre el periodo siguiente. */
  function roundLabel() {
    if (state.period === 'actual' && state.ctx && state.ctx.round.label) return state.ctx.round.label;
    return MESES[parts(state.month)[1]];
  }

  function periodHtml() {
    var nx = nextPeriod(state.base);
    return '<div class="chips tight av-period" role="group" aria-label="Qué periodo ves">' +
      '<button type="button" class="chip" data-av-period="actual" aria-pressed="' + (state.period === 'actual') + '">' +
        'Este mes · ' + esc(MESES[parts(state.base)[1]]) + '</button>' +
      '<button type="button" class="chip" data-av-period="siguiente" aria-pressed="' + (state.period === 'siguiente') + '">' +
        'Siguiente · ' + esc(MESES[parts(nx)[1]]) + '</button></div>';
  }

  function innerHtml() {
    var h = ['<h3 class="em-h3">Nuestros horarios</h3>', periodHtml()];
    if (state.error && !state.data) {
      h.push('<div class="notice bad">No se pudieron cargar los horarios: ' + esc(state.error) + '</div>' +
        '<div class="btn-row"><button class="btn ghost" data-av="retry">Reintentar</button></div>');
      return h.join('');
    }
    if (!state.data) { h.push('<p class="note">Cargando los horarios…</p>'); return h.join(''); }
    var c = combine(state.data), mateName = c.mate ? esc(firstName(c.mate.name)) : 'tu pareja';
    h.push('<p class="lede">Cada uno marca en su móvil cuándo puede jugar en ' + esc(windowTitle()) +
      '. En <b>verde</b>, cuando podéis los dos: es lo que se manda a los rivales.' +
      (state.period === 'siguiente' ? ' Déjalo listo antes del día 1, cuando salen los rivales.' : '') + '</p>');
    if (c.mode === 'sin-marcar') {
      h.push('<div class="notice warn">Aún no has marcado tus horarios.' +
        (c.mate && c.mate.status === 'marcado' ? ' ' + mateName + ' ya ha marcado los suyos.' : '') + '</div>');
    } else if (c.mode === 'solo') {
      h.push('<div class="notice">' + mateName + ' no usa la app: el calendario son <b>tus</b> horarios y así se comparte.</div>');
    } else if (c.mode === 'pendiente') {
      h.push('<div class="notice warn">Falta que ' + mateName + ' marque sus horarios. Mientras, el calendario son solo los tuyos.</div>');
    }
    if (state.error) h.push('<p class="note">No se pudo actualizar (' + esc(state.error) + '): ves lo último cargado.</p>');
    if (c.mode !== 'sin-marcar') h.push(calendarHtml(c));
    var mine = c.me && c.me.status === 'marcado';
    h.push('<div class="btn-row">' +
      '<button class="btn' + (mine ? ' ghost' : ' primary') + '" data-av="edit">' + (mine ? 'Cambiar mis horarios' : 'Marcar mis horarios') + '</button>' +
      (c.mode !== 'sin-marcar' ? '<button class="btn primary" data-av="share"' + (Object.keys(c.shared).length ? '' : ' disabled') +
        '>Compartir con los rivales</button>' : '') + '</div>');
    if (mine) h.push('<p class="note">Tus horarios: ' + (c.me.scope === 'pareja' ? '<b>solo para esta pareja</b>.'
      : 'valen para <b>todas tus parejas</b> (puedes marcar unos distintos para esta).') + '</p>');
    return h.join('');
  }

  function firstName(n) { return String(n || '').split(/\s+/)[0] || 'Tu pareja'; }

  /* Calendario de la pareja: verde = podéis los dos; los rectángulos son los 4 bloques. */
  function calendarHtml(c) {
    var two = c.mode === 'pareja', today = todayIso();
    var h = [];
    windowMonths(state.month).forEach(function (ym) {
      var days = daysOfMonth(ym[0], ym[1]);
      if (windowMonths(state.month).length > 1) h.push('<div class="av-month">' + MESES[ym[1]] + '</div>');
      h.push('<div class="av-cal" role="grid" aria-label="Calendario de ' + MESES[ym[1]] + '">' +
        SEMANA.map(function (s) { return '<span class="av-wd">' + s + '</span>'; }).join(''));
      var lead = (dow(days[0]) + 6) % 7;
      for (var i = 0; i < lead; i++) h.push('<span class="av-pad"></span>');
      days.forEach(function (d) {
        var sh = c.shared[d] || 0, any = (+c.mine[d] || 0) | (+c.theirs[d] || 0);
        var cls = 'av-day' + (sh ? ' both' : any && two ? ' one' : '') + (d < today ? ' past' : '') + (isWeekend(d) ? ' we' : '');
        var label = parts(d)[2] + ' ' + DIAS[dow(d)] + ': ' + (sh ? 'podéis, ' + rangeText(d, sh) : any && two ? 'solo puede uno' : 'no');
        h.push('<div class="' + cls + '" role="gridcell" aria-label="' + esc(label) + '"><b>' + parts(d)[2] + '</b>' +
          (isWeekend(d) ? '' : barsHtml(sh, two ? any : 0)) +
          '<small>' + esc(rangeText(d, sh)) + '</small></div>');
      });
      h.push('</div>');
    });
    h.push('<p class="note av-legend"><span class="av-k both"></span> podéis los dos' +
      (two ? ' · <span class="av-k one"></span> solo uno' : '') +
      ' · bloques de 1 h 15: 18:00 · 19:15 · 20:30 · 21:45. Fin de semana: día libre, la hora la acordáis.</p>');
    return h.join('');
  }

  function barsHtml(on, half) {
    var s = '<span class="av-bars" aria-hidden="true">';
    for (var i = 0; i < 4; i++) {
      var b = 1 << i;
      s += '<i class="' + (on & b ? 'on' : half & b ? 'half' : '') + '"></i>';
    }
    return s + '</span>';
  }

  function bindSection(box) {
    box.querySelectorAll('[data-av-period]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-av-period');
        if (p === state.period) return;
        state.period = p; setMonth(); state.data = null; state.error = null;
        load(true);
      });
    });
    box.querySelectorAll('[data-av]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-av');
        if (a === 'retry') load(true);
        else if (a === 'edit') openEditor();
        else if (a === 'share') share();
      });
    });
  }

  /* ============================================================
     EDITOR · paso 1: días (los que puedo / los que NO puedo)
               paso 2: horas de cada día abierto
     ============================================================ */
  var ed = null;

  function futureDays() {
    var t = todayIso();
    return windowDays(state.month).filter(function (d) { return d >= t; });
  }

  function openEditor() {
    if (!state.data) return;          /* sin datos cargados no se edita (no se pisa nada a ciegas) */
    var c = combine(state.data);
    var mine = c.me && c.me.status === 'marcado' ? c.me.days || {} : {};
    var days = {};
    Object.keys(mine).forEach(function (d) { if (+mine[d]) days[d] = +mine[d]; });
    var fut = futureDays(), free = fut.filter(function (d) { return days[d]; }).length;
    var hadPair = !!(c.me && c.me.status === 'marcado' && c.me.scope === 'pareja');
    ed = { step: 1, mode: fut.length && free > fut.length / 2 ? 'cant' : 'can', days: days, pair: hadPair,
      hadPair: hadPair, focus: null, busy: false, error: null };
    paintEditor();
  }

  function setMode(mode) {
    if (ed.mode === mode) return;
    ed.mode = mode;
    /* «Marco los que NO puedo» parte de todo el mes libre si aún no hay nada marcado. */
    if (mode === 'cant' && !futureDays().some(function (d) { return ed.days[d]; })) {
      futureDays().forEach(function (d) { ed.days[d] = ALL; });
    }
  }

  function tapDay(d) {
    if (ed.step === 1) {
      if (ed.days[d]) delete ed.days[d]; else ed.days[d] = ALL;
    } else if ((d in ed.days) && !isWeekend(d)) {
      ed.focus = ed.focus === d ? null : d;
    }
  }

  function editorCalHtml() {
    var today = todayIso(), h = [];
    windowMonths(state.month).forEach(function (ym) {
      var days = daysOfMonth(ym[0], ym[1]);
      if (windowMonths(state.month).length > 1) h.push('<div class="av-month">' + MESES[ym[1]] + '</div>');
      h.push('<div class="av-cal edit">' + SEMANA.map(function (s) { return '<span class="av-wd">' + s + '</span>'; }).join(''));
      var lead = (dow(days[0]) + 6) % 7;
      for (var i = 0; i < lead; i++) h.push('<span class="av-pad"></span>');
      days.forEach(function (d) {
        var past = d < today, on = +ed.days[d] || 0, we = isWeekend(d);
        var cls = 'av-day', pressed = false, dis = past;
        if (ed.step === 1) {
          if (ed.mode === 'can') { if (on) { cls += ' sel'; pressed = true; } }
          else if (!on && !past) { cls += ' busy'; pressed = true; }
        } else {
          /* Paso 2: solo se tocan los días abiertos entre semana (aunque les hayas quitado todos los bloques). */
          var open = (d in ed.days) && !past;
          if (open) cls += on ? ' sel' : ' empty';
          if (ed.focus === d) cls += ' focus';
          dis = !open || we;
        }
        if (past) cls += ' past';
        if (we) cls += ' we';
        var lab = parts(d)[2] + ' ' + DIAS[dow(d)];
        h.push('<button type="button" class="' + cls + '" data-ed-day="' + d + '"' + (dis ? ' disabled' : '') +
          ' aria-pressed="' + pressed + '" aria-label="' + esc(lab) + '"><b>' + parts(d)[2] + '</b>' +
          (ed.step === 2 && (d in ed.days) ? (we ? (on ? '<small>Libre</small>' : '') : barsHtml(on, 0)) : '') + '</button>');
      });
      h.push('</div>');
    });
    return h.join('');
  }

  function paintEditor() {
    var h = ['<div class="modal-card em-modal av-modal" role="dialog" aria-modal="true" aria-labelledby="av-t">'];
    h.push('<div class="eyebrow">' + esc(state.label) + '</div>');
    if (ed.step === 1) {
      h.push('<h2 id="av-t">Tus días de ' + esc(windowTitle()) + '</h2>');
      h.push('<div class="chips tight av-mode" role="group" aria-label="Qué marcas">' +
        '<button type="button" class="chip" data-ed-mode="can" aria-pressed="' + (ed.mode === 'can') + '">Días que puedo</button>' +
        '<button type="button" class="chip" data-ed-mode="cant" aria-pressed="' + (ed.mode === 'cant') + '">Días que NO puedo</button></div>');
      h.push('<p class="field-note">' + (ed.mode === 'can' ? 'Toca los días en que puedes jugar.'
        : 'En blanco, los días que puedes: toca los días en que <b>no</b> puedes.') + ' Luego eliges las horas.</p>');
      h.push(editorCalHtml());
      h.push('<div class="chips av-scope"><button type="button" class="chip" data-ed-pair aria-pressed="' + ed.pair + '">' +
        'Distinto para esta pareja</button></div><p class="field-note">' + (ed.pair
        ? 'Estos horarios valdrán <b>solo</b> para ' + esc(state.label) + '.'
        : 'Estos horarios valen para todas tus parejas (mixto y no mixto).') + '</p>');
      if (ed.error) h.push('<div class="notice bad">' + esc(ed.error) + '</div>');
      var n = futureDays().filter(function (d) { return ed.days[d]; }).length;
      h.push('<div class="btn-row"><button class="btn primary" data-ed="next">Siguiente: horas</button>' +
        '<button class="btn ghost" data-ed="cancel">Cancelar</button></div>' +
        '<p class="field-note">' + n + (n === 1 ? ' día libre' : ' días libres') + ' a partir de hoy.</p></div>');
    } else {
      h.push('<h2 id="av-t">¿A qué hora puedes?</h2>');
      h.push('<p class="field-note">Entre semana vienen encendidos los 4 bloques. Toca un día para quitar los que no puedes. ' +
        'El fin de semana cuenta el día entero.</p>');
      h.push(editorCalHtml());
      if (ed.focus) {
        var m = +ed.days[ed.focus] || 0;
        h.push('<div class="av-pick"><div class="field-label">' + esc(DIAS[dow(ed.focus)] + ' ' + parts(ed.focus)[2]) + '</div>' +
          '<div class="chips grid2">' + BLOCKS.map(function (b, i) {
            return '<button type="button" class="chip" data-ed-block="' + i + '" aria-pressed="' + !!(m & (1 << i)) + '">' +
              b[0] + ' – ' + b[1] + '</button>';
          }).join('') + '</div>' +
          '<div class="btn-row tight"><button type="button" class="btn small ghost" data-ed="copy">Mismo horario a todos los días entre semana</button></div></div>');
      }
      if (ed.error) h.push('<div class="notice bad">' + esc(ed.error) + '</div>');
      h.push('<div class="btn-row"><button class="btn primary" data-ed="save"' + (ed.busy ? ' disabled' : '') + '>' +
        (ed.busy ? 'Guardando…' : 'Guardar mis horarios') + '</button>' +
        '<button class="btn ghost" data-ed="back"' + (ed.busy ? ' disabled' : '') + '>Atrás</button></div></div>');
    }
    var root = openModal(h.join(''));
    root.querySelectorAll('[data-ed-day]').forEach(function (b) {
      b.addEventListener('click', function () { tapDay(b.getAttribute('data-ed-day')); paintEditor(); });
    });
    root.querySelectorAll('[data-ed-mode]').forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-ed-mode')); paintEditor(); });
    });
    root.querySelectorAll('[data-ed-pair]').forEach(function (b) {
      b.addEventListener('click', function () { ed.pair = !ed.pair; paintEditor(); });
    });
    root.querySelectorAll('[data-ed-block]').forEach(function (b) {
      b.addEventListener('click', function () {
        ed.days[ed.focus] = (+ed.days[ed.focus] || 0) ^ (1 << +b.getAttribute('data-ed-block'));
        paintEditor();
      });
    });
    root.querySelectorAll('[data-ed]').forEach(function (b) {
      b.addEventListener('click', function () { editorAction(b.getAttribute('data-ed')); });
    });
  }

  function editorAction(a) {
    if (a === 'cancel') { closeModal(); return; }
    if (a === 'next') { ed.step = 2; ed.error = null; ed.focus = null; paintEditor(); return; }
    if (a === 'back') { ed.step = 1; ed.error = null; paintEditor(); return; }
    if (a === 'copy') {
      var m = +ed.days[ed.focus] || 0;
      Object.keys(ed.days).forEach(function (d) { if (!isWeekend(d) && ed.days[d] && d >= todayIso()) ed.days[d] = m || ed.days[d]; });
      if (app()) app().toast('Mismo horario en todos tus días entre semana.');
      paintEditor(); return;
    }
    if (a === 'save') save();
  }

  /* Solo días de la ronda con algún bloque; el fin de semana siempre entero. */
  function payloadDays() {
    var inWin = {}; windowDays(state.month).forEach(function (d) { inWin[d] = true; });
    var out = {};
    Object.keys(ed.days).forEach(function (d) {
      var m = +ed.days[d] || 0;
      if (!inWin[d] || !m) return;
      out[d] = isWeekend(d) ? ALL : m;
    });
    return out;
  }

  function save() {
    ed.busy = true; ed.error = null; paintEditor();
    var team = state.team, month = state.month, pair = ed.pair;
    var first = (!pair && ed.hadPair)
      ? DB().callAuthed('delete_pair_availability', { p_team_id: team, p_month: month })
      : Promise.resolve();
    first.then(function () {
      return DB().callAuthed('save_availability', { p: { month: month, team_id: pair ? team : null, days: payloadDays() } });
    }).then(function () {
      closeModal();
      if (app()) app().toast('Horarios guardados.');
      load(true);
    }, function (err) {
      ed.busy = false;
      ed.error = 'No se han guardado: ' + ((err && err.message) || 'error de red') + '. Vuelve a intentarlo.';
      paintEditor();
    });
  }

  function openModal(html) {
    var root = document.getElementById('modal-root');
    root.innerHTML = '<div class="modal">' + html + '</div>';
    document.body.classList.add('has-modal');
    return root;
  }
  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
    document.body.classList.remove('has-modal');
    ed = null;
  }

  /* ============================================================
     IMAGEN PARA COMPARTIR (se dibuja en el móvil, sin servidor)
     ============================================================ */
  /* Colores de la imagen: los del tema que tiene la persona en la app (claro u oscuro). */
  var DARK = { ink: '#0E1109', panel: '#161B12', panel2: '#1E2418', line: '#2C3423', bone: '#EDEBE3',
    mute: '#9AA48C', sage: '#8FA678', sageDk: '#687F4E', orange: '#ED6C05' };

  function palette() {
    var out = {}, cs = null;
    try { cs = global.getComputedStyle(document.documentElement); } catch (e) {}
    var vars = { ink: '--ink', panel: '--panel', panel2: '--panel2', line: '--line', bone: '--bone',
      mute: '--mute', sage: '--sage', sageDk: '--sage-dk', orange: '--orange' };
    Object.keys(vars).forEach(function (k) {
      var v = cs ? String(cs.getPropertyValue(vars[k]) || '').trim() : '';
      out[k] = v || DARK[k];
    });
    return out;
  }

  function drawImage(c) {
    var C = palette();
    var W = 1080, PAD = 56, GAP = 10, cw = (W - 2 * PAD - 6 * GAP) / 7, ch = 118;
    var months = windowMonths(state.month);
    var weeks = months.map(function (ym) {
      var days = daysOfMonth(ym[0], ym[1]);
      return Math.ceil(((dow(days[0]) + 6) % 7 + days.length) / 7);
    });
    var H = 300 + months.reduce(function (a, ym, i) { return a + 96 + weeks[i] * (ch + GAP); }, 0) + 170;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    var F = function (w, s, fam) { return w + ' ' + s + 'px ' + (fam || 'Archivo, "IBM Plex Sans", system-ui, sans-serif'); };
    g.fillStyle = C.ink; g.fillRect(0, 0, W, H);
    g.fillStyle = C.orange; g.fillRect(0, 0, W, 10);

    g.textBaseline = 'alphabetic';
    g.fillStyle = C.orange; g.font = F('600', 26, '"IBM Plex Mono", ui-monospace, monospace');
    g.fillText('HORARIOS PARA JUGAR · RONDA DE ' + String(roundLabel()).toUpperCase(), PAD, 82);
    g.fillStyle = C.bone; g.font = F('900', 54);
    fitText(g, state.label || 'Nuestra pareja', PAD, 150, W - 2 * PAD);
    g.fillStyle = C.mute; g.font = F('400', 28);
    var sub = c.mode === 'pareja' ? 'En verde, cuando podemos jugar los dos.'
      : c.mode === 'solo' ? 'Horarios de ' + firstName(c.me && c.me.name) + ' (coordina la pareja).'
      : 'Horarios de ' + firstName(c.me && c.me.name) + '; faltan los de ' + firstName(c.mate && c.mate.name) + '.';
    fitText(g, sub, PAD, 200, W - 2 * PAD);

    var y = 260, today = todayIso();
    months.forEach(function (ym, mi) {
      g.fillStyle = C.bone; g.font = F('900', 34);
      g.fillText(MESES[ym[1]].toUpperCase() + ' ' + ym[0], PAD, y + 34);
      y += 56;
      g.font = F('600', 22, '"IBM Plex Mono", ui-monospace, monospace'); g.fillStyle = C.mute;
      SEMANA.forEach(function (s, i) { g.fillText(s, PAD + i * (cw + GAP) + 8, y + 22); });
      y += 40;
      var days = daysOfMonth(ym[0], ym[1]), lead = (dow(days[0]) + 6) % 7;
      days.forEach(function (d, i) {
        var k = lead + i, col = k % 7, row = Math.floor(k / 7);
        var x = PAD + col * (cw + GAP), yy = y + row * (ch + GAP);
        var sh = d >= today ? (c.shared[d] || 0) : 0;
        roundRect(g, x, yy, cw, ch, 12);
        g.fillStyle = sh ? C.sage : C.panel; g.fill();
        g.strokeStyle = sh ? C.sage : C.line; g.lineWidth = 2; g.stroke();
        g.fillStyle = sh ? C.ink : (d < today ? C.line : C.mute);
        g.font = F('800', 30); g.fillText(String(parts(d)[2]), x + 12, yy + 38);
        if (!sh) return;
        if (isWeekend(d)) {
          g.font = F('700', 24); g.fillText('Libre', x + 12, yy + ch - 18);
        } else {
          var bw = (cw - 24 - 9) / 4;
          for (var b = 0; b < 4; b++) {
            g.fillStyle = C.ink; g.globalAlpha = sh & (1 << b) ? 1 : 0.22;
            g.fillRect(x + 12 + b * (bw + 3), yy + 54, bw, 14);
            g.globalAlpha = 1;
          }
          /* El rango entero, con la letra más pequeña si no cabe (19:15–21:45). */
          var txt = rangeText(d, sh), fs = 20;
          g.font = F('700', fs);
          while (fs > 13 && g.measureText(txt).width > cw - 18) { fs--; g.font = F('700', fs); }
          g.fillStyle = C.ink;
          fitText(g, txt, x + 10, yy + ch - 16, cw - 18);
        }
      });
      y += weeks[mi] * (ch + GAP) + 30;
    });

    g.fillStyle = C.mute; g.font = F('400', 24);
    g.fillText('Partidos de 1 h 15: 18:00 · 19:15 · 20:30 · 21:45.', PAD, y + 20);
    g.fillText('Fin de semana: libres todo el día; proponed la hora.', PAD, y + 56);
    g.fillStyle = C.sageDk; g.font = F('600', 22, '"IBM Plex Mono", ui-monospace, monospace');
    g.fillText('PADEL SCOUTING', PAD, H - 40);
    return cv;
  }

  function fitText(g, text, x, y, max) {
    var t = String(text);
    while (t.length > 1 && g.measureText(t).width > max) t = t.slice(0, -2) + '…';
    g.fillText(t, x, y);
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }

  function fileName() {
    var base = String(state.label || 'pareja').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
    return 'horarios-' + base.toLowerCase() + '.png';
  }

  function share() {
    if (!state.data) return;
    var c = combine(state.data);
    if (!Object.keys(c.shared).length) { if (app()) app().toast('Aún no hay ningún hueco en común.', true); return; }
    var cv = drawImage(c);
    cv.toBlob(function (blob) {
      if (!blob) { if (app()) app().toast('No se pudo crear la imagen.', true); return; }
      var file = typeof File === 'function' ? new File([blob], fileName(), { type: 'image/png' }) : null;
      var nav = global.navigator;
      if (file && nav.canShare && nav.share && nav.canShare({ files: [file] })) {
        nav.share({ files: [file], title: 'Horarios · ' + state.label }).catch(function (err) {
          if (err && err.name === 'AbortError') return;
          download(blob);
        });
      } else download(blob);
    }, 'image/png');
  }

  /* Sin «compartir» del sistema (ordenador): se descarga la imagen. */
  function download(blob) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    if (app()) app().toast('Imagen descargada: mándala por WhatsApp.');
  }

  global.PadelHorarios = {
    BLOCKS: BLOCKS, state: state, sectionHtml: sectionHtml, bind: bind, load: load,
    monthOf: monthOf, windowMonths: windowMonths, windowDays: windowDays, isWeekend: isWeekend,
    runs: runs, rangeText: rangeText, nextPeriod: nextPeriod, palette: palette, combine: combine, bits: bits, drawImage: drawImage, share: share
  };
})(window);
