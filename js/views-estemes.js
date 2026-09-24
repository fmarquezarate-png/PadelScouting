/* ============================================================
   views-estemes.js · Este mes
   Tu grupo en curso: rivales, fecha y hora de cada partido,
   comparativa directa y probabilidad de subir o bajar.
   Al abrir la app pregunta lo que falta: los rivales cuando
   empieza una ronda y el resultado cuando ya pasó un partido.
   Todo vive en tu cuenta (tablas rounds y fixtures).
   ============================================================ */
(function (global) {
  'use strict';

  var L = global.Liga;
  function PL() { return global.PadelLiga; }
  function DB() { return global.PadelDB; }
  function PT() { return global.PadelTemporada; }

  var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var RESULT_DELAY_MS = 2 * 3600 * 1000;   /* se pregunta 2 h después de la hora */

  var state = { round: null, slug: null, loading: false, known: false, skipNew: {}, skipResult: {}, prompting: false };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function norm(x) {
    return String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function user() { return global.PadelAuth && global.PadelAuth.user(); }
  function model() { return PL() && PL().state.model; }
  function kindOf(m) { return (m && m.season && m.season.kind) || 'masculina'; }
  function pct(x) { return Math.round(100 * x) + '%'; }
  function now() { return global.__PADEL_NOW__ ? new Date(global.__PADEL_NOW__) : new Date(); }
  function thisMonthKey() { var d = now(); return d.getFullYear() * 12 + d.getMonth(); }
  function monthKeyOf(iso) { var p = String(iso || '').split('-'); return p.length < 2 ? -1 : (+p[0]) * 12 + (+p[1] - 1); }
  function firstOfMonth() {
    var d = now();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
  }

  /* ---------- carga (con copia en el móvil por si no hay red) ---------- */
  function cacheKey() { return 'padel-scouting.round.v1:' + DB().currentSeason(); }
  function cacheWrite(r) { try { global.localStorage.setItem(cacheKey(), JSON.stringify(r)); } catch (e) {} }
  function cacheRead() { try { return JSON.parse(global.localStorage.getItem(cacheKey())); } catch (e) { return null; } }

  function load(done) {
    var slug = DB().currentSeason();
    if (!user()) { state.round = null; state.slug = slug; if (done) done(); return; }
    state.loading = true;
    DB().callAuthed('get_my_round', { season_slug: slug }).then(function (r) {
      state.round = r || null; state.slug = slug; state.loading = false; state.known = true;
      cacheWrite(state.round);
    }).catch(function () {
      /* Sin respuesta de la base no se sabe si ya hay ronda: se usa la copia
         del móvil y, si no la hay, no se pregunta (evita rondas duplicadas). */
      state.round = cacheRead(); state.slug = slug; state.loading = false; state.known = !!state.round;
    }).then(function () {
      if (PL().rebuild) PL().rebuild();
      if (done) done();
    });
  }

  /* Arranque: con la liga cargada, trae la ronda y pregunta lo pendiente. */
  function boot() {
    PL().ensureLoaded(function () {
      load(function () {
        var app = global.PadelApp;
        if (app && ['inicio', 'estemes'].indexOf(app.state.view) >= 0) app.go(app.state.view);
        checkPrompts();
      });
    });
  }

  /* ---------- qué ronda toca ---------- */

  /* Si el último mes de la liga es el mes en curso, el grupo sale de la liga
     (exacto). Si no, se prevé con las reglas de subida y bajada. */
  function proposal(m) {
    var me = m && m.ownTeamId;
    if (!me) return null;
    var last = m.lastMonth;
    var ml = m.months.filter(function (x) { return x.n === last; })[0];
    var lad = m.ladder[last] || {};
    var monthName = MESES[now().getMonth()];
    if (ml && lad[me] && norm(ml.label).indexOf(norm(monthName)) >= 0) {
      var g = lad[me].group;
      return { source: 'liga', label: ml.label, leagueMonth: last, group: g,
        rivals: Object.keys(lad).map(Number).filter(function (id) { return id !== me && lad[id].group === g; }) };
    }
    var s = L.suggestRivals(m, me, kindOf(m));
    return { source: 'prevision', label: monthName, leagueMonth: null, group: s.group, rivals: s.rivals };
  }

  function needsNewRound() {
    var m = model();
    if (!user() || !m || !m.ownTeamId || !state.known) return false;
    /* Solo se pregunta en la temporada más reciente de la competición. */
    var latest = latestSlugOfKind(kindOf(m));
    if (latest && latest !== DB().currentSeason()) return false;
    if (!state.round) return true;
    return monthKeyOf(state.round.monthStart) < thisMonthKey();
  }

  function pendingResults() {
    var r = state.round;
    if (!r) return [];
    var t = now().getTime();
    return (r.fixtures || []).filter(function (f) {
      return f.status === 'pendiente' && f.scheduledAt && Date.parse(f.scheduledAt) + RESULT_DELAY_MS < t &&
        !state.skipResult[f.id];
    });
  }

  function nextFixture() {
    var r = state.round;
    if (!r) return null;
    var t = now().getTime();
    return (r.fixtures || []).filter(function (f) {
      return f.status === 'pendiente' && f.scheduledAt && Date.parse(f.scheduledAt) + RESULT_DELAY_MS >= t;
    }).sort(function (a, b) { return Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt); })[0] || null;
  }

  function shortWhen(iso) {
    var d = new Date(iso);
    return DIAS[d.getDay()] + ' ' + d.getDate() + ' · ' + String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }
  function shortRival(label) {
    return String(label || '').split('/').map(function (x) { return x.trim().split(' ')[0]; }).join('/');
  }

  /* Lo que se lee en la red de la pista. */
  function netLabel() {
    if (!user()) return 'Tu grupo del mes';
    if (needsNewRound()) return 'Elige tus rivales';
    var nf = nextFixture();
    if (nf) return shortWhen(nf.scheduledAt) + ' · ' + shortRival(nf.rivalLabel);
    var r = state.round;
    var sinFecha = r && (r.fixtures || []).filter(function (f) { return f.status === 'pendiente' && !f.scheduledAt; }).length;
    if (sinFecha) return 'Pon fecha a tus partidos';
    return r ? 'Ronda de ' + r.label : 'Tu grupo del mes';
  }

  /* ---------- resultados provisionales para el motor ---------- */
  /* El mes de la ronda dentro de lo que se está mirando: el mismo en su
     temporada, renumerado en «todo el recorrido», nada en otra temporada. */
  function monthIn(snapshot, r) {
    var ss = snapshot.season || {};
    if (!r.season || !ss.slug || ss.slug === r.season) return r.leagueMonth;
    var part = (ss.parts || []).filter(function (p) { return p.slug === r.season; })[0];
    return part ? (part.map[r.leagueMonth] || null) : null;
  }

  function provisionalMatches(snapshot) {
    var r = state.round;
    if (!r || r.leagueMonth == null || !r.myTeamId || !r.group) return [];
    var month = monthIn(snapshot, r);
    if (month == null || !(snapshot.months || []).some(function (x) { return x[0] === month; })) return [];
    var official = {};
    (snapshot.matches || []).forEach(function (x) {
      if (x[0] === month) official[Math.min(x[2], x[3]) + '-' + Math.max(x[2], x[3])] = true;
    });
    var me = r.myTeamId, out = [];
    (r.fixtures || []).forEach(function (f) {
      if (!f.rivalTeamId || official[Math.min(me, f.rivalTeamId) + '-' + Math.max(me, f.rivalTeamId)]) return;
      if (f.status === 'jugado' && f.sets && f.sets.length) out.push([month, r.group, me, f.rivalTeamId, f.sets, null, 1]);
      else if (f.status === 'wo_favor') out.push([month, r.group, me, f.rivalTeamId, null, 'home', 1]);
      else if (f.status === 'wo_contra') out.push([month, r.group, me, f.rivalTeamId, null, 'away', 1]);
    });
    return out;
  }

  /* ============================================================
     PANTALLA
     ============================================================ */
  /* La temporada más reciente de una competición (2026-s2 va después de 2026-s1). */
  function latestSlugOfKind(kind) {
    var list = (PL().state.seasons || []).filter(function (x) { return x.kind === kind; })
      .map(function (x) { return x.slug; }).sort();
    return list.length ? list[list.length - 1] : null;
  }

  function render(view, bind) {
    PT().stopTimer();
    /* «Este mes» vive en la temporada del grupo en curso (o en la más reciente
       de la competición): si estás mirando otro semestre, se cambia solo. */
    var m0 = model(), cur = DB().currentSeason();
    var target = (state.round && state.round.season) || (m0 && latestSlugOfKind(kindOf(m0)));
    if (user() && target && target !== cur && global.PadelApp.switchTo) {
      view.innerHTML = PL().loadingHtml('Abriendo la temporada en curso…');
      global.PadelApp.switchTo(target, false);
      return;
    }
    PT().withModel(view, function () {
      if (state.slug !== DB().currentSeason() && user()) {
        view.innerHTML = PL().loadingHtml('Cargando tu grupo…');
        load(function () { paint(view, bind); });
      } else paint(view, bind);
    });
  }

  function paint(view, bind) {
    var m = model(), me = m.ownTeamId, r = state.round;
    var h = ['<div class="lg estemes">'];
    if (!user()) {
      h.push('<section class="blk"><p class="lede">«Este mes» guarda tu grupo, las fechas de tus partidos y tus ' +
        'resultados en tu cuenta.</p><button class="btn primary" data-goto="perfil">Entrar con mi cuenta</button></section></div>');
      view.innerHTML = h.join(''); bind(); return;
    }
    if (!me) {
      h.push('<div class="notice">No apareces en esta competición. Cambia de competición arriba o revisa quién eres en ' +
        '<button class="linkish" data-goto="perfil">Mi perfil</button>.</div></div>');
      view.innerHTML = h.join(''); bind(); return;
    }
    if (!r) {
      var pr = proposal(m);
      h.push('<section class="blk em-empty"><h2>Monta tu grupo de ' + esc(pr ? pr.label : MESES[now().getMonth()]) + '</h2>' +
        '<p class="lede">' + (pr && pr.source === 'liga' ? 'La liga ya tiene tu grupo: solo confírmalo.'
          : 'Te lo propongo con las reglas de subida y bajada; confirmas o cambias una pareja.') + '</p>' +
        '<button class="btn primary" data-em="round">Elegir mis rivales</button></section></div>');
      view.innerHTML = h.join(''); bindPaint(view, bind); return;
    }

    var members = [me].concat((r.fixtures || []).map(function (f) { return f.rivalTeamId; }).filter(Boolean));
    var known = knownResults(m, r, me);
    var out = members.length >= 2 ? L.groupOutlook(m, members, known, kindOf(m)) : null;
    var srcTxt = { liga: 'grupo de la liga', prevision: 'grupo previsto', manual: 'elegido por ti' }[r.source] || '';

    h.push('<section class="blk em-head"><div class="eyebrow">Ronda de ' + esc(r.label) +
      (r.group ? ' · Grupo ' + r.group : '') + ' · ' + esc(srcTxt) + '</div>');
    if (out) {
      /* En grupos donde nadie se mantiene (masculino de 4) no se enseña esa casilla. */
      var canStay = out.moves.indexOf(0) >= 0;
      h.push('<div class="em-out' + (canStay ? '' : ' two') + '">' +
        outCell(out.up, 'Subes', 'up') + (canStay ? outCell(out.stay, 'Te mantienes', 'stay') : '') +
        outCell(out.down, 'Bajas', 'down') +
        '</div><p class="note">Simulando ' + (out.remaining ? 'los ' + out.remaining + ' partidos que quedan del grupo' :
        'el grupo, ya jugado entero') + ' con el motor · puntos de la liga (4 ganar, 2 perder en super tie-break, 1 en dos sets).</p>');
    }
    h.push('</section>');

    if (members.length >= 2) h.push(groupTableHtml(m, me, members, known));

    h.push('<section class="blk"><div class="em-cards">');
    (r.fixtures || []).forEach(function (f) { h.push(card(m, me, f)); });
    h.push('</div></section>');

    var others = otherMatches(m, r, me);
    if (others) h.push('<section class="blk"><h3 class="em-h3">El resto del grupo</h3>' + others + '</section>');

    h.push(cocinaHtml(m, me, r, known));

    h.push('<section class="blk"><div class="btn-row"><button class="btn ghost" data-em="round">Cambiar rivales</button></div>' +
      '<p class="note">Los resultados que apuntas cuentan ya en tus números como <b>provisionales</b>; ' +
      'cuando pegues la clasificación, manda la de la liga.</p></section></div>');
    view.innerHTML = h.join('');
    bindPaint(view, bind);
  }

  /* La tabla del grupo tal y como va: lo oficial y lo que has apuntado tú. */
  function groupTableHtml(m, me, members, known) {
    var rows = L.groupTable(members, known);
    var h = ['<section class="blk"><h3 class="em-h3">Cómo va el grupo</h3>',
      '<table class="table em-table"><thead><tr><th>#</th><th>Pareja</th><th>PJ</th><th>G</th><th>P</th>' +
      '<th>Sets</th><th>Pts</th></tr></thead><tbody>'];
    rows.forEach(function (x, i) {
      var t = m.teams[x.id];
      h.push('<tr' + (x.id === me ? ' class="me"' : '') + '><td>' + (i + 1) + '</td><td>' +
        esc(t ? t.label : '—') + (x.prov ? ' <span class="tag prov">Provisional</span>' : '') + '</td><td>' + x.pj +
        '</td><td>' + x.g + '</td><td>' + x.p + '</td><td>' + x.sf + '–' + x.sc + '</td><td><b>' + x.pts + '</b></td></tr>');
    });
    h.push('</tbody></table><p class="note">Puntos de la liga: 4 ganar, 2 perder en super tie-break, 1 perder en dos sets, ' +
      '0 perder por WO. «Provisional» = incluye resultados que has apuntado tú y la liga aún no ha publicado.</p></section>');
    return h.join('');
  }

  /* «Cómo se cocina el próximo mes»: juega con el motor lo que falta de todos
     los grupos del mes y cuenta con quién coincides después. */
  function cocinaHtml(m, me, r, known) {
    var h = ['<section class="blk em-cocina"><h3 class="em-h3">Cómo se cocina el próximo mes</h3>'];
    var mo = r.leagueMonth;
    if (mo == null || !m.ladder[mo] || !m.ladder[mo][me]) {
      h.push('<p class="note">Para esto necesito la clasificación de este mes pegada en Configuración: con ella juego ' +
        'lo que falta de <b>todos</b> los grupos y te digo con quién es más probable que te toque.</p></section>');
      return h.join('');
    }
    var o = L.nextMonthOutlook(m, mo, kindOf(m), me, known, { simulations: 1200 });
    if (!o) return '';
    h.push('<p class="lede">Provisional: se juega ' + o.simulations + ' veces lo que falta del mes en todos los grupos ' +
      '(lo ya jugado cuenta tal cual) y se aplican las subidas y bajadas.</p>');
    h.push('<div class="em-grp">' + o.groups.slice(0, 4).map(function (g) {
      return '<div class="em-o' + (g.group < m.ladder[mo][me].group ? ' up' : g.group > m.ladder[mo][me].group ? ' down' : ' stay') +
        '"><b>' + pct(g.p) + '</b><span>Grupo ' + g.group + '</span></div>';
    }).join('') + '</div>');
    var list = o.rivals.filter(function (x) { return x.p >= 0.03; }).slice(0, 12);
    h.push('<table class="table em-table"><thead><tr><th>Pareja</th><th>Grupo ahora</th><th>Prob. de tocarte</th></tr></thead><tbody>');
    list.forEach(function (x) {
      var t = m.teams[x.id], cur = m.ladder[mo][x.id];
      h.push('<tr data-team="' + x.id + '"><td>' + esc(t ? t.label : '—') + '</td><td>' + (cur ? cur.group : '—') +
        '</td><td><span class="em-bar"><i style="width:' + Math.round(x.p * 100) + '%"></i></span> <b>' + pct(x.p) + '</b></td></tr>');
    });
    h.push('</tbody></table><p class="note">Cambia cada vez que se apunta un resultado. Solo salen las parejas con 3% o más.</p></section>');
    return h.join('');
  }

  function outCell(p, label, cls) {
    return '<div class="em-o ' + cls + '"><b>' + pct(p) + '</b><span>' + label + '</span></div>';
  }

  /* Resultados que ya se saben del grupo: los tuyos y, si la ronda es la de
     la liga, también los partidos entre tus rivales. */
  function knownResults(m, r, me) {
    var list = [];
    var ids = [me].concat((r.fixtures || []).map(function (f) { return f.rivalTeamId; }).filter(Boolean));
    if (r.leagueMonth != null) {
      m.matches.forEach(function (x) {
        if (x.month !== r.leagueMonth || ids.indexOf(x.home) < 0 || ids.indexOf(x.away) < 0) return;
        list.push({ a: x.home, b: x.away, sa: x.setsHome, sb: x.setsAway, wo: !!x.walkover, prov: !!x.provisional });
      });
    }
    (r.fixtures || []).forEach(function (f) {
      if (!f.rivalTeamId) return;
      var dup = list.some(function (k) { return (k.a === me && k.b === f.rivalTeamId) || (k.b === me && k.a === f.rivalTeamId); });
      if (dup) return;
      if (f.status === 'jugado' && f.sets) {
        var w = f.sets.filter(function (s) { return s[0] > s[1]; }).length, l = f.sets.length - w;
        list.push({ a: me, b: f.rivalTeamId, sa: w, sb: l, prov: true });
      } else if (f.status === 'wo_favor') list.push({ a: me, b: f.rivalTeamId, sa: 2, sb: 0, wo: true, prov: true });
      else if (f.status === 'wo_contra') list.push({ a: me, b: f.rivalTeamId, sa: 0, sb: 2, wo: true, prov: true });
    });
    return list;
  }

  function card(m, me, f) {
    var t = f.rivalTeamId ? m.teams[f.rivalTeamId] : null;
    var h = ['<article class="em-card" data-fx="' + f.id + '">'];
    h.push('<header><h3>' + esc(t ? t.label : f.rivalLabel) + '</h3>' + statusChip(f) + '</header>');
    if (t) {
      var pr = L.project(m, me, t.id, { scale: m.scale, simulations: 2000 });
      var lad = m.ladder[m.lastMonth] && m.ladder[m.lastMonth][t.id];
      var h2h = L.headToHead(m, me, t.id);
      var trend = trendOf(m, t.id);
      h.push('<div class="em-stats">' +
        '<div><b>' + pct(pr.winProbability) + '</b><span>ganáis</span></div>' +
        '<div><b>' + esc(pr.topScores[0] ? pr.topScores[0].score.replace(/-/g, '–') : '—') + '</b><span>marcador más probable</span></div>' +
        '<div><b>' + (lad ? '#' + lad.place : '—') + '</b><span>en la escalera</span></div></div>');
      h.push('<p class="em-line">' + trend + (h2h.played ? ' · Contra vosotros: <b>' + h2h.aWon + '–' + h2h.bWon + '</b>'
        : ' · Nunca habéis jugado') + '</p>');
    } else {
      h.push('<p class="em-line">Pareja nueva en la liga: sin historial todavía.</p>');
    }
    if (f.status === 'pendiente') {
      h.push('<label class="em-date">Fecha y hora<input type="datetime-local" data-fx-date="' + f.id + '" value="' +
        localValue(f.scheduledAt) + '"></label>');
    }
    h.push('<div class="btn-row tight">' +
      (t ? '<button class="btn small" data-rival="' + t.id + '">Comparar →</button>' : '') +
      '<button class="btn small ghost" data-fx-result="' + f.id + '">' + (f.status === 'pendiente' ? 'Resultado' : 'Cambiar resultado') + '</button>' +
      (f.scheduledAt && f.status === 'pendiente' ? '<button class="btn small ghost" data-fx-ics="' + f.id + '">Al calendario</button>' : '') +
      (f.recordId ? '' : (f.status === 'jugado' ? '<button class="btn small ghost" data-fx-full="' + f.id + '">Registro completo</button>' : '')) +
      '</div></article>');
    return h.join('');
  }

  function statusChip(f) {
    if (f.status === 'jugado' && f.sets) {
      var w = f.sets.filter(function (s) { return s[0] > s[1]; }).length >= 2;
      return '<span class="em-chip ' + (w ? 'w' : 'l') + '">' + (w ? 'Ganado' : 'Perdido') + ' · ' +
        f.sets.map(function (s) { return s[0] + '–' + s[1]; }).join(' ') + '</span>';
    }
    if (f.status === 'wo_favor') return '<span class="em-chip w">WO a favor</span>';
    if (f.status === 'wo_contra') return '<span class="em-chip l">WO en contra</span>';
    if (f.scheduledAt) return '<span class="em-chip">' + esc(shortWhen(f.scheduledAt)) + '</span>';
    return '<span class="em-chip muted">Sin fecha</span>';
  }

  /* Cómo viene: grupo hace dos meses → ahora. */
  function trendOf(m, id) {
    var ns = m.months.map(function (x) { return x.n; }).filter(function (n) { return m.ladder[n] && m.ladder[n][id]; });
    if (!ns.length) return 'Sin historial';
    var now_ = m.ladder[ns[ns.length - 1]][id], before = m.ladder[ns[Math.max(0, ns.length - 3)]][id];
    var d = before.group - now_.group;
    return d > 0 ? 'Viene subiendo (G' + before.group + ' → G' + now_.group + ')'
      : d < 0 ? 'Viene bajando (G' + before.group + ' → G' + now_.group + ')' : 'Estable en G' + now_.group;
  }

  function otherMatches(m, r, me) {
    if (r.leagueMonth == null) return '';
    var ids = (r.fixtures || []).map(function (f) { return f.rivalTeamId; }).filter(Boolean);
    var list = m.matches.filter(function (x) {
      return x.month === r.leagueMonth && ids.indexOf(x.home) >= 0 && ids.indexOf(x.away) >= 0;
    });
    if (!list.length) return '<p class="note">Entre tus rivales aún no se ha jugado nada.</p>';
    return '<ul class="em-list">' + list.map(function (x) {
      return '<li>' + esc(m.teams[x.home].label) + ' <b>' + (x.walkover ? 'WO' : x.sets.map(function (s) { return s[0] + '–' + s[1]; }).join(' ')) +
        '</b> ' + esc(m.teams[x.away].label) + '</li>';
    }).join('') + '</ul>';
  }

  function localValue(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
      'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function bindPaint(view, bind) {
    view.querySelectorAll('[data-em="round"]').forEach(function (b) {
      b.addEventListener('click', function () { openRoundModal(); });
    });
    view.querySelectorAll('[data-fx-date]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var id = +inp.getAttribute('data-fx-date');
        var iso = inp.value ? new Date(inp.value).toISOString() : '';
        saveFixture(id, { scheduledAt: iso }, 'Fecha guardada.');
      });
    });
    view.querySelectorAll('[data-fx-result]').forEach(function (b) {
      b.addEventListener('click', function () { openResultModal(fixtureById(+b.getAttribute('data-fx-result')), false); });
    });
    view.querySelectorAll('[data-fx-ics]').forEach(function (b) {
      b.addEventListener('click', function () { downloadIcs(fixtureById(+b.getAttribute('data-fx-ics'))); });
    });
    view.querySelectorAll('[data-fx-full]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = fixtureById(+b.getAttribute('data-fx-full'));
        global.PadelApp.prefillRegistro(f, f.sets);
      });
    });
    bind();
  }

  function fixtureById(id) {
    return ((state.round && state.round.fixtures) || []).filter(function (f) { return f.id === id; })[0];
  }

  /* Guarda un cambio de un partido y vuelve a pintar todo lo que depende de él. */
  function saveFixture(id, patch, msg) {
    return DB().callAuthed('update_fixture', { p_id: id, patch: patch }).then(function (row) {
      var f = fixtureById(id);
      if (f && row) {
        f.scheduledAt = row.scheduled_at; f.status = row.status; f.sets = row.sets; f.recordId = row.record_id;
      }
      cacheWrite(state.round);
      PL().rebuild();
      if (msg) global.PadelApp.toast(msg);
      var app = global.PadelApp;
      if (['inicio', 'estemes', 'temporada'].indexOf(app.state.view) >= 0) app.go(app.state.view);
      return row;
    }).catch(function (err) { global.PadelApp.toast(err.message, true); throw err; });
  }

  function linkRecord(fixtureId, match) {
    var patch = { recordId: match.id };
    var f = fixtureById(fixtureId);
    if (f && f.status === 'pendiente' && match.sets && match.sets.length) {
      patch.status = 'jugado';
      patch.sets = match.sets.map(function (s) { return [s.own, s.opponent]; });
    }
    saveFixture(fixtureId, patch).catch(function () {});
  }

  /* ---------- archivo de calendario (.ics) con aviso 2 h antes ---------- */
  function downloadIcs(f) {
    if (!f || !f.scheduledAt) return;
    var st = new Date(f.scheduledAt), en = new Date(st.getTime() + 90 * 60000);
    var z = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Padel Scouting//ES', 'BEGIN:VEVENT',
      'UID:padel-' + f.id + '@padel-scouting', 'DTSTAMP:' + z(new Date()), 'DTSTART:' + z(st), 'DTEND:' + z(en),
      'SUMMARY:Pádel · vs ' + String(f.rivalLabel).replace(/[,;]/g, ' '),
      'DESCRIPTION:Liga Club Tennis El Molí. Antes de jugar: Padel Scouting → Este mes.',
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Partido de pádel en 2 horas', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    var a = document.createElement('a');
    a.href = url; a.download = 'padel-' + shortRival(f.rivalLabel).replace(/[^\w]+/g, '-') + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ============================================================
     AVISOS AL ABRIR
     ============================================================ */
  function checkPrompts() {
    if (state.prompting || document.querySelector('.modal')) return;
    var pend = pendingResults();
    if (pend.length) { openResultModal(pend[0], true); return; }
    if (needsNewRound() && !state.skipNew[DB().currentSeason()]) openRoundModal(true);
  }

  function modal(html) {
    var root = document.getElementById('modal-root');
    root.innerHTML = '<div class="modal">' + html + '</div>';
    document.body.classList.add('has-modal');
    state.prompting = true;
    return root;
  }
  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
    document.body.classList.remove('has-modal');
    state.prompting = false;
  }

  /* ---------- rivales de la ronda ---------- */
  var rm = null;

  function openRoundModal(auto) {
    var m = model();
    if (!m || !m.ownTeamId) return;
    var pr = proposal(m);
    var keep = !!(auto && state.round);
    rm = { auto: !!auto, keep: keep, label: pr.label, source: pr.source, leagueMonth: pr.leagueMonth,
      group: pr.group, rivals: pr.rivals.slice(), query: '', busy: false, error: null, edited: false };
    paintRoundModal();
  }

  function paintRoundModal() {
    var m = model(), me = m.ownTeamId, want = kindOf(m) === 'mixta' ? 2 : 3;
    var h = ['<div class="modal-card em-modal" role="dialog" aria-modal="true" aria-labelledby="rm-t">'];
    h.push('<div class="eyebrow">' + esc(m.season ? m.season.name : '') + '</div>');
    h.push('<h2 id="rm-t">Tus rivales de ' + esc(rm.label) + '</h2>');
    h.push('<p class="field-note">' + (rm.source === 'liga' ? 'Sacado de la clasificación de la liga: es tu grupo real.'
      : 'Previsto con las reglas de subida y bajada (acierta ~9 de cada 10). Cambia la pareja que no sea.') + '</p>');
    h.push('<ul class="rm-list">' + rm.rivals.map(function (id, i) {
      var t = m.teams[id];
      return '<li><span>' + esc(t ? t.label : '?') + '</span><button class="linkish" data-rm-del="' + i + '">quitar</button></li>';
    }).join('') + '</ul>');
    if (rm.rivals.length < 4) {
      h.push('<label class="field-label" for="rm-q">' + (rm.rivals.length < want ? 'Añade una pareja' : 'Añadir otra pareja') +
        '</label><input type="search" id="rm-q" autocomplete="off" placeholder="Busca por nombre" value="' + esc(rm.query) + '">');
      var q = norm(rm.query);
      if (q.length >= 2) {
        var hits = m.order.filter(function (id) {
          return id !== me && rm.rivals.indexOf(id) < 0 && norm(m.teams[id].label).indexOf(q) >= 0;
        }).slice(0, 8);
        h.push('<div class="me-hits">' + (hits.map(function (id) {
          return '<button type="button" class="chip" data-rm-add="' + id + '">' + esc(m.teams[id].label) + '</button>';
        }).join('') || '<p class="field-note">No sale ninguna pareja así.</p>') + '</div>');
      }
    }
    if (rm.error) h.push('<div class="notice bad">' + esc(rm.error) + '</div>');
    h.push('<div class="btn-row"><button class="btn primary" data-rm="ok"' + (rm.rivals.length && !rm.busy ? '' : ' disabled') + '>' +
      (rm.busy ? 'Guardando…' : 'Confirmar grupo') + '</button>' +
      (rm.keep ? '<button class="btn ghost" data-rm="keep">Sigue la misma ronda</button>' : '') +
      '<button class="btn ghost" data-rm="later">' + (rm.auto ? 'Luego' : 'Cancelar') + '</button></div></div>');
    var root = modal(h.join(''));
    var inp = root.querySelector('#rm-q');
    if (inp) {
      if (rm.query) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      inp.addEventListener('input', function () { rm.query = inp.value; paintRoundModal(); });
    }
    root.querySelectorAll('[data-rm-del]').forEach(function (b) {
      b.addEventListener('click', function () { rm.rivals.splice(+b.getAttribute('data-rm-del'), 1); rm.edited = true; paintRoundModal(); });
    });
    root.querySelectorAll('[data-rm-add]').forEach(function (b) {
      b.addEventListener('click', function () { rm.rivals.push(+b.getAttribute('data-rm-add')); rm.query = ''; rm.edited = true; paintRoundModal(); });
    });
    root.querySelectorAll('[data-rm]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-rm');
        if (a === 'later') { if (rm.auto) state.skipNew[DB().currentSeason()] = true; closeModal(); return; }
        if (a === 'keep') {
          DB().callAuthed('keep_round', { p_id: state.round.id }).then(function () {
            state.round.monthStart = firstOfMonth(); cacheWrite(state.round); closeModal();
            global.PadelApp.toast('Sigues en la ronda de ' + state.round.label + '.');
          }).catch(function (err) { rm.error = err.message; paintRoundModal(); });
          return;
        }
        saveRound();
      });
    });
  }

  function saveRound() {
    var m = model();
    rm.busy = true; rm.error = null; paintRoundModal();
    var payload = {
      season: DB().currentSeason(), label: rm.label, monthStart: firstOfMonth(),
      leagueMonth: rm.leagueMonth, group: rm.group, myTeamId: m.ownTeamId,
      source: rm.edited ? 'manual' : rm.source,
      rivals: rm.rivals.map(function (id) { return { teamId: id, label: m.teams[id].label }; })
    };
    DB().callAuthed('start_round', { payload: payload }).then(function (r) {
      state.round = r; state.slug = DB().currentSeason(); cacheWrite(r);
      closeModal(); PL().rebuild();
      global.PadelApp.toast('Grupo de ' + r.label + ' listo.');
      global.PadelApp.go('estemes');
    }).catch(function (err) { rm.busy = false; rm.error = err.message; paintRoundModal(); });
  }

  /* ---------- resultado: básico o personalizado ---------- */
  var res = null;

  function openResultModal(f, auto) {
    if (!f) return;
    var s = f.sets || [];
    res = { f: f, auto: auto, sets: [0, 1, 2].map(function (i) { return s[i] ? s[i].slice() : ['', '']; }),
      error: null, busy: false, reschedule: false, when: localValue(f.scheduledAt) };
    paintResultModal();
  }

  function setsFromRes() {
    var out = [];
    for (var i = 0; i < 3; i++) {
      var a = res.sets[i][0], b = res.sets[i][1];
      if (a === '' && b === '') continue;
      out.push([+a, +b]);
    }
    return out;
  }

  function checkSets(sets) {
    if (sets.length < 2) return 'Pon al menos los dos sets.';
    for (var i = 0; i < 2; i++) {
      var s = sets[i];
      if (!(s[0] >= 0 && s[0] <= 7 && s[1] >= 0 && s[1] <= 7) || s[0] === s[1]) return 'El set ' + (i + 1) + ' no cuadra (de 0 a 7 y sin empate).';
    }
    var split = (sets[0][0] > sets[0][1]) !== (sets[1][0] > sets[1][1]);
    if (split && sets.length < 3) return 'Un set cada uno: falta el super tie-break.';
    if (!split && sets.length > 2) return 'Con 2–0 no hay super tie-break.';
    if (sets.length === 3 && (sets[2][0] === sets[2][1] || Math.max(sets[2][0], sets[2][1]) < 10)) return 'El super tie-break llega a 10.';
    return null;
  }

  function paintResultModal() {
    var f = res.f;
    var s01 = res.sets;
    var split = s01[0][0] !== '' && s01[1][0] !== '' && s01[0][1] !== '' && s01[1][1] !== '' &&
      ((+s01[0][0] > +s01[0][1]) !== (+s01[1][0] > +s01[1][1]));
    var h = ['<div class="modal-card em-modal" role="dialog" aria-modal="true" aria-labelledby="rs-t">'];
    h.push('<div class="eyebrow">' + (f.scheduledAt ? esc(shortWhen(f.scheduledAt)) : 'Ronda de ' + esc(state.round.label)) + '</div>');
    h.push('<h2 id="rs-t">¿Cómo fue contra ' + esc(f.rivalLabel) + '?</h2>');
    if (res.reschedule) {
      h.push('<label class="em-date">Nueva fecha y hora<input type="datetime-local" id="rs-when" value="' + esc(res.when) + '"></label>' +
        '<div class="btn-row"><button class="btn primary" data-rs="resave">Guardar fecha</button>' +
        '<button class="btn ghost" data-rs="back">Volver</button></div></div>');
    } else {
      h.push('<div class="rs-grid"><span></span><span>Nosotros</span><span>Ellos</span>');
      ['Set 1', 'Set 2', 'Super tie-break'].forEach(function (lab, i) {
        if (i === 2 && !split && s01[2][0] === '' && s01[2][1] === '') return;
        h.push('<span>' + lab + '</span>' +
          '<input type="number" inputmode="numeric" min="0" max="' + (i === 2 ? 30 : 7) + '" data-rs-set="' + i + '-0" value="' + esc(s01[i][0]) + '">' +
          '<input type="number" inputmode="numeric" min="0" max="' + (i === 2 ? 30 : 7) + '" data-rs-set="' + i + '-1" value="' + esc(s01[i][1]) + '">');
      });
      h.push('</div>');
      if (res.error) h.push('<div class="notice bad">' + esc(res.error) + '</div>');
      h.push('<div class="btn-row"><button class="btn primary" data-rs="basic">Guardar resultado</button>' +
        '<button class="btn" data-rs="full">Guardar y registro completo</button></div>' +
        '<div class="btn-row tight rs-more"><button class="btn small ghost" data-rs="wo_favor">WO a favor</button>' +
        '<button class="btn small ghost" data-rs="wo_contra">WO en contra</button>' +
        '<button class="btn small ghost" data-rs="notyet">Aún no se jugó</button>' +
        '<button class="btn small ghost" data-rs="later">' + (res.auto ? 'Luego' : 'Cancelar') + '</button></div></div>');
    }
    var root = modal(h.join(''));
    root.querySelectorAll('[data-rs-set]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var k = inp.getAttribute('data-rs-set').split('-');
        var before = split;
        res.sets[+k[0]][+k[1]] = inp.value === '' ? '' : Math.max(0, Math.round(+inp.value));
        var s = res.sets, now_ = s[0][0] !== '' && s[1][0] !== '' && s[0][1] !== '' && s[1][1] !== '' &&
          ((+s[0][0] > +s[0][1]) !== (+s[1][0] > +s[1][1]));
        if (now_ !== before) {       /* aparece o desaparece el super tie-break: repintar y seguir escribiendo */
          var id = inp.getAttribute('data-rs-set');
          paintResultModal();
          var again = document.querySelector('[data-rs-set="' + id + '"]');
          if (again) again.focus();
        }
      });
    });
    root.querySelectorAll('[data-rs]').forEach(function (b) {
      b.addEventListener('click', function () { resultAction(b.getAttribute('data-rs')); });
    });
  }

  function resultAction(a) {
    var f = res.f;
    if (a === 'later') { if (res.auto) state.skipResult[f.id] = true; closeModal(); if (res.auto) checkPrompts(); return; }
    if (a === 'notyet') { res.reschedule = true; paintResultModal(); return; }
    if (a === 'back') { res.reschedule = false; paintResultModal(); return; }
    if (a === 'resave') {
      var v = document.getElementById('rs-when').value;
      closeModal();
      saveFixture(f.id, { scheduledAt: v ? new Date(v).toISOString() : '' },
        v ? 'Nueva fecha guardada.' : 'Sin fecha: te pregunto cuando la pongas.').then(checkPrompts, function () {});
      return;
    }
    if (a === 'wo_favor' || a === 'wo_contra') {
      closeModal();
      saveFixture(f.id, { status: a, sets: null }, a === 'wo_favor' ? 'WO a favor apuntado.' : 'WO en contra apuntado.')
        .then(checkPrompts, function () {});
      return;
    }
    var sets = setsFromRes();
    var err = checkSets(sets);
    if (err) { res.error = err; paintResultModal(); return; }
    closeModal();
    saveFixture(f.id, { status: 'jugado', sets: sets }, 'Resultado guardado (provisional hasta que lo publique la liga).')
      .then(function () {
        if (a === 'full') global.PadelApp.prefillRegistro(fixtureById(f.id), sets);
        else checkPrompts();
      }, function () {});
  }

  global.PadelEsteMes = {
    state: state, load: load, boot: boot, render: render, netLabel: netLabel,
    provisionalMatches: provisionalMatches, linkRecord: linkRecord, checkPrompts: checkPrompts,
    openRoundModal: openRoundModal, openResultModal: openResultModal, proposal: proposal,
    needsNewRound: needsNewRound, pendingResults: pendingResults, downloadIcs: downloadIcs
  };
})(window);
