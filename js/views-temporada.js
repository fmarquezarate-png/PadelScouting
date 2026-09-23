/* ============================================================
   views-temporada.js · la temporada, la liga y la crónica
   Recupera todo lo que tenía el dashboard original del primer
   semestre, ahora leyendo de la base en vez de un texto incrustado:
     · números · escalera animada · mes a mes · acantilado del TB
     · todos los partidos · rivales · techo · clasificación
     · explorador · crónica (actos, duelo, firmas, niveles del club)
   ============================================================ */
(function (global) {
  'use strict';

  var L = global.Liga;
  var PL = global.PadelLiga;
  var esc = PL.esc;

  /* Fechas y orden real de los partidos del primer semestre. La liga no
     publica fechas: se reconstruyeron cruzando la tabla con el histórico
     de nivel del club de Cristian (17 registros para 17 partidos). Solo
     valen para esa temporada. */
  var S1 = {
    slug: '2026-s1',
    fechas: { 2: ['12/03', '21/03', '27/03', '30/03'], 3: ['09/04', '16/04', '24/04', '28/04'],
              4: ['20/05', '27/05', '28/05'], 5: ['11/06', '29/06', '30/06'], 6: ['21/07', '27/07', '30/07'] },
    orden: { 2: ['Yago', 'Quim', 'Josep Bels', 'Ferran Cod'],
             3: ['Eduardo', 'Ernesto', 'Yago', 'Daniel Arm'],
             4: ['Guillem', 'Enric Castillo', 'Eduardo'],
             5: ['Tim', 'Ernesto', 'Josep Mª'],
             6: ['Carlos San', 'Jose Luis', 'Pere Armen'] }
  };

  var ui = {
    metric: 'pos', upto: null, timer: null,
    rowsFilter: 'all', rivSort: 'lad', openRiv: {},
    tblSort: { k: 'pos', asc: true }, tblQuery: '', tblOnlyRivals: false,
    expQuery: '', expSel: null,
    club: null, clubLoading: false
  };

  /* ============================================================
     Adaptador: nuestros partidos, vistos desde nuestro lado
     ============================================================ */
  function mine(m) {
    var me = m.myTeamId;
    if (!me) return [];
    var label = {};
    m.months.forEach(function (x) { label[x.n] = x.label; });
    var last = m.lastMonth;
    var lastLad = m.ladder[last] || {};
    var lastTotal = null;
    Object.keys(lastLad).some(function (k) { lastTotal = lastLad[k].total; return true; });

    var rows = m.matches.filter(function (x) {
      return (x.home === me || x.away === me) && x.sets;
    }).map(function (x) {
      var home = x.home === me;
      var rival = home ? x.away : x.home;
      var sets = home ? x.sets : x.sets.map(function (s) { return [s[1], s[0]]; });
      var t = L.tally(sets);
      var lad = m.ladder[x.month] && m.ladder[x.month][me];
      var rl = lastLad[rival];
      return {
        mes: x.month, mesnom: label[x.month] || ('Mes ' + x.month),
        rivalId: rival, rival: m.teams[rival] ? m.teams[rival].label : '?',
        sets: sets, win: t.setsFor > t.setsAgainst,
        gf: t.gamesFor, ga: t.gamesAgainst, stb: x.superTieBreak,
        ganoS1: sets[0][0] > sets[0][1],
        pre: home ? x.preHome : x.preAway, post: home ? x.postHome : x.postAway,
        lad: rl ? rl.place : null, ladTot: lastTotal,
        pos: lad ? lad.place : null, posTot: lad ? lad.total : null,
        grupo: lad ? lad.group : null, inGroup: lad ? lad.inGroup : null
      };
    });

    /* Orden y fechas reales solo donde se conocen. */
    var isS1 = m.season && m.season.slug === S1.slug;
    var byMes = {};
    rows.forEach(function (r) { (byMes[r.mes] = byMes[r.mes] || []).push(r); });
    var out = [];
    Object.keys(byMes).map(Number).sort(function (a, b) { return a - b; }).forEach(function (mes) {
      var arr = byMes[mes];
      if (isS1 && S1.orden[mes]) {
        var ord = S1.orden[mes];
        arr = arr.slice().sort(function (a, b) {
          var ia = ord.findIndex(function (k) { return a.rival.indexOf(k) >= 0; });
          var ib = ord.findIndex(function (k) { return b.rival.indexOf(k) >= 0; });
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
      }
      arr.forEach(function (r, i) {
        r.fecha = (isS1 && S1.fechas[mes] && S1.fechas[mes][i]) || r.mesnom.slice(0, 3);
        r.realDate = !!(isS1 && S1.fechas[mes] && S1.fechas[mes][i]);
        out.push(r);
      });
    });

    /* Medias móviles de 3 partidos, como en el original. */
    out.forEach(function (r, i) {
      var w = out.slice(Math.max(0, i - 2), i + 1);
      var gf = w.reduce(function (s, x) { return s + x.gf; }, 0);
      var ga = w.reduce(function (s, x) { return s + x.ga; }, 0);
      r.rollGames = (gf + ga) ? 100 * gf / (gf + ga) : 50;
      r.rollDom = w.reduce(function (s, x) { return s + x.gf - x.ga; }, 0) / w.length;
    });
    return out;
  }

  function agg(rows) {
    var w = rows.filter(function (r) { return r.win; }).length;
    var sum = function (f) { return rows.reduce(function (s, r) { return s + f(r); }, 0); };
    var tb = rows.filter(function (r) { return r.stb; });
    var first = rows[0], last = rows[rows.length - 1];
    return {
      n: rows.length, w: w, l: rows.length - w,
      gf: sum(function (r) { return r.gf; }), ga: sum(function (r) { return r.ga; }),
      sf: sum(function (r) { return r.sets.filter(function (s) { return s[0] > s[1]; }).length; }),
      sa: sum(function (r) { return r.sets.filter(function (s) { return s[0] < s[1]; }).length; }),
      tbw: tb.filter(function (r) { return r.win; }).length,
      tbl: tb.filter(function (r) { return !r.win; }).length,
      s1: rows.filter(function (r) { return r.ganoS1; }).length,
      s1w: rows.filter(function (r) { return r.ganoS1 && r.win; }).length,
      cb: rows.filter(function (r) { return !r.ganoS1 && r.win; }).length,
      posIni: first ? first.pos : null, posFin: last ? last.pos : null,
      totFin: last ? last.posTot : null,
      grIni: first ? first.grupo : null, grFin: last ? last.grupo : null,
      nivel: last ? last.post : null
    };
  }

  function tile(n, k, sub) {
    return '<div class="tile"><div class="n">' + n + '</div><div class="k">' + esc(k) + '</div>' +
      (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function sectionHead(num, title, dek) {
    return '<div class="shead"><span class="snum">' + num + '</span><h2>' + esc(title) + '</h2></div>' +
      (dek ? '<p class="sdek">' + dek + '</p>' : '');
  }

  function withModel(view, paint) {
    PL.ensureLoaded(function () {
      if (!PL.state.model) {
        view.innerHTML = '<div class="notice bad"><b>No he podido cargar la liga.</b> ' +
          'Comprueba la conexión y vuelve a entrar.</div>';
        return;
      }
      paint();
    });
    if (!PL.state.model) view.innerHTML = PL.loadingHtml('Cargando la liga…');
  }

  function stopTimer() {
    if (ui.timer) { clearInterval(ui.timer); ui.timer = null; }
  }

  /* ============================================================
     TEMPORADA
     ============================================================ */
  function renderTemporada(view, bind) {
    stopTimer();
    withModel(view, function () { paintTemporada(view, bind); });
  }

  function paintTemporada(view, bind) {
    var m = PL.state.model;
    var rows = mine(m);
    if (!rows.length) {
      view.innerHTML = '<div class="notice">Todavía no hay partidos tuyos en esta temporada.</div>';
      return;
    }
    var a = agg(rows);
    var h = ['<div class="lg">'];

    h.push(PL.sourceNote());

    /* 01 · Números */
    h.push('<section class="blk">' + sectionHead('01', 'La temporada en números',
      'Todo sale de los <b>' + m.matches.length + '</b> partidos de la liga entera, no solo de los vuestros.'));
    h.push('<div class="tiles">' +
      tile(a.n, 'Partidos jugados') +
      tile(a.w + '–' + a.l, 'Victorias / derrotas') +
      tile(a.posIni + ' → ' + a.posFin, 'Puesto en la liga', 'de ' + a.totFin) +
      tile('G' + a.grIni + ' → G' + a.grFin, 'Grupos', (a.grIni - a.grFin) + ' escalones') +
      tile(Math.round(100 * a.w / a.n) + '<small>%</small>', 'Partidos ganados') +
      tile(a.sf + '–' + a.sa, 'Sets') +
      tile(a.gf + '–' + a.ga, 'Juegos') +
      tile(a.tbw + '–' + a.tbl, 'Super tie-breaks') +
      tile(a.s1w + '/' + a.s1, 'Ganando el primer set') +
      tile(a.cb, 'Remontadas tras perder el 1º') +
      tile(Math.round(a.nivel), 'Nivel final', 'media de la liga 1500') +
      tile(rows.slice(-5).reverse().map(function (r) { return r.win ? 'V' : 'D'; }).join(' '),
        'Forma', 'el más reciente primero') +
      '</div></section>');

    /* 02 · La escalera */
    h.push('<section class="blk">' + sectionHead('02', 'La escalera',
      'Dale al play y mira cómo se mueve la curva partido a partido. <b>Verde si ganasteis, rojo si no.</b> ' +
      'Arrastra la barra para pararte donde quieras.'));
    h.push('<details class="method"><summary>Cómo se calcula el puesto</summary><div class="body">' +
      '<p>La liga son grupos ordenados por nivel: el 1 es el más fuerte. Un equipo del grupo 15 nunca se ' +
      'cruza con uno del 2, así que <b>no se comparan resultados entre grupos</b>.</p>' +
      '<p><code>puesto = equipos en los grupos de arriba + posición en tu grupo</code>. ' +
      'Si estás 2º del grupo 13 y arriba hay 12 grupos de 4, tu puesto es 12×4 + 2 = <b>50</b>.</p>' +
      '<p>El <b>nivel</b> es más fino: parte del grupo de entrada y sube o baja partido a partido según ' +
      'a quién ganes y por cuánto.</p></div></details>');
    h.push('<div class="ctrl" id="metrics"></div>');
    h.push('<div class="chart-box"><svg id="chart" viewBox="0 0 940 430" role="img" ' +
      'aria-label="Evolución de la temporada"></svg><div id="tip"></div>' +
      '<div class="player"><button class="play" id="play" aria-label="Reproducir la temporada">▶</button>' +
      '<input type="range" id="scrub" min="1" max="' + rows.length + '" value="' + rows.length +
      '" aria-label="Partido"><div class="pos" id="scrubPos"></div></div></div>');
    h.push('<div class="legend"><span><i style="background:var(--sage-dk)"></i>Victoria</span>' +
      '<span><i style="background:var(--brick)"></i>Derrota</span>' +
      '<span><i style="background:rgba(237,108,5,.30)"></i>El mes clutch</span>' +
      '<span><i style="background:transparent;border:2px solid var(--sage-dk)"></i>Mixto (solo en el nivel del club)</span>' +
      '</div></section>');

    /* 03 · Mes a mes */
    h.push('<section class="blk">' + sectionHead('03', 'Mes a mes',
      'Balance, juegos y puesto al cierre de cada mes.'));
    h.push('<div class="mgrid">' + monthCards(rows) + '</div>');
    h.push('<div class="sub-head"><h3>El acantilado del tie-break</h3></div>' +
      '<p class="sdek">Los ' + rows.length + ' partidos en orden. <b>Toca cualquiera</b> para verlo. ' +
      'Los que se decidieron en el super tie-break van coloreados por lo apretados que fueron: ' +
      'cuanto más morado, más cerca estuvo de irse al otro lado.</p>' +
      '<div class="cliff" id="cliff"></div><div class="cliff-ax" id="cliffAx"></div>' +
      '<div class="bubble" id="bubble"></div>' +
      '<div class="scale"><span>AGÓNICO</span><span class="bar"></span><span>CÓMODO</span></div></section>');

    /* 04 · Todos los partidos */
    h.push('<section class="blk">' + sectionHead('04', 'Todos los partidos',
      'Cada resultado, lo que movió el nivel y dónde acabó ese rival.'));
    h.push('<div class="ctrl" id="filters">' +
      [['all', 'Todos'], ['w', 'Victorias'], ['l', 'Derrotas'], ['tb', 'Super tie-break'], ['cb', 'Remontadas']]
        .map(function (f) {
          return '<button data-f="' + f[0] + '" class="' + (ui.rowsFilter === f[0] ? 'on' : '') + '">' +
            f[1] + '</button>';
        }).join('') + '</div>');
    h.push('<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th></th><th>Rival</th>' +
      '<th>Resultado</th><th class="hide-sm">Rival en la liga</th><th>Nivel</th></tr></thead>' +
      '<tbody id="rows"></tbody></table></div>');
    if (!rows.every(function (r) { return r.realDate; })) {
      h.push('<p class="note">Donde no hay fecha real se muestra el mes: la liga no publica el día del partido.</p>');
    } else {
      h.push('<p class="note">Fechas reconstruidas cruzando el orden de los partidos con el histórico ' +
        'de nivel del club.</p>');
    }
    h.push('</section>');

    /* 05 · Los rivales */
    h.push('<section class="blk">' + sectionHead('05', 'Los rivales',
      'Dónde acabó cada uno en la escalera. Toca para abrir el detalle.'));
    h.push('<div class="ctrl" id="rsort">' +
      [['lad', 'Por puesto en la liga'], ['times', 'Por veces jugado'], ['mes', 'Cronológico']]
        .map(function (s) {
          return '<button data-s="' + s[0] + '" class="' + (ui.rivSort === s[0] ? 'on' : '') + '">' +
            s[1] + '</button>';
        }).join('') + '</div>');
    h.push('<div class="rivs" id="rivs"></div></section>');

    /* 06 · El techo */
    h.push('<section class="blk">' + sectionHead('06', 'El techo',
      'La parte honesta. Cada partido se compara con dónde estaba el rival <b>ese mes</b>.'));
    h.push(techo(m, rows) + '</section>');

    h.push('<section class="blk">' + PL.calibrationCard() + '</section>');
    h.push('</div>');

    view.innerHTML = h.join('');

    renderMetrics(rows);
    renderCliff(rows);
    renderRows(rows);
    renderRivs(rows);
    bindTemporada(view, rows, bind);
    loadClub(function () { drawChart(rows); });
  }

  function monthCards(rows) {
    var by = {};
    rows.forEach(function (r) { (by[r.mes] = by[r.mes] || []).push(r); });
    return Object.keys(by).map(Number).sort(function (a, b) { return a - b; }).map(function (mes) {
      var a = by[mes];
      var w = a.filter(function (r) { return r.win; }).length, l = a.length - w;
      var gf = a.reduce(function (s, r) { return s + r.gf; }, 0);
      var ga = a.reduce(function (s, r) { return s + r.ga; }, 0);
      var tb = a.filter(function (r) { return r.stb; }).length, f = a[0];
      return '<div class="mcard' + (l === 0 ? ' best' : '') + '"><div class="mo">' + esc(f.mesnom) + '</div>' +
        '<div class="rc">' + w + '–' + l + '</div>' +
        '<div class="gp">' + Math.round(100 * gf / Math.max(1, gf + ga)) + '% juegos · ' + tb + '/' + a.length + ' a TB</div>' +
        '<div class="lad">Grupo ' + f.grupo + ' · ' + f.inGroup + 'º<br>Puesto ' + f.pos + ' de ' + f.posTot + '</div></div>';
    }).join('');
  }

  /* ---------- la escalera animada ---------- */
  var METRICS = [
    { id: 'pos', label: 'Puesto en la liga', get: function (r) { return r.pos; },
      fmt: function (v) { return '#' + Math.round(v); }, invert: true, step: true },
    { id: 'elo', label: 'Nivel', get: function (r) { return r.post; },
      fmt: function (v) { return Math.round(v); }, mid: 1500 },
    { id: 'games', label: '% de juegos', get: function (r) { return r.rollGames; },
      fmt: function (v) { return v.toFixed(0) + '%'; }, mid: 50 },
    { id: 'dom', label: 'Dominancia', get: function (r) { return r.rollDom; },
      fmt: function (v) { return (v > 0 ? '+' : '') + v.toFixed(1); }, mid: 0 },
    { id: 'club', label: 'Nivel del club · los dos', club: true,
      fmt: function (v) { return v.toFixed(2).replace('.', ','); } }
  ];

  function cur() {
    for (var i = 0; i < METRICS.length; i++) if (METRICS[i].id === ui.metric) return METRICS[i];
    return METRICS[0];
  }

  function renderMetrics(rows) {
    var box = document.getElementById('metrics');
    if (!box) return;
    box.innerHTML = METRICS.map(function (mt) {
      var disabled = mt.club && !(ui.club && ui.club.fran);
      return '<button data-metric="' + mt.id + '" class="' + (ui.metric === mt.id ? 'on' : '') + '"' +
        (disabled ? ' disabled title="Solo hay histórico del club del primer semestre"' : '') + '>' +
        mt.label + '</button>';
    }).join('');
  }

  function clutchMonth(rows) {
    var by = {};
    rows.forEach(function (r) {
      if (!r.stb) return;
      by[r.mes] = by[r.mes] || { mes: r.mes, nom: r.mesnom, tbw: 0, n: 0, w: 0 };
      if (r.win) by[r.mes].tbw++;
    });
    rows.forEach(function (r) {
      if (by[r.mes]) { by[r.mes].n++; if (r.win) by[r.mes].w++; }
    });
    var best = null;
    Object.keys(by).forEach(function (k) {
      if (!best || by[k].tbw > best.tbw) best = by[k];
    });
    return best && best.tbw >= 2 ? best : null;
  }

  function series(rows) {
    var mt = cur();
    if (mt.club) {
      if (!ui.club || !ui.club.fran) return [];
      return ui.club.fran.map(function (c, i) {
        return { x: i, v: c.nivel, win: c.win, lab: c.fecha, mixto: c.mixto,
                 sub: (c.mixto ? 'Mixto · ' : 'Liga · ') + (c.win ? 'Ganado' : 'Perdido'), mesnom: '' };
      });
    }
    return rows.map(function (r, i) {
      return { x: i, v: mt.get(r), win: r.win, lab: r.fecha, mesnom: r.mesnom,
               sub: r.rival + ' · ' + r.sets.map(function (s) { return s[0] + '–' + s[1]; }).join('  ') };
    });
  }

  function seriesCris() {
    if (!cur().club || !ui.club || !ui.club.cris) return null;
    var byDate = {};
    ui.club.cris.forEach(function (c) { byDate[c.fecha] = c; });
    return ui.club.fran.map(function (c, i) {
      var x = byDate[c.fecha];
      return x ? { x: i, v: x.nivel } : null;
    });
  }

  function layout(box) {
    var px = (box && box.clientWidth) || (global.innerWidth || 1000) - 50;
    if (px < 560) return { W: 460, H: 400, PL: 46, PR: 16, PT: 34, PB: 58, fY: 15, fX: 14, fL: 14, fB: 13, r: 6, rl: 8 };
    if (px < 820) return { W: 700, H: 415, PL: 56, PR: 20, PT: 34, PB: 60, fY: 13, fX: 12.5, fL: 12.5, fB: 11.5, r: 5.6, rl: 7.4 };
    return { W: 940, H: 430, PL: 66, PR: 26, PT: 34, PB: 62, fY: 11.5, fX: 10.5, fL: 11, fB: 10.5, r: 5.2, rl: 7 };
  }

  var NS = 'http://www.w3.org/2000/svg';
  function mk(n, a) {
    var e = document.createElementNS(NS, n);
    for (var k in a) e.setAttribute(k, a[k]);
    return e;
  }

  function drawChart(rows) {
    var svg = document.getElementById('chart'), tip = document.getElementById('tip');
    if (!svg) return;
    svg.innerHTML = '';
    var mt = cur();
    var S = series(rows), n = S.length;
    if (!n) return;
    var LO = layout(svg.parentElement), W = LO.W, H = LO.H;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    if (ui.upto == null || ui.upto > n) ui.upto = n;
    ui.upto = Math.max(1, ui.upto);
    var scrub = document.getElementById('scrub');
    if (scrub) { scrub.max = n; scrub.value = ui.upto; }

    var C2 = seriesCris();
    var vals = S.map(function (p) { return p.v; })
      .concat(C2 ? C2.filter(Boolean).map(function (p) { return p.v; }) : []);
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (mt.mid !== undefined) { lo = Math.min(lo, mt.mid); hi = Math.max(hi, mt.mid); }
    var pad = (hi - lo) * 0.16 || 1; lo -= pad; hi += pad;
    var X = function (i) { return LO.PL + i * (W - LO.PL - LO.PR) / Math.max(1, n - 1); };
    var Y = function (v) {
      var t = (v - lo) / (hi - lo);
      return mt.invert ? LO.PT + t * (H - LO.PT - LO.PB) : H - LO.PB - t * (H - LO.PT - LO.PB);
    };

    /* El mes clutch se calcula, no se escribe a mano. */
    var cl = !mt.club && clutchMonth(rows);
    if (cl) {
      var i0 = rows.findIndex(function (r) { return r.mes === cl.mes; });
      var i1 = rows.map(function (r) { return r.mes; }).lastIndexOf(cl.mes);
      var b0 = X(i0 - 0.5), b1 = X(i1 + 0.5);
      svg.appendChild(mk('rect', { x: b0, y: LO.PT, width: b1 - b0, height: H - LO.PT - LO.PB,
        fill: 'rgba(237,108,5,.11)' }));
      var bt = mk('text', { x: (b0 + b1) / 2, y: LO.PT - 11, fill: '#ED6C05', 'text-anchor': 'middle',
        'font-family': 'IBM Plex Mono', 'font-size': LO.fB, 'letter-spacing': '1.3' });
      bt.textContent = (cl.nom + ' · ' + cl.w + '–' + (cl.n - cl.w) + ', ' + cl.tbw + ' EN SUPER TB').toUpperCase();
      svg.appendChild(bt);
    }

    for (var g = 0; g <= 4; g++) {
      var v = lo + (hi - lo) * g / 4, y = Y(v);
      svg.appendChild(mk('line', { x1: LO.PL, y1: y, x2: W - LO.PR, y2: y, stroke: '#2C3423', 'stroke-width': 1 }));
      var t = mk('text', { x: LO.PL - 12, y: y + 4, fill: '#9AA48C', 'text-anchor': 'end',
        'font-family': 'IBM Plex Mono', 'font-size': LO.fY });
      t.textContent = mt.fmt(v);
      svg.appendChild(t);
    }
    if (mt.mid !== undefined && mt.mid > lo && mt.mid < hi) {
      svg.appendChild(mk('line', { x1: LO.PL, y1: Y(mt.mid), x2: W - LO.PR, y2: Y(mt.mid),
        stroke: '#9AA48C', 'stroke-width': 1, 'stroke-dasharray': '5 5', opacity: 0.45 }));
    }

    var vis = S.slice(0, ui.upto), d = '';
    vis.forEach(function (p, i) {
      if (mt.step && i > 0) d += ' L ' + X(i) + ' ' + Y(vis[i - 1].v);
      d += (i ? ' L ' : 'M ') + X(i) + ' ' + Y(p.v);
    });
    if (vis.length > 1) {
      svg.appendChild(mk('path', { d: d + ' L ' + X(vis.length - 1) + ' ' + (H - LO.PB) + ' L ' + X(0) + ' ' +
        (H - LO.PB) + ' Z', fill: 'rgba(143,166,120,.10)' }));
      svg.appendChild(mk('path', { d: d, fill: 'none', stroke: '#8FA678', 'stroke-width': 2.6,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    }

    var seen = {};
    S.forEach(function (p, i) {
      var key = p.mesnom || p.lab;
      if (mt.club) { if (i % 4) return; } else if (seen[key]) return;
      seen[key] = 1;
      var tx = mk('text', { x: X(i), y: H - LO.PB + 24, fill: '#9AA48C', 'text-anchor': 'middle',
        'font-family': 'IBM Plex Mono', 'font-size': LO.fX, 'letter-spacing': '1' });
      tx.textContent = (mt.club ? p.lab : key).toUpperCase();
      svg.appendChild(tx);
    });

    if (C2) {
      var pts = C2.slice(0, ui.upto).map(function (p, i) { return p ? { i: i, v: p.v } : null; }).filter(Boolean);
      if (pts.length > 1) {
        svg.appendChild(mk('path', { d: pts.map(function (p, k) { return (k ? ' L ' : 'M ') + X(p.i) + ' ' + Y(p.v); }).join(''),
          fill: 'none', stroke: '#ED6C05', 'stroke-width': 2.2, 'stroke-dasharray': '6 4' }));
        var lp = pts[pts.length - 1];
        var ct = mk('text', { x: X(lp.i) + 9, y: Y(lp.v) + 4, fill: '#ED6C05', 'font-family': 'IBM Plex Mono',
          'font-size': LO.fL, 'font-weight': '600' });
        ct.textContent = 'Cristian';
        svg.appendChild(ct);
      }
      var lf = vis[vis.length - 1];
      var ft = mk('text', { x: X(vis.length - 1) + 9, y: Y(lf.v) - 8, fill: '#8FA678',
        'font-family': 'IBM Plex Mono', 'font-size': LO.fL, 'font-weight': '600' });
      ft.textContent = 'Francisco';
      svg.appendChild(ft);
    }

    vis.forEach(function (p, i) {
      var cx = X(i), cy = Y(p.v), last = (i === vis.length - 1);
      var gEl = mk('g', {});
      gEl.style.cursor = 'pointer';
      gEl.appendChild(mk('circle', { cx: cx, cy: cy, r: 15, fill: 'transparent' }));
      gEl.appendChild(mk('circle', { cx: cx, cy: cy, r: last ? LO.rl : LO.r,
        fill: p.mixto ? '#0E1109' : (p.win ? '#687F4E' : '#B4491F'),
        stroke: p.mixto ? (p.win ? '#687F4E' : '#B4491F') : '#0E1109', 'stroke-width': p.mixto ? 2.4 : 2 }));
      var show = function () {
        tip.style.opacity = 1;
        tip.innerHTML = '<div class="t-h">' + esc(p.lab) + (p.mesnom ? ' · ' + esc(p.mesnom) : '') + '</div>' +
          '<div class="t-r"><b>' + esc(p.sub) + '</b></div>' +
          '<div class="t-r" style="margin-top:5px">' + esc(mt.label) + ': <b>' + mt.fmt(p.v) + '</b></div>';
        var r = svg.getBoundingClientRect(), box = svg.parentElement.getBoundingClientRect();
        var px = (cx / W) * r.width + (r.left - box.left), py = (cy / H) * r.height + (r.top - box.top);
        tip.style.left = Math.max(6, Math.min(px - 90, box.width - 196)) + 'px';
        tip.style.top = Math.max(4, py - tip.offsetHeight - 18) + 'px';
      };
      gEl.addEventListener('mouseenter', show);
      gEl.addEventListener('click', show);
      gEl.addEventListener('mouseleave', function () { tip.style.opacity = 0; });
      svg.appendChild(gEl);
    });

    var p = S[ui.upto - 1], pos = document.getElementById('scrubPos');
    if (pos && p) pos.innerHTML = '<b>' + ui.upto + '</b> / ' + n + ' · ' + esc(p.lab);
  }

  function play(rows) {
    var n = series(rows).length;
    if (ui.upto >= n) ui.upto = 0;
    var btn = document.getElementById('play');
    if (btn) btn.textContent = '❚❚';
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ui.timer = setInterval(function () {
      if (!document.getElementById('chart')) { stopTimer(); return; }
      ui.upto++;
      drawChart(rows);
      if (ui.upto >= n) {
        stopTimer();
        var b = document.getElementById('play');
        if (b) b.textContent = '▶';
      }
    }, reduce ? 60 : 820);
  }

  /* ---------- acantilado del tie-break ---------- */
  function marginColor(mg) {
    var st = [[1, [122, 46, 143]], [2, [168, 48, 110]], [3, [194, 68, 54]], [4, [212, 118, 31]],
              [5, [167, 154, 60]], [6, [126, 155, 92]]];
    var v = Math.max(1, Math.min(6, mg));
    for (var i = 0; i < st.length - 1; i++) {
      if (v >= st[i][0] && v <= st[i + 1][0]) {
        var t = (v - st[i][0]) / (st[i + 1][0] - st[i][0]);
        var c = st[i][1].map(function (x, k) { return Math.round(x + (st[i + 1][1][k] - x) * t); });
        return 'rgb(' + c.join(',') + ')';
      }
    }
    return 'rgb(126,155,92)';
  }

  function renderCliff(rows) {
    var box = document.getElementById('cliff');
    if (!box) return;
    box.innerHTML = '';
    rows.forEach(function (r, i) {
      var d = document.createElement('button');
      d.setAttribute('aria-label', r.fecha + ' ' + r.rival);
      if (r.stb) d.style.background = marginColor(Math.abs(r.sets[2][0] - r.sets[2][1]));
      else { d.style.background = 'var(--panel2)'; d.style.borderColor = 'var(--line)'; }
      d.addEventListener('click', function () {
        Array.prototype.forEach.call(box.children, function (c) { c.classList.remove('sel'); });
        d.classList.add('sel');
        showBubble(rows, i);
      });
      box.appendChild(d);
    });
    var seen = {}, ax = [];
    rows.forEach(function (r) { if (!seen[r.mesnom]) { seen[r.mesnom] = 1; ax.push(r.mesnom); } });
    document.getElementById('cliffAx').innerHTML = ax.map(function (a) { return '<span>' + esc(a) + '</span>'; }).join('');
    var tight = rows.filter(function (r) { return r.stb; }).sort(function (a, b) {
      return Math.abs(a.sets[2][0] - a.sets[2][1]) - Math.abs(b.sets[2][0] - b.sets[2][1]);
    })[0];
    var k = rows.indexOf(tight || rows[0]);
    showBubble(rows, k);
    if (box.children[k]) box.children[k].classList.add('sel');
  }

  function showBubble(rows, i) {
    var r = rows[i], b = document.getElementById('bubble');
    if (!r || !b) return;
    var sc = r.sets.map(function (s) { return s[0] + '–' + s[1]; }).join(' · ');
    if (r.stb) {
      var mg = Math.abs(r.sets[2][0] - r.sets[2][1]), col = marginColor(mg);
      b.innerHTML = '<div class="orb" style="background:' + col + ';color:' + col + '">' +
        '<span style="color:#fff">' + r.sets[2][0] + '<br>' + r.sets[2][1] + '</span></div>' +
        '<div class="txt"><div class="h">' + esc(r.fecha) + ' · ' + esc(r.mesnom) + ' · ' + esc(r.rival) + '</div>' +
        '<div class="m">' + sc + '</div><div class="d">Se decidió en el super tie-break por ' +
        '<b style="color:var(--bone)">' + mg + (mg === 1 ? ' punto' : ' puntos') + '</b>. ' +
        (mg <= 1 ? 'Lo más cerca que estuvisteis de perderlo todo.' : mg <= 2 ? 'Un puñado de puntos entre ganar y perder.' :
         mg <= 3 ? 'Apretado hasta el final.' : 'Cómodo dentro de lo que es un tercer set.') + ' ' +
        (r.win ? 'Y cayó de vuestro lado.' : 'Este se escapó.') + '</div></div>';
    } else {
      var sw = r.sets.filter(function (s) { return s[0] > s[1]; }).length;
      b.innerHTML = '<div class="orb" style="background:' + (r.win ? 'var(--sage-dk)' : 'var(--brick)') +
        ';color:' + (r.win ? '#687F4E' : '#B4491F') + '"><span style="color:#fff">' + sw + '<br>' +
        (r.sets.length - sw) + '</span></div><div class="txt"><div class="h">' + esc(r.fecha) + ' · ' +
        esc(r.mesnom) + ' · ' + esc(r.rival) + '</div><div class="m">' + sc + '</div>' +
        '<div class="d">Resuelto sin tercer set. ' + (r.win ? 'De los que no hacen sufrir.' : 'Sin opción de remontada.') +
        '</div></div>';
    }
  }

  /* ---------- todos los partidos ---------- */
  function renderRows(rows) {
    var t = document.getElementById('rows');
    if (!t) return;
    var f = ui.rowsFilter;
    t.innerHTML = rows.filter(function (r) {
      return f === 'all' || (f === 'w' && r.win) || (f === 'l' && !r.win) ||
        (f === 'tb' && r.stb) || (f === 'cb' && !r.ganoS1 && r.win);
    }).map(function (r) {
      var dl = r.post - r.pre;
      return '<tr><td class="sc"><b>' + esc(r.fecha) + '</b></td>' +
        '<td><span class="res ' + (r.win ? 'w' : 'l') + '">' + (r.win ? 'V' : 'D') + '</span></td>' +
        '<td><button class="linkish" data-rival="' + r.rivalId + '">' + esc(r.rival) + '</button>' +
        (r.stb ? ' <span class="tag tb">TB</span>' : '') +
        ((!r.ganoS1 && r.win) ? ' <span class="tag">Remontada</span>' : '') + '</td>' +
        '<td class="sc"><b>' + r.sets.map(function (s) { return s[0] + '–' + s[1]; }).join('</b> · <b>') + '</b></td>' +
        '<td class="sc hide-sm">' + (r.lad ? '#' + r.lad + ' de ' + r.ladTot : '—') + '</td>' +
        '<td class="sc"><b>' + Math.round(r.post) + '</b> <span style="color:' +
        (dl >= 0 ? 'var(--sage)' : 'var(--brick)') + '">' + (dl >= 0 ? '+' : '') + dl.toFixed(1) + '</span></td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty-row">Ningún partido cumple el filtro.</td></tr>';
  }

  /* ---------- rivales ---------- */
  function renderRivs(rows) {
    var box = document.getElementById('rivs');
    if (!box) return;
    var by = {};
    rows.forEach(function (r) { (by[r.rivalId] = by[r.rivalId] || []).push(r); });
    var arr = Object.keys(by).map(function (id) {
      var ms = by[id];
      return { id: Number(id), name: ms[0].rival, ms: ms,
        w: ms.filter(function (r) { return r.win; }).length,
        l: ms.filter(function (r) { return !r.win; }).length,
        lad: ms[0].lad, tot: ms[0].ladTot,
        first: Math.min.apply(null, ms.map(function (r) { return r.mes; })) };
    });
    if (ui.rivSort === 'lad') arr.sort(function (a, b) { return (a.lad || 999) - (b.lad || 999); });
    if (ui.rivSort === 'times') arr.sort(function (a, b) { return b.ms.length - a.ms.length || (a.lad || 999) - (b.lad || 999); });
    if (ui.rivSort === 'mes') arr.sort(function (a, b) { return a.first - b.first; });
    box.innerHTML = arr.map(function (r) {
      var pctBar = r.lad ? Math.max(4, 100 - (r.lad / r.tot * 100)) : 50;
      var det = r.ms.map(function (m) {
        return '<b>' + esc(m.mesnom) + '</b> · ' + m.sets.map(function (s) { return s[0] + '–' + s[1]; }).join(' ') +
          ' · ' + (m.win ? 'victoria' : 'derrota') + (m.stb ? ' · super tie-break' : '');
      }).join('<br>');
      return '<div class="riv ' + (r.l === 0 ? 'beat' : (r.w === 0 ? 'lost' : '')) +
        (ui.openRiv[r.id] ? ' open' : '') + '" data-riv="' + r.id + '">' +
        '<div class="rk">Puesto ' + (r.lad || '—') + ' de ' + (r.tot || '—') + '</div>' +
        '<h4>' + esc(r.name) + '</h4><div class="badge ' + (r.w > r.l ? 'w' : 'l') + '">' + r.w + '–' + r.l + '</div>' +
        '<div class="bar"><i style="width:' + pctBar + '%"></i></div>' +
        '<div class="meta">' + r.ms.length + (r.ms.length > 1 ? ' partidos' : ' partido') + '</div>' +
        '<div class="det">' + det + '<br><button class="btn ghost mini" data-rival="' + r.id + '">' +
        'Analizar como rival →</button></div></div>';
    }).join('');
  }

  /* ---------- el techo ---------- */
  function techo(m, rows) {
    var me = m.myTeamId;
    var above = [], below = [];
    rows.forEach(function (r) {
      var lad = m.ladder[r.mes];
      var rv = lad && lad[r.rivalId], mm = lad && lad[me];
      ((rv && mm && rv.place < mm.place) ? above : below).push(r);
    });
    var rec = function (a) {
      return a.filter(function (r) { return r.win; }).length + '–' + a.filter(function (r) { return !r.win; }).length;
    };
    var gaps = above.filter(function (r) { return !r.win; }).map(function (r) {
      var lad = m.ladder[r.mes];
      return { mes: r.mesnom, riv: r.rival, pos: lad[r.rivalId].place, mia: lad[me].place,
               gap: lad[me].place - lad[r.rivalId].place };
    });
    var bw = below.filter(function (r) { return r.win; }).length;
    var aw = above.filter(function (r) { return r.win; }).length;
    var txt = [];
    if (below.length && bw === below.length) {
      txt.push('Contra todos los que estaban por debajo: <b>' + below.length + ' partidos y ' + bw +
        ' victorias</b>. Ni un tropiezo.');
    } else if (below.length) {
      txt.push('Contra los que estaban por debajo: <b>' + rec(below) + '</b>.');
    }
    if (above.length && aw === 0) {
      txt.push('Contra los de arriba todavía no ha caído ninguno: <b>' + rec(above) + '</b>. ' +
        'Rendís exactamente al nivel de vuestro escalón.');
    } else if (above.length) {
      txt.push('Contra los de arriba: <b>' + rec(above) + '</b>. Ya habéis roto la puerta alguna vez.');
    }
    return '<div class="split"><div class="a"><div class="n">' + rec(above) + '</div>' +
      '<div class="k">Contra equipos por encima en la escalera</div></div>' +
      '<div class="b"><div class="n">' + rec(below) + '</div><div class="k">Contra equipos por debajo</div></div></div>' +
      '<div class="close"><p>' + txt.join('</p><p>') + '</p>' +
      (gaps.length ? '<ul class="gaps">' + gaps.map(function (g) {
        return '<li><b>' + esc(g.mes) + '</b> · ' + esc(g.riv) + ' — puesto ' + g.pos + ', vosotros ' + g.mia +
          ': <span style="color:var(--orange)">' + g.gap + (g.gap === 1 ? ' escalón' : ' escalones') + ' por encima</span></li>';
      }).join('') + '</ul>' : '') + '</div>';
  }

  function bindTemporada(view, rows, bind) {
    var metrics = document.getElementById('metrics');
    if (metrics) metrics.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-metric]');
      if (!b || b.disabled) return;
      stopTimer();
      var btn = document.getElementById('play');
      if (btn) btn.textContent = '▶';
      ui.metric = b.getAttribute('data-metric');
      ui.upto = null;
      renderMetrics(rows);
      drawChart(rows);
    });
    var scrub = document.getElementById('scrub');
    if (scrub) scrub.addEventListener('input', function () {
      stopTimer();
      var b = document.getElementById('play');
      if (b) b.textContent = '▶';
      ui.upto = Number(scrub.value);
      drawChart(rows);
    });
    var playBtn = document.getElementById('play');
    if (playBtn) playBtn.addEventListener('click', function () {
      if (ui.timer) { stopTimer(); playBtn.textContent = '▶'; } else play(rows);
    });
    var filters = document.getElementById('filters');
    if (filters) filters.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-f]');
      if (!b) return;
      ui.rowsFilter = b.getAttribute('data-f');
      Array.prototype.forEach.call(filters.children, function (c) { c.classList.toggle('on', c === b); });
      renderRows(rows);
      bind();
    });
    var rsort = document.getElementById('rsort');
    if (rsort) rsort.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-s]');
      if (!b) return;
      ui.rivSort = b.getAttribute('data-s');
      Array.prototype.forEach.call(rsort.children, function (c) { c.classList.toggle('on', c === b); });
      renderRivs(rows);
      bind();
    });
    var rivs = document.getElementById('rivs');
    if (rivs) rivs.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-rival]')) return;
      var card = ev.target.closest('[data-riv]');
      if (!card) return;
      var id = card.getAttribute('data-riv');
      ui.openRiv[id] = !ui.openRiv[id];
      card.classList.toggle('open');
    });
    var rz = null;
    global.addEventListener('resize', function onR() {
      if (!document.getElementById('chart')) { global.removeEventListener('resize', onR); return; }
      clearTimeout(rz);
      rz = setTimeout(function () { drawChart(rows); }, 180);
    });
    bind();
  }

  /* El histórico de nivel del club viene de otra fuente (no de la liga).
     Solo existe el del primer semestre: se carga del archivo rescatado. */
  function loadClub(done) {
    if (ui.club || ui.clubLoading) { done(); return; }
    ui.clubLoading = true;
    global.fetch('legacy/club-nivel.json').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { ui.club = data || {}; ui.clubLoading = false; renderMetricsIfPresent(); done(); })
      .catch(function () { ui.club = {}; ui.clubLoading = false; done(); });
  }

  function renderMetricsIfPresent() {
    var m = PL.state.model;
    if (m && document.getElementById('metrics')) renderMetrics(mine(m));
  }

  global.PadelTemporada = {
    ui: ui, mine: mine, agg: agg, tile: tile, sectionHead: sectionHead,
    withModel: withModel, stopTimer: stopTimer, loadClub: loadClub,
    renderTemporada: renderTemporada
  };
})(window);
