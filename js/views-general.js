/* ============================================================
   views-general.js · inicio, la liga entera y la crónica
   ============================================================ */
(function (global) {
  'use strict';

  var L = global.Liga;
  var PL = global.PadelLiga;
  var PT = global.PadelTemporada;
  var esc = PL.esc;
  var ui = PT.ui;

  /* ============================================================
     LA LIGA · clasificación general + explorador + carga
     ============================================================ */
  function leagueTable(m) {
    var last = m.ladder[m.lastMonth] || {};
    var firstMonth = m.months.length ? m.months[0].n : null;
    var first = m.ladder[firstMonth] || {};
    var rivals = {};
    PT.mine(m).forEach(function (r) { rivals[r.rivalId] = true; });
    return m.order.map(function (id) {
      var s = L.teamStats(m, id);
      var lt = last[id], ft = first[id];
      return {
        id: id, name: s.label, pos: lt ? lt.place : null, total: lt ? lt.total : null,
        group: lt ? lt.group : null, group0: ft ? ft.group : (s.first ? s.first.group : null),
        move: (lt && (ft || s.first)) ? ((ft ? ft.group : s.first.group) - lt.group) : null,
        w: s.won, l: s.lost, pct: s.gamePct || 0, elo: s.rating,
        mine: id === m.myTeamId, rival: !!rivals[id]
      };
    });
  }

  function renderGeneral(view, bind) {
    PT.stopTimer();
    PT.withModel(view, function () { paintGeneral(view, bind); });
  }

  function paintGeneral(view, bind) {
    var m = PL.state.model;
    var rows = leagueTable(m);
    var h = ['<div class="lg">'];
    h.push(PL.sourceNote());

    h.push('<section class="blk">' + PT.sectionHead('07', 'Clasificación general',
      'Las <b>' + rows.length + '</b> parejas ordenadas por su posición actual. Toca una cabecera para ' +
      'reordenar. Vuestra fila va marcada y los rivales con los que habéis jugado llevan un punto.'));
    h.push('<details class="method"><summary>Qué significa cada columna</summary><div class="body">' +
      '<p><b>Puesto</b> — la escalera real del último mes jugado: equipos en los grupos de arriba + posición.</p>' +
      '<p><b>Grupo</b> — el del último mes. La flecha, cuántos escalones subieron o bajaron desde que entraron.</p>' +
      '<p><b>Nivel</b> — rating por partido anclado al grupo de entrada. Distingue quién gana su grupo raspando ' +
      'de quién lo arrasa.</p><p>Las parejas que no jugaron el último mes no tienen puesto y van al final, ' +
      'ordenadas por nivel.</p></div></details>');
    h.push('<div class="ctrl"><input type="search" id="tblSearch" placeholder="Buscar pareja o jugador…" ' +
      'autocomplete="off" value="' + esc(ui.tblQuery) + '">' +
      '<button id="btnOnlyMine" class="' + (ui.tblOnlyRivals ? 'on' : '') + '">Solo nuestros rivales</button></div>');
    h.push('<div class="tbl-wrap"><table><thead><tr>' +
      '<th class="srt" data-k="pos">Puesto</th><th>Pareja</th>' +
      '<th class="srt" data-k="group">Grupo</th><th class="srt hide-sm" data-k="rec">Balance</th>' +
      '<th class="srt hide-sm" data-k="pct">% juegos</th><th class="srt" data-k="elo">Nivel</th>' +
      '</tr></thead><tbody id="tblRows"></tbody></table></div><p class="note" id="tblNote"></p></section>');

    /* Sin sesión: solo la clasificación general. */
    var logged = !!(global.PadelAuth && global.PadelAuth.user());
    if (!logged) {
      h.push('<section class="blk"><p class="note">Entra con tu cuenta para el explorador de cada pareja. ' +
        '<button class="linkish" data-goto="perfil">Iniciar sesión →</button></p></section></div>');
      view.innerHTML = h.join('');
      drawTable(m, rows);
      bindGeneral(view, m, rows, bind);
      return;
    }

    h.push('<section class="blk">' + PT.sectionHead('08', 'Explorador de la liga',
      'Busca a cualquiera y mira su temporada entera: por qué grupos pasó, qué puesto ocupó y todos sus resultados.'));
    h.push('<div class="exp"><div class="exp-list"><input type="search" id="expSearch" ' +
      'placeholder="Buscar pareja o jugador…" autocomplete="off" value="' + esc(ui.expQuery) + '">' +
      '<div class="exp-items" id="expItems"></div></div><div class="exp-detail" id="expDetail"></div></div></section>');

    if (global.PadelDB.isAdmin()) h.push('<section class="blk"><p class="note">¿Hay mes nuevo en la web de la liga? ' +
      '<button class="linkish" data-goto="config">Cárgalo desde Configuración →</button></p></section>');
    h.push('</div>');
    view.innerHTML = h.join('');

    drawTable(m, rows);
    drawExpList(m);
    showTeam(m, ui.expSel || m.myTeamId);
    bindGeneral(view, m, rows, bind);
  }

  function drawTable(m, rows) {
    var q = ui.tblQuery.trim().toLowerCase();
    var arr = rows.filter(function (r) {
      return (!q || r.name.toLowerCase().indexOf(q) >= 0) && (!ui.tblOnlyRivals || r.rival || r.mine);
    });
    var k = ui.tblSort.k, sign = ui.tblSort.asc ? 1 : -1;
    arr.sort(function (a, b) {
      if (k === 'pos') {
        if (a.pos === null && b.pos === null) return b.elo - a.elo;
        if (a.pos === null) return 1;
        if (b.pos === null) return -1;
        return (a.pos - b.pos) * sign;
      }
      if (k === 'group') {
        var av = a.group === null ? 999 : a.group, bv = b.group === null ? 999 : b.group;
        return (av - bv) * sign || b.elo - a.elo;
      }
      if (k === 'rec') return ((b.w - b.l) - (a.w - a.l)) * sign;
      if (k === 'pct') return (b.pct - a.pct) * sign;
      return (b.elo - a.elo) * sign;
    });
    document.querySelectorAll('th.srt').forEach(function (th) {
      th.classList.toggle('on', th.getAttribute('data-k') === k);
      th.classList.toggle('asc', th.getAttribute('data-k') === k && ui.tblSort.asc);
    });
    var body = document.getElementById('tblRows');
    body.innerHTML = arr.map(function (r) {
      var mv = r.move === null ? '<span class="mv eq">—</span>'
        : r.move > 0 ? '<span class="mv up">▲' + r.move + '</span>'
        : r.move < 0 ? '<span class="mv dn">▼' + (-r.move) + '</span>'
        : '<span class="mv eq">=</span>';
      return '<tr class="' + (r.mine ? 'mine' : (r.rival ? 'rival' : '')) + '" data-team="' + r.id + '">' +
        '<td><span class="pill' + (r.pos && r.total && r.pos <= Math.round(r.total * 0.15) ? ' top' : '') + '">' +
        (r.pos == null ? '—' : r.pos) + '</span></td>' +
        '<td class="nm"><button class="linkish" data-exp="' + r.id + '">' + esc(r.name) + '</button></td>' +
        '<td class="sc">' + (r.group ? 'G' + r.group : '—') + ' ' + mv +
        (r.group0 ? ' <span class="desde">desde G' + r.group0 + '</span>' : '') + '</td>' +
        '<td class="sc hide-sm"><b>' + r.w + '–' + r.l + '</b></td>' +
        '<td class="sc hide-sm">' + r.pct.toFixed(0) + '%</td>' +
        '<td class="sc"><b>' + Math.round(r.elo) + '</b></td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty-row">Ninguna pareja coincide.</td></tr>';
    document.getElementById('tblNote').textContent = 'Mostrando ' + arr.length + ' de ' + rows.length +
      ' parejas · puestos del último mes jugado.';
  }

  function drawExpList(m) {
    var q = ui.expQuery.trim().toLowerCase();
    var last = m.ladder[m.lastMonth] || {};
    var total = null;
    Object.keys(last).some(function (k) { total = last[k].total; return true; });
    var ids = m.order.slice().sort(function (a, b) {
      return m.teams[a].label.localeCompare(m.teams[b].label, 'es');
    }).filter(function (id) { return !q || m.teams[id].label.toLowerCase().indexOf(q) >= 0; });
    document.getElementById('expItems').innerHTML = ids.map(function (id) {
      var l = last[id];
      return '<button data-t="' + id + '" class="' + (id === ui.expSel ? 'on' : '') + '">' +
        esc(m.teams[id].label) + '<span>' + (l ? 'Puesto ' + l.place + ' de ' + total + ' · grupo ' + l.group
          : 'sin datos en el último mes') + '</span></button>';
    }).join('') || '<div class="exp-empty">Ninguna pareja coincide.</div>';
  }

  function showTeam(m, id) {
    ui.expSel = id;
    Array.prototype.forEach.call(document.querySelectorAll('#expItems button'), function (b) {
      b.classList.toggle('on', Number(b.getAttribute('data-t')) === id);
    });
    var s = L.teamStats(m, id);
    var box = document.getElementById('expDetail');
    if (!s || !box) return;
    var label = {};
    m.months.forEach(function (x) { label[x.n] = x.label; });
    var ms = m.matches.filter(function (x) { return x.home === id || x.away === id; });
    var byMes = {};
    ms.forEach(function (x) {
      var home = x.home === id;
      (byMes[x.month] = byMes[x.month] || []).push({
        riv: m.teams[home ? x.away : x.home].label,
        sets: x.sets ? (home ? x.sets : x.sets.map(function (v) { return [v[1], v[0]]; })) : null,
        wo: x.walkover, win: home === x.homeWon
      });
    });
    var tl = Object.keys(byMes).map(Number).sort(function (a, b) { return a - b; }).map(function (mes) {
      var l = m.ladder[mes] && m.ladder[mes][id];
      var a = byMes[mes], ww = a.filter(function (x) { return x.win; }).length;
      return '<div><div class="mo">' + esc(label[mes] || 'Mes ' + mes) + '</div>' +
        '<div class="g">G' + (l ? l.group : '—') + '</div><div class="p">' + ww + '–' + (a.length - ww) +
        (l ? ' · #' + l.place : '') + '</div></div>';
    }).join('');
    var body = Object.keys(byMes).map(Number).sort(function (a, b) { return a - b; }).map(function (mes) {
      return '<div class="exp-mes"><b>' + esc(label[mes] || 'Mes ' + mes) + '</b><br>' +
        byMes[mes].map(function (x) {
          return '<span class="' + (x.win ? 'v' : 'd') + '">' + (x.win ? 'V' : 'D') + '</span> ' + esc(x.riv) +
            ' &nbsp;' + (x.wo ? 'WO' : x.sets.map(function (v) { return v[0] + '–' + v[1]; }).join(' '));
        }).join('<br>') + '</div>';
    }).join('');
    var mine = id === m.myTeamId;
    box.innerHTML = '<div class="eh">' + esc(s.label) + '</div>' +
      '<div class="es">' + s.won + '–' + s.lost + ' en la liga' +
      (s.last ? ' · puesto ' + s.last.place + ' de ' + s.last.total : '') + (mine ? ' · sois vosotros' : '') + '</div>' +
      '<div class="exp-tl">' + tl + '</div><div class="exp-ms">' + body + '</div>' +
      (mine ? '' : '<button class="btn primary mini" data-rival="' + id + '">Analizar como rival →</button>');
  }

  function bindGeneral(view, m, rows, bind) {
    document.querySelectorAll('th.srt').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-k');
        ui.tblSort = ui.tblSort.k === k ? { k: k, asc: !ui.tblSort.asc } : { k: k, asc: true };
        drawTable(m, rows);
        bindRowLinks();
      });
    });
    var s = document.getElementById('tblSearch');
    s.addEventListener('input', function () { ui.tblQuery = s.value; drawTable(m, rows); bindRowLinks(); });
    var only = document.getElementById('btnOnlyMine');
    only.addEventListener('click', function () {
      ui.tblOnlyRivals = !ui.tblOnlyRivals;
      only.classList.toggle('on', ui.tblOnlyRivals);
      drawTable(m, rows);
      bindRowLinks();
    });
    var es = document.getElementById('expSearch');
    if (es) {
      es.addEventListener('input', function () { ui.expQuery = es.value; drawExpList(m); });
      document.getElementById('expItems').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-t]');
        if (!b) return;
        showTeam(m, Number(b.getAttribute('data-t')));
        bind();
      });
    }
    function bindRowLinks() {
      document.querySelectorAll('[data-exp]').forEach(function (b) {
        b.onclick = function () {
          /* Sin explorador (sin sesión): tocar una pareja la elige y abre su temporada. */
          if (!document.getElementById('expDetail')) {
            global.PadelLiga.setViewPair(Number(b.getAttribute('data-exp')));
            global.PadelApp.go('temporada');
            return;
          }
          showTeam(m, Number(b.getAttribute('data-exp')));
          var d = document.getElementById('expDetail');
          if (d && d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
          bind();
        };
      });
    }
    bindRowLinks();
    bind();
  }

  /* ============================================================
     CRÓNICA · el primer semestre contado
     Texto escrito a mano para esa temporada: no se recalcula y lo dice.
     ============================================================ */
  function renderCronica(view, bind) {
    PT.stopTimer();
    /* Primero el aviso de carga y después los datos: si ya estaban en
       memoria, la crónica se pinta al instante y no queda tapada. */
    view.innerHTML = PL.loadingHtml('Cargando la crónica…');
    PL.ensureLoaded(function () {
      if (!PL.state.model) { paintCronicaPendiente(view, bind); return; }
      PT.loadClub(function () { paintCronica(view, bind); });
    });
  }

  function paintCronicaPendiente(view, bind) {
    view.innerHTML = '<div class="lg"><div class="notice bad"><b>No he podido cargar la liga.</b> ' +
      'Comprueba la conexión y vuelve a entrar.</div></div>';
    bind();
  }

  /* ---------- la parte personal: los golpes de cada uno ----------
     No sale de los datos: la escribes tú. Se guarda en este dispositivo,
     una por temporada. La del primer semestre masculino trae la que ya
     estaba escrita. */
  var FIRMAS_KEY = 'padel-scouting.firmas.v1:';
  var FIRMAS_S1 = {
    me: { side: 'Revés · Izquierda', shots: [
      ['Pegada', 'El golpe fuerte estaba desde el primer día. Es lo que abre el punto y obliga al rival a jugar incómodo.'],
      ['Bajada de pared', 'Apareció en abril y se convirtió en el sello. Coincide con el mes de las cuatro remontadas.']] },
    partner: { side: 'Drive · Derecha', shots: [
      ['Víbora', 'Letal desde el primer partido. Cierra los puntos que la pegada abre.'],
      ['Saque', 'Seguro desde el arranque. La base de empezar los puntos con la red ganada.']] }
  };
  function firmas(slug) {
    try {
      var raw = global.localStorage.getItem(FIRMAS_KEY + slug);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return slug === '2026-s1' ? FIRMAS_S1 : { me: { side: '', shots: [] }, partner: { side: '', shots: [] } };
  }
  function saveFirmas(slug, f) {
    try { global.localStorage.setItem(FIRMAS_KEY + slug, JSON.stringify(f)); } catch (e) {}
  }
  function shotsToText(list) {
    return (list || []).map(function (x) { return x[0] + ': ' + x[1]; }).join('\n');
  }
  function textToShots(t) {
    return String(t || '').split(/\n+/).map(function (l) {
      var i = l.indexOf(':');
      return i < 0 ? [l.trim(), ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }).filter(function (x) { return x[0]; });
  }

  var cronUi = { editing: false, q: '' };

  /* Filtros propios de la crónica: competición, temporada (o todo) y pareja.
     Son filtros: cambian lo que se lee, no la pantalla. */
  var KIND_NAMES = { masculina: 'Masculino', mixta: 'Mixto', femenina: 'Femenino' };
  function cronicaFilters(m) {
    var A = global.PadelApp, seasons = PL.state.seasons || [];
    var slug = global.PadelDB.currentSeason(), kind = A.kindOfSlug(slug);
    var kinds = [];
    seasons.forEach(function (x) { if (kinds.indexOf(x.kind) < 0) kinds.push(x.kind); });
    var mine = seasons.filter(function (x) { return x.kind === kind; }).map(function (x) { return x.slug; }).sort()
      .concat(['all:' + kind]);
    var t = m.myTeamId && m.teams[m.myTeamId];
    return '<div class="cro-filters">' +
      '<label><span>Competición</span><select id="cro-kind">' + kinds.map(function (k) {
        return '<option value="' + esc(k) + '"' + (k === kind ? ' selected' : '') + '>' + esc(KIND_NAMES[k] || k) + '</option>';
      }).join('') + '</select></label>' +
      '<label><span>Temporada</span><select id="cro-season">' + mine.map(function (x) {
        return '<option value="' + esc(x) + '"' + (x === slug ? ' selected' : '') + '>' + esc(A.seasonName(x)) + '</option>';
      }).join('') + '</select></label>' +
      '<label><span>Pareja</span><button type="button" id="cro-pair" class="cro-pair">' + esc(t ? t.label : 'Escoger') +
      ' ▾</button></label></div>';
  }
  function cronicaPairList(m) {
    var lad = m.ladder[m.lastMonth] || {}, q = String(cronUi.q || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    var ids = m.order.filter(function (id) {
      var t = m.teams[id], txt = (t.label + ' ' + t.playerA + ' ' + t.playerB).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return m.matches.some(function (x) { return x.home === id || x.away === id; }) && (!q || txt.indexOf(q) >= 0);
    }).sort(function (a, b) { return (lad[a] ? lad[a].place : 999) - (lad[b] ? lad[b].place : 999); });
    if (!ids.length) return '<p class="note">No sale ninguna pareja así.</p>';
    return ids.map(function (id) {
      var l = lad[id];
      return '<button class="pp-item" data-cro-id="' + id + '"><b>' + esc(m.teams[id].label) + '</b><small>' +
        (l ? '#' + l.place + ' · Grupo ' + l.group : '') + '</small></button>';
    }).join('');
  }
  function bindCronicaFilters(view, m) {
    var A = global.PadelApp;
    var k = view.querySelector('#cro-kind');
    if (k) k.addEventListener('change', function () { A.switchTo(A.latestSlugOfKind(k.value), true); });
    var se = view.querySelector('#cro-season');
    if (se) se.addEventListener('change', function () { A.switchTo(se.value, true); });
    var pb = view.querySelector('#cro-pair');
    if (pb) pb.addEventListener('click', function () { A.openPairPicker(); });
    function bindList() {
      view.querySelectorAll('[data-cro-id]').forEach(function (b) {
        b.addEventListener('click', function () { A.choosePair(Number(b.getAttribute('data-cro-id'))); });
      });
    }
    var q = view.querySelector('#cro-q');
    if (q) q.addEventListener('input', function () {
      cronUi.q = q.value;
      view.querySelector('#cro-list').innerHTML = cronicaPairList(m);
      bindList();
    });
    bindList();
  }

  function paintCronica(view, bind) {
    var m = PL.state.model;
    var season = m.season || {};
    var rows = PT.mine(m).concat(PT.mineWO(m)).sort(function (a, b) { return a.mes - b.mes; });
    var club = PT.club ? PT.club() : null;
    var me = m.myTeamId ? m.teams[m.myTeamId] : null;
    var names = { me: club ? club.meName : (me ? me.playerA : 'Tú'), partner: club ? club.partnerName : (me ? me.playerB : 'Pareja') };
    var h = ['<div class="lg cronica">', cronicaFilters(m)];
    if (!m.myTeamId) {
      h.push('<section class="blk"><p class="lede">La crónica cuenta la temporada de una pareja. ¿Cuál quieres leer?</p>' +
        '<div class="field"><input type="search" id="cro-q" placeholder="Buscar pareja o jugador" value="' + esc(cronUi.q || '') +
        '" autocomplete="off"></div><div class="pp-list cro-list" id="cro-list">' + cronicaPairList(m) + '</div></section></div>');
      view.innerHTML = h.join('');
      bindCronicaFilters(view, m);
      bind(); return;
    }
    var own = m.myTeamId === m.ownTeamId;
    if (!rows.length) {
      h.push('<div class="stale">Todavía no hay partidos vuestros en <b>' + esc(season.name || 'esta temporada') +
        '</b>. La crónica se escribe sola en cuanto se carguen.</div></div>');
      view.innerHTML = h.join(''); bind(); return;
    }
    var c = global.PadelCronica.build(rows, club);
    var n2 = function (v) { return v.toFixed(2).replace('.', ','); };
    h.push('<div class="stale">Escrita sola con ' + (own ? 'vuestros' : 'sus') + ' <b>' + (c.summary.n + c.summary.wo) + ' partidos</b> de ' +
      esc(global.PadelApp ? global.PadelApp.seasonName(season.slug) : season.name || '') +
      '. Se rehace cada vez que se carga un mes nuevo; los golpes de cada uno los escribes tú.</div>');

    h.push('<section class="blk">' + PT.sectionHead('09', c.acts.length > 1 ? (c.acts.length === 2 ? 'Dos actos' : 'Tres actos') : 'El relato',
      c.acts.length > 1 ? 'La temporada no fue una línea recta: cada tramo tuvo su carácter.' : 'Un solo tramo, de principio a fin.'));
    h.push('<div class="acts">' + c.acts.map(function (a, i) {
      return '<div class="act a' + (i + 1) + '"><div class="ph">' + esc(a.ph) + '</div><h3>' + esc(a.title) + '</h3>' +
        '<div class="dates">' + esc(a.dates) + '</div><p>' + a.text + '</p></div>';
    }).join('') + '</div></section>');

    if (c.duel) {
      h.push('<section class="blk">' + PT.sectionHead('10', c.duel.rival, esc(c.duel.dek)));
      h.push('<div class="duel">' + c.duel.cards.map(function (d) {
        return '<div class="duel-card' + (d.hot ? ' hot' : '') + '"><div class="when">' + esc(d.when) + '</div>' +
          '<div class="big' + (d.hot ? ' o' : '') + '">' + esc(d.score) + '</div><p>' + esc(d.text) + '</p></div>';
      }).join('') + '</div>' + (c.duel.foot ? '<p class="sdek" style="margin-top:18px">' + esc(c.duel.foot) + '</p>' : '') + '</section>');
    }

    h.push('<section class="blk">' + PT.sectionHead(c.duel ? '11' : '10', 'Lo que dicen los números', 'Rachas, remontadas y los partidos que marcaron la temporada.'));
    h.push('<div class="tiles">' + c.highlights.map(function (x) { return PT.tile(esc(x.v), x.k, x.sub); }).join('') + '</div></section>');

    /* Los golpes: manual, y solo de tu pareja. */
    var slug = season.slug || '';
    var f = firmas(slug);
    var num = c.duel ? '12' : '11';
    if (own) h.push('<section class="blk">' + PT.sectionHead(num, 'Izquierda y derecha', 'Esto no sale de los números: lo escribes tú.'));
    if (!own) { /* nada: los golpes de otra pareja no los escribes tú */ }
    else if (cronUi.editing) {
      h.push('<div class="sigs">' + ['me', 'partner'].map(function (k) {
        return '<div class="sig"><div class="field"><label>Lado de ' + esc(names[k]) + '</label><input type="text" data-fm-side="' + k +
          '" value="' + esc(f[k].side || '') + '" placeholder="Revés · Izquierda"></div>' +
          '<div class="field"><label>Golpes (uno por línea, «Golpe: lo que aporta»)</label><textarea rows="5" data-fm-shots="' + k + '">' +
          esc(shotsToText(f[k].shots)) + '</textarea></div></div>';
      }).join('') + '</div><div class="btn-row"><button class="btn primary" data-fm="save">Guardar</button>' +
        '<button class="btn ghost" data-fm="cancel">Cancelar</button></div>');
    } else {
      var empty = !f.me.shots.length && !f.partner.shots.length;
      if (empty) {
        h.push('<p class="note">Aún no has escrito los golpes de esta temporada: qué aporta cada uno, qué apareció y cuándo.</p>');
      } else {
        h.push('<div class="sigs">' + ['me', 'partner'].map(function (k) {
          return '<div class="sig"><div class="side">' + esc(f[k].side || '') + '</div><h3>' + esc(names[k]) + '</h3>' +
            f[k].shots.map(function (x) {
              return '<div class="shot"><div class="nm">' + esc(x[0]) + '</div><div class="ds">' + esc(x[1]) + '</div></div>';
            }).join('') + '</div>';
        }).join('') + '</div>');
      }
      h.push('<div class="btn-row" style="margin-top:12px"><button class="btn ghost small" data-fm="edit">' +
        (empty ? 'Escribir los golpes' : 'Editar') + '</button></div>');
    }
    if (own) h.push('</section>');

    if (c.levels) {
      var L1 = c.levels.me, L2 = c.levels.partner;
      h.push('<section class="blk">' + PT.sectionHead(String(+num + 1), 'Los niveles del club',
        'El club puntúa a cada jugador por separado, con todos sus partidos.'));
      h.push('<div class="tiles">' + PT.tile(n2(L1.to), L1.name + ' · nivel final', 'Desde ' + n2(L1.from) + ' · ' + L1.n + ' partidos') +
        (L2 ? PT.tile(n2(L2.to), L2.name + ' · nivel final', 'Desde ' + n2(L2.from) + ' · ' + L2.n + ' partidos') : '') +
        PT.tile((L1.to - L1.from >= 0 ? '+' : '') + n2(L1.to - L1.from), 'Lo que subió ' + L1.name) +
        (L2 ? PT.tile((L2.to - L2.from >= 0 ? '+' : '') + n2(L2.to - L2.from), 'Lo que subió ' + L2.name) : '') + '</div>');
      if (L2) {
        var gap = L1.to - L2.to, extra = L1.n - L2.n;
        h.push('<div class="close"><p>Al cierre, <b>' + n2(Math.abs(gap)) + '</b> de diferencia a favor de ' +
          esc(gap >= 0 ? L1.name : L2.name) + '. ' + (extra ? esc(extra > 0 ? L1.name : L2.name) + ' jugó <b>' + Math.abs(extra) +
          ' partidos más</b> en el club, y cada partido suma o resta.' : 'Los dos jugasteis los mismos partidos.') +
          '</p><p>Se ve mejor en <button class="linkish" data-goto="temporada">la escalera</button>, con la métrica «Nivel del club».</p></div>');
      }
      h.push('</section>');
    }
    h.push('</div>');
    view.innerHTML = h.join('');

    bindCronicaFilters(view, m);
    view.querySelectorAll('[data-fm]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-fm');
        if (a === 'save') {
          var nf = { me: {}, partner: {} };
          ['me', 'partner'].forEach(function (k) {
            nf[k].side = view.querySelector('[data-fm-side="' + k + '"]').value.trim();
            nf[k].shots = textToShots(view.querySelector('[data-fm-shots="' + k + '"]').value);
          });
          saveFirmas(slug, nf);
        }
        cronUi.editing = a === 'edit';
        paintCronica(view, bind);
      });
    });
    bind();
  }

  /* ============================================================
     INICIO · la pista es el menú (js/court.js la dibuja)
     ============================================================ */
  function renderInicio(view, bind, go) {
    PT.stopTimer();
    PT.withModel(view, function () { paintInicio(view, bind, go); });
  }

  function paintInicio(view, bind, go) {
    var m = PL.state.model;
    var rows = PT.mine(m);
    var a = rows.length ? PT.agg(rows) : null;
    var me = m.myTeamId ? m.teams[m.myTeamId] : null;
    var notes = (global.PadelApp && global.PadelApp.records ? global.PadelApp.records().length : 0);
    /* Misma lectura que en Temporada y en Rival: la más reciente primero. */
    var form = rows.slice(-5).reverse().map(function (r) { return r.win; });
    var total = m.ladder[m.lastMonth] ? Object.keys(m.ladder[m.lastMonth]).length : m.order.length;

    var live = {
      liga: total + ' parejas',
      temporada: a ? (a.w + '–' + a.l + ' · #' + a.posFin) : '',
      registro: 'En 2 min',
      historial: notes ? notes + (notes === 1 ? ' nota' : ' notas') : 'Tus partidos',
      analisis: 'Y briefing',
      cronica: global.PadelApp ? global.PadelApp.seasonName((m.season || {}).slug) : '',
      estemes: global.__NET_LABEL__ || (global.PadelEsteMes ? global.PadelEsteMes.netLabel() : '')
    };

    /* Marcador: quiénes sois, dónde estáis y cómo venís. */
    var h = ['<section class="home">'];
    h.push('<div class="home-side">' +
      '<p class="home-quote">«El pádel<br>conecta<br>personas»</p>' +
      '<div class="scoreboard">' +
      '<div class="eyebrow">' + esc((m.season && m.season.name) || 'Liga') + '</div>' +
      '<h2 class="home-names">' + esc(me ? heroName(me.playerA) : 'La liga') +
      (me ? '<em>' + esc(heroName(me.playerB)) + '</em>' : '') + '</h2>');
    if (!me) {
      var prof = global.PadelDB.myPlayer();
      if (prof && prof.label) h.push('<p class="home-line">No apareces en <b>' + esc((m.season && m.season.name) || 'esta competición') +
        '</b> como <b>' + esc(prof.label) + '</b>. Mientras, puedes mirar cualquier pareja.</p>');
      h.push(generalBoard(m));
    }
    else if (m.myTeamId !== m.ownTeamId) {
      h.push('<div class="home-pair"><span>Mirando a esta pareja</span>' +
        (m.ownTeamId ? '<button class="hp-btn" data-pair="own">Volver a la mía</button>' : '') +
        '<button class="hp-btn" data-pair="pick">Elegir otra</button></div>');
    }
    if (a) {
      var climb = a.posIni - a.posFin;
      h.push('<div class="home-rank"><span class="hr-lab">Puesto</span>' +
        '<span class="hr-n" id="rankCounter" data-from="' + a.posIni + '" data-to="' + a.posFin + '">#' + a.posFin + '</span>' +
        '<span class="hr-of">de ' + a.totFin + '</span></div>');
      h.push('<div class="home-chips">' +
        '<span class="hc">G' + a.grFin + '</span>' +
        '<span class="hc">' + a.w + '–' + a.l + '</span>' +
        '<span class="hc form" title="Últimos cinco, el más reciente primero">' + form.map(function (w) {
          return '<i class="' + (w ? 'w' : 'l') + '" title="' + (w ? 'Victoria' : 'Derrota') + '"></i>';
        }).join('') + '</span></div>');
      h.push('<p class="home-line">' + (climb > 0
        ? 'Habéis subido <b>' + climb + ' puestos</b> desde el #' + a.posIni + '. '
        : '') + 'Toca la pista para entrar.</p>');
    }
    h.push('</div></div>');
    h.push('<div class="court-host" id="courtHost"></div>');
    h.push('</section>');

    view.innerHTML = h.join('');
    view.querySelectorAll('[data-pair]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-pair') === 'own') global.PadelApp.choosePair('own');
        else global.PadelApp.openPairPicker();
      });
    });
    animateRank();
    global.PadelCourt.mount(document.getElementById('courtHost'), live, go);
    bind();
  }

  /* Portada sin pareja: la liga en cuatro datos y la puerta para elegir una. */
  function generalBoard(m) {
    var lad = m.ladder[m.lastMonth] || {};
    var ids = Object.keys(lad).map(Number);
    var last = (m.months.filter(function (x) { return x.n === m.lastMonth; })[0] || {}).label || '';
    var top = ids.filter(function (id) { return lad[id].place === 1; })[0];
    var groups = {};
    ids.forEach(function (id) { groups[lad[id].group] = true; });
    var played = m.matches.filter(function (x) { return x.month === m.lastMonth; }).length;
    var h = ['<div class="home-chips">' +
      '<span class="hc">' + ids.length + ' parejas</span>' +
      '<span class="hc">' + Object.keys(groups).length + ' grupos</span>' +
      '<span class="hc">' + esc(last) + ' · ' + played + ' partidos</span></div>'];
    if (top) h.push('<p class="home-line">Arriba del todo: <b>' + esc(m.teams[top].label) + '</b>.</p>');
    h.push('<div class="home-pair"><button class="hp-btn main" data-pair="pick">Elegir una pareja</button></div>');
    return h.join('');
  }

  function whoAmI() {
    var p = global.PadelDB.myPlayer();
    return (p && p.label) || 'Francisco';
  }

  /* La liga escribe "Cristian C": en portada sobra la inicial suelta. */
  function heroName(label) {
    return String(label || '').replace(/\s+[A-ZÁÉÍÓÚÑ]\.?$/, '').trim();
  }

  function reduceMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function animateRank() {
    var el = document.getElementById('rankCounter');
    if (!el || reduceMotion()) return;
    var from = Number(el.getAttribute('data-from')), to = Number(el.getAttribute('data-to'));
    if (!(from > to)) return;
    var t0 = null, dur = 1300;
    function step(ts) {
      if (!document.body.contains(el)) return;
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = '#' + Math.round(from - (from - to) * e);
      if (k < 1) global.requestAnimationFrame(step);
    }
    el.textContent = '#' + from;
    global.requestAnimationFrame(step);
  }

  global.PadelGeneral = {
    renderGeneral: renderGeneral, renderCronica: renderCronica, renderInicio: renderInicio
  };
})(window);
