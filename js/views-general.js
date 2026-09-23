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

    h.push('<section class="blk">' + PT.sectionHead('08', 'Explorador de la liga',
      'Busca a cualquiera y mira su temporada entera: por qué grupos pasó, qué puesto ocupó y todos sus resultados.'));
    h.push('<div class="exp"><div class="exp-list"><input type="search" id="expSearch" ' +
      'placeholder="Buscar pareja o jugador…" autocomplete="off" value="' + esc(ui.expQuery) + '">' +
      '<div class="exp-items" id="expItems"></div></div><div class="exp-detail" id="expDetail"></div></div></section>');

    h.push('<section class="blk">' + PL.loaderCard() + '</section>');
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
    es.addEventListener('input', function () { ui.expQuery = es.value; drawExpList(m); });
    document.getElementById('expItems').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-t]');
      if (!b) return;
      showTeam(m, Number(b.getAttribute('data-t')));
      bind();
    });
    function bindRowLinks() {
      document.querySelectorAll('[data-exp]').forEach(function (b) {
        b.onclick = function () {
          showTeam(m, Number(b.getAttribute('data-exp')));
          var d = document.getElementById('expDetail');
          if (d && d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
          bind();
        };
      });
    }
    bindRowLinks();
    PL.bindLoader(view, function () { paintGeneral(view, bind); });
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
    PT.loadClub(function () { paintCronica(view, bind); });
  }

  function paintCronica(view, bind) {
    var c = ui.club || {};
    var h = ['<div class="lg">'];
    h.push('<div class="stale">Escrito a mano para el <b>primer semestre de 2026</b>. ' +
      'Los números de las otras pantallas se recalculan solos; este relato no.</div>');

    h.push('<section class="blk">' + PT.sectionHead('09', 'Tres actos', 'El semestre no fue una línea recta. Fueron tres equipos distintos.'));
    h.push('<div class="acts">' +
      '<div class="act a1"><div class="ph">Acto I · Marzo</div><h3>Competir</h3><div class="dates">Grupo 17 · 2–2</div>' +
      '<p>El debut. Mitad de los juegos ganados, mitad perdidos. La mitad de los partidos se decidían en el último ' +
      'punto y no caían del lado correcto.</p></div>' +
      '<div class="act a2"><div class="ph">Acto II · Abril</div><h3>El mes clutch</h3><div class="dates">Grupo 17 · 4–0</div>' +
      '<p>Cuatro partidos, cuatro victorias, y <b>los cuatro decididos en super tie-break</b>. En tres de ellos ' +
      'perdisteis el primer set. Ganasteis el grupo entero remontando.</p></div>' +
      '<div class="act a3"><div class="ph">Acto III · Mayo → julio</div><h3>Dejar de sufrir</h3>' +
      '<div class="dates">Grupos 15, 14, 13 · 6–3</div><p>Nueve partidos, <b>ninguno llegó a un tercer set</b>. ' +
      'O 2–0 a favor o 2–0 en contra. El porcentaje de juegos sube cada mes.</p></div></div></section>');

    h.push('<section class="blk">' + PT.sectionHead('10', 'Ernesto & Jordi',
      'Dos partidos contra el mismo equipo, separados por dos meses.'));
    h.push('<div class="duel"><div class="duel-card hot"><div class="when">Abril · Grupo 17 · con público</div>' +
      '<div class="big o">6–1 · 4–6 · 10–9</div><p>Un punto. <b>Un solo punto</b> separó el 4–0 del mes de un 3–1. ' +
      'Ese super tie-break es la bisagra del semestre: sin él no hay primer puesto ni ascenso.</p></div>' +
      '<div class="duel-card"><div class="when">Junio · Grupo 14 · la revancha</div><div class="big">6–2 · 6–2</div>' +
      '<p>Cuatro juegos concedidos en todo el partido. El mismo rival que había empujado hasta el 10–9 ' +
      '<b>no llegó al tercer set</b>.</p></div></div>' +
      '<p class="sdek" style="margin-top:18px">Y no eran un equipo débil: acabaron <b>primeros de su grupo en mayo</b>, ' +
      'justo entre los dos partidos.</p></section>');

    h.push('<section class="blk">' + PT.sectionHead('11', 'Izquierda y derecha', 'Dos lados de la pista, dos maneras de resolver un punto.'));
    h.push('<div class="sigs"><div class="sig"><div class="side">Revés · Izquierda</div><h3>Francisco</h3>' +
      '<div class="shot"><div class="nm">Pegada</div><div class="ds">El golpe fuerte estaba desde el primer día. ' +
      'Es lo que abre el punto y obliga al rival a jugar incómodo.</div></div>' +
      '<div class="shot"><div class="nm">Bajada de pared</div><div class="ds">Apareció en abril y se convirtió en el ' +
      'sello. Coincide con el mes de las cuatro remontadas.</div></div></div>' +
      '<div class="sig"><div class="side">Drive · Derecha</div><h3>Cristian</h3>' +
      '<div class="shot"><div class="nm">Víbora</div><div class="ds">Letal desde el primer partido. Cierra los puntos ' +
      'que la pegada abre.</div></div><div class="shot"><div class="nm">Saque</div><div class="ds">Seguro desde el ' +
      'arranque. La base de empezar los puntos con la red ganada.</div></div></div></div></section>');

    if (c.fran && c.cris) {
      var fEnd = c.fran[c.fran.length - 1].nivel, cEnd = c.cris[c.cris.length - 1].nivel;
      var n2 = function (v) { return v.toFixed(2).replace('.', ','); };
      var mix = c.fran.filter(function (x) { return x.mixto; }).length;
      h.push('<section class="blk">' + PT.sectionHead('12', 'Los dos niveles del club',
        'El club puntúa a cada jugador por separado. Los dos empezasteis en <b>0,18</b> el 12 de marzo.'));
      h.push('<div class="tiles">' +
        PT.tile(n2(fEnd), 'Francisco · nivel final') + PT.tile(n2(cEnd), 'Cristian · nivel final') +
        PT.tile(n2(cEnd), 'Ganado por los dos en liga') +
        PT.tile('+' + n2(c.mixto || (fEnd - cEnd)), 'Aportado por el mixto', mix + ' partidos') + '</div>');
      h.push('<div class="close"><p>En los <b>17 partidos de liga</b> ganasteis exactamente lo mismo. La brecha de ' +
        '<b>' + n2(fEnd - cEnd) + '</b> coincide punto por punto con lo que le aportaron a Francisco sus <b>' + mix +
        ' partidos de mixto</b>, los que Cristian no juega. No hay diferencia de rendimiento: hay ' + mix +
        ' partidos de más.</p><p>Se ve mejor en <button class="linkish" data-goto="temporada">la escalera</button>, ' +
        'con la métrica «Nivel del club».</p></div></section>');
    }
    h.push('</div>');
    view.innerHTML = h.join('');
    bind();
  }

  /* ============================================================
     INICIO · la pista es el menú
     ============================================================ */
  var ZONES = [
    { id: 'liga', view: 'liga', x: 10, y: 10, w: 200, h: 130.5, title: 'La liga', hint: 'Clasificación y explorador' },
    { id: 'cronica', view: 'cronica', x: 10, y: 140.5, w: 100, h: 69.5, title: 'Crónica', hint: '1er semestre' },
    { id: 'analisis', view: 'analisis', x: 110, y: 140.5, w: 100, h: 69.5, title: 'Análisis', hint: 'Patrones' },
    { id: 'registro', view: 'registro', x: 10, y: 210, w: 100, h: 69.5, title: 'Registrar', hint: 'Tras jugar' },
    { id: 'historial', view: 'historial', x: 110, y: 210, w: 100, h: 69.5, title: 'Historial', hint: 'Tus notas' },
    { id: 'temporada', view: 'temporada', x: 10, y: 279.5, w: 200, h: 130.5, title: 'Nuestra temporada', hint: '' }
  ];

  function renderInicio(view, bind, go) {
    PT.stopTimer();
    PT.withModel(view, function () { paintInicio(view, bind, go); });
  }

  function paintInicio(view, bind, go) {
    var m = PL.state.model;
    var rows = PT.mine(m);
    var a = rows.length ? PT.agg(rows) : null;
    var me = m.myTeamId ? m.teams[m.myTeamId] : null;
    var notes = (global.PadelStorage && global.PadelStorage.all().length) || 0;
    /* Misma lectura que en Temporada y en Rival: la más reciente primero. */
    var form = rows.slice(-5).reverse().map(function (r) { return r.win; });
    var total = m.ladder[m.lastMonth] ? Object.keys(m.ladder[m.lastMonth]).length : m.order.length;

    var live = {
      liga: total + ' parejas',
      temporada: a ? (a.w + '–' + a.l + ' · #' + a.posFin) : '',
      registro: 'En 2 min',
      historial: notes ? notes + (notes === 1 ? ' nota' : ' notas') : 'Vacío',
      analisis: 'Y briefing',
      cronica: '1er semestre'
    };

    var h = [];
    h.push('<section class="home-hero">' +
      '<img class="home-crest" src="assets/logo.png" alt="Club Tennis El Molí" width="92" height="92">' +
      '<div class="eyebrow">Club Tennis El Molí · ' + esc((m.season && m.season.name) || 'Liga') + '</div>' +
      '<h2 class="home-names">' + esc(me ? heroName(me.playerA) : 'Francisco') + '<em>' +
      esc(me ? heroName(me.playerB) : '') + '</em></h2>');
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
    h.push('</section>');

    h.push('<section class="court-wrap" aria-label="La pista: cada zona abre una parte de la app">' +
      courtSvg(live) + '</section>');

    h.push('<section class="home-cards" aria-label="Todas las secciones">' +
      card('temporada', 'Nuestra temporada', 'Números, escalera animada, mes a mes, acantilado, rivales y techo.', live.temporada) +
      card('rival', 'El rival', 'Elige la pareja que te toca: proyección, historial directo y plan.', 'La red') +
      card('liga', 'La liga', 'Clasificación general, explorador de cualquier pareja y carga de datos.', live.liga) +
      card('registro', 'Registrar', 'La capa de scouting: lo que la liga no sabe de tu partido.', live.registro) +
      card('historial', 'Historial', 'Tus partidos anotados, con filtros y backup.', live.historial) +
      card('analisis', 'Análisis', 'Patrones que se repiten, win rate por arquetipo y briefing.', live.analisis) +
      card('cronica', 'Crónica', 'Los tres actos, el duelo, las firmas y los dos niveles del club.', live.cronica) +
      '</section>');

    view.innerHTML = h.join('');
    animateRank();
    bindCourt(view, go);
    bind();
  }

  /* La liga escribe "Cristian C": en portada sobra la inicial suelta. */
  function heroName(label) {
    return String(label || '').replace(/\s+[A-ZÁÉÍÓÚÑ]\.?$/, '').trim();
  }

  function card(viewId, title, text, stat) {
    return '<button class="home-card" data-goto="' + viewId + '"><span class="hcard-t">' + esc(title) + '</span>' +
      '<span class="hcard-d">' + esc(text) + '</span>' +
      (stat ? '<span class="hcard-s">' + esc(stat) + '</span>' : '') + '<span class="hcard-go" aria-hidden="true">→</span></button>';
  }

  function courtSvg(live) {
    var z = ZONES.map(function (zn) {
      var cx = zn.x + zn.w / 2, cy = zn.y + zn.h / 2;
      var big = zn.h > 100;
      return '<g class="zone" data-zone="' + zn.id + '" data-view="' + zn.view + '" tabindex="0" role="button" ' +
        'aria-label="' + esc(zn.title) + '">' +
        '<rect class="zone-hit" x="' + zn.x + '" y="' + zn.y + '" width="' + zn.w + '" height="' + zn.h + '"/>' +
        '<text class="zt' + (big ? ' big' : '') + '" x="' + cx + '" y="' + (cy - (big ? 4 : 2)) + '">' + esc(zn.title) + '</text>' +
        '<text class="zs" x="' + cx + '" y="' + (cy + (big ? 13 : 11)) + '">' + esc(live[zn.id] || zn.hint) + '</text></g>';
    }).join('');

    return '<svg class="court" viewBox="0 0 220 420" role="group">' +
      '<defs><radialGradient id="ballg" cx="35%" cy="35%" r="70%"><stop offset="0" stop-color="#FFD9A8"/>' +
      '<stop offset="1" stop-color="#ED6C05"/></radialGradient>' +
      '<linearGradient id="turf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2C3A22"/>' +
      '<stop offset=".5" stop-color="#34452A"/><stop offset="1" stop-color="#2C3A22"/></linearGradient></defs>' +
      '<rect x="10" y="10" width="200" height="400" rx="3" fill="url(#turf)"/>' +
      /* cristales de fondo y laterales, malla en el resto */
      '<path class="glass" d="M10 50 V10 H210 V50 M10 370 V410 H210 V370"/>' +
      '<path class="mesh" d="M10 50 V370 M210 50 V370"/>' +
      /* líneas de juego */
      '<line class="ln" x1="10" y1="140.5" x2="210" y2="140.5"/>' +
      '<line class="ln" x1="10" y1="279.5" x2="210" y2="279.5"/>' +
      '<line class="ln" x1="110" y1="140.5" x2="110" y2="279.5"/>' +
      z +
      /* la red es el rival: lo que te separa del otro lado */
      '<g class="zone net" data-zone="rival" data-view="rival" tabindex="0" role="button" aria-label="El rival">' +
      '<rect class="zone-hit" x="4" y="196" width="212" height="28" rx="6"/>' +
      '<line class="netline" x1="6" y1="210" x2="214" y2="210"/>' +
      '<rect class="netpill" x="72" y="200" width="76" height="20" rx="10"/>' +
      '<text class="zt net-t" x="110" y="214">EL RIVAL</text></g>' +
      '<circle id="ball" class="ball" cx="110" cy="380" r="5"/>' +
      '</svg>';
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

  /* La pelota viaja a la zona que tocas y luego se entra. Sin
     animaciones si el sistema pide movimiento reducido. */
  function flyBall(tx, ty, done) {
    var ball = document.getElementById('ball');
    if (!ball || reduceMotion()) { done(); return; }
    var sx = Number(ball.getAttribute('cx')), sy = Number(ball.getAttribute('cy'));
    var t0 = null, dur = 360;
    function step(ts) {
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur);
      var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      var arc = Math.sin(Math.PI * k) * 26;
      ball.setAttribute('cx', sx + (tx - sx) * e);
      ball.setAttribute('cy', sy + (ty - sy) * e - arc);
      ball.setAttribute('r', 5 + Math.sin(Math.PI * k) * 2.2);
      if (k < 1) global.requestAnimationFrame(step); else done();
    }
    global.requestAnimationFrame(step);
  }

  function rally() {
    var ball = document.getElementById('ball');
    if (!ball || reduceMotion()) return;
    var pts = [[110, 380], [60, 70], [160, 330], [70, 110], [110, 250]];
    var i = 0;
    function next() {
      if (!document.getElementById('ball') || i >= pts.length - 1) return;
      var a = pts[i], b = pts[i + 1];
      var t0 = null, dur = 520;
      function step(ts) {
        if (!document.getElementById('ball')) return;
        if (!t0) t0 = ts;
        var k = Math.min(1, (ts - t0) / dur);
        var arc = Math.sin(Math.PI * k) * 18;
        ball.setAttribute('cx', a[0] + (b[0] - a[0]) * k);
        ball.setAttribute('cy', a[1] + (b[1] - a[1]) * k - arc);
        if (k < 1) global.requestAnimationFrame(step); else { i++; next(); }
      }
      global.requestAnimationFrame(step);
    }
    next();
  }

  function bindCourt(view, go) {
    Array.prototype.forEach.call(view.querySelectorAll('.zone'), function (g) {
      function activate() {
        var target = g.getAttribute('data-view');
        var rect = g.querySelector('.zone-hit');
        var cx = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2;
        var cy = Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) / 2;
        g.classList.add('hit');
        flyBall(cx, cy, function () { go(target); });
      }
      g.addEventListener('click', activate);
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activate(); }
      });
    });
    setTimeout(rally, 250);
  }

  global.PadelGeneral = {
    renderGeneral: renderGeneral, renderCronica: renderCronica, renderInicio: renderInicio
  };
})(window);
