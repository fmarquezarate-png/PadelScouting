/* ============================================================
   cronica.js · la crónica de la temporada, escrita sola
   Lee tus partidos (los mismos de «Nuestra temporada») y saca:
   · los actos: meses seguidos con el mismo carácter
   · el duelo: el rival al que te enfrentaste más de una vez
   · rachas, remontadas, super tie-breaks, mejor y peor mes,
     el rival más duro y la victoria que más vale
   · los niveles del club, si los has importado
   La parte personal (los golpes de cada uno) no se inventa: la
   escribes tú en la pantalla y se guarda aparte.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PadelCronica = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

  function score(r) {
    return (r.sets || []).map(function (s) { return s[0] + '–' + s[1]; }).join(' · ');
  }
  function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* Estadística de un grupo de partidos (los WO cuentan en el balance, no en juegos). */
  function stats(list) {
    var played = list.filter(function (r) { return !r.wo; });
    var s = { n: played.length, w: 0, l: 0, wo: list.length - played.length, woW: 0, woL: 0,
      stb: 0, stbW: 0, cb: 0, gf: 0, ga: 0, two: 0, bagels: 0, groups: [], months: [] };
    list.forEach(function (r) {
      if (s.months.indexOf(r.mesnom) < 0) s.months.push(r.mesnom);
      if (r.wo) { if (r.win) s.woW++; else s.woL++; return; }
      if (r.win) s.w++; else s.l++;
      if (r.stb) { s.stb++; if (r.win) s.stbW++; } else s.two++;
      if (r.win && !r.ganoS1) s.cb++;
      s.gf += r.gf; s.ga += r.ga;
      if (!r.win && r.gf <= 1) s.bagels++;
      if (r.grupo != null && s.groups.indexOf(r.grupo) < 0) s.groups.push(r.grupo);
    });
    s.W = s.w + s.woW; s.L = s.l + s.woL;
    s.gp = pct(s.gf, s.gf + s.ga);
    s.rate = s.n ? s.w / s.n : (s.woW ? 1 : 0);
    return s;
  }

  function character(s) {
    if (!s.n) return 'wo';
    if (s.stb >= 2 && s.stb / s.n >= 0.5) return s.stbW >= 0.75 * s.stb ? 'clutch' : 'filo';
    if (!s.stb && s.n >= 3) return 'limpio';
    if (s.rate >= 0.75) return 'mandar';
    if (s.rate <= 0.25 || (s.rate < 0.5 && s.gp < 40)) return 'sufrir';
    return 'competir';
  }

  var TITLES = { sufrir: 'Aprender a golpes', competir: 'Competir', clutch: 'Vivir en el tie-break',
    filo: 'Al filo', mandar: 'Mandar', limpio: 'Dejar de sufrir', wo: 'Sin jugar' };

  function actText(kind, s, list) {
    var played = list.filter(function (r) { return !r.wo; });
    var t = [];
    var bal = '<b>' + s.w + '–' + s.l + '</b>';
    if (kind === 'sufrir') {
      t.push(plural(s.n, 'partido', 'partidos') + ', ' + bal + '. Solo el ' + s.gp + '% de los juegos.');
      if (s.bagels) t.push('Hubo algún marcador de los que duelen: el peaje de llegar.');
      var diffs = played.map(function (r) { return r.gf - r.ga; });
      if (diffs.length >= 2 && diffs[diffs.length - 1] > diffs[0]) t.push('Pero cada vez por menos.');
    } else if (kind === 'competir') {
      t.push(plural(s.n, 'partido', 'partidos') + ', ' + bal + ', con el ' + s.gp + '% de los juegos.');
      if (s.stb) t.push(plural(s.stb, 'se fue', 'se fueron') + ' al super tie-break.');
    } else if (kind === 'clutch') {
      t.push('<b>' + s.stb + ' de ' + s.n + '</b> partidos decididos en el super tie-break, y ' +
        (s.stbW === s.stb ? '<b>todos ganados</b>' : '<b>' + s.stbW + ' ganados</b>') + '.');
      if (s.cb) t.push('En ' + plural(s.cb, 'de ellos', 'de ellos') + ' perdisteis el primer set y aun así ganasteis.');
    } else if (kind === 'filo') {
      var tight = played.filter(function (r) { return r.stb && !r.win; }).map(function (r) {
        var st = r.sets[2]; return st ? Math.abs(st[0] - st[1]) : 9; });
      t.push('<b>' + s.stb + '</b> super tie-breaks y ' + (s.stbW ? 'solo ' + s.stbW + ' ganado' + (s.stbW > 1 ? 's' : '') : 'ninguno ganado') + '.');
      if (tight.length && Math.min.apply(null, tight) <= 2) t.push('Alguno se escapó por un par de puntos: estabais ahí.');
    } else if (kind === 'limpio') {
      t.push(plural(s.n, 'partido', 'partidos') + ', ' + bal + ', y <b>ninguno llegó a un tercer set</b>: ' +
        'o 2–0 a favor o 2–0 en contra. ' + s.gp + '% de los juegos.');
    } else if (kind === 'mandar') {
      t.push(plural(s.n, 'partido', 'partidos') + ', ' + bal + ', con el ' + s.gp + '% de los juegos.');
      if (!s.stb && s.n >= 2) t.push('<b>Ninguno llegó al tercer set</b>.');
      else if (s.cb) t.push('Y ' + plural(s.cb, 'remontada', 'remontadas') + ' por el camino.');
    } else {
      t.push('Un mes sin partidos jugados: ' + (s.woW ? plural(s.woW, 'WO a favor', 'WO a favor') : plural(s.woL, 'WO en contra', 'WO en contra')) + '.');
    }
    if (s.wo && kind !== 'wo') t.push('Además, ' + (s.woW ? plural(s.woW, 'WO a favor', 'WO a favor') : '') +
      (s.woW && s.woL ? ' y ' : '') + (s.woL ? plural(s.woL, 'WO en contra', 'WO en contra') : '') + '.');
    return t.join(' ');
  }

  /* Meses → actos: se juntan meses seguidos del mismo carácter; si salen
     más de tres, el acto más corto se une al vecino que más se le parece. */
  function acts(rows) {
    var byMes = {}, order = [];
    rows.forEach(function (r) {
      if (!byMes[r.mes]) { byMes[r.mes] = []; order.push(r.mes); }
      byMes[r.mes].push(r);
    });
    order.sort(function (a, b) { return a - b; });
    var segs = order.map(function (m) { var s = stats(byMes[m]); return { list: byMes[m].slice(), s: s, k: character(s) }; });
    function join(i, j) {
      var a = segs[i], b = segs[j];
      var list = a.list.concat(b.list).sort(function (x, y) { return x.mes - y.mes; }), s = stats(list);
      segs.splice(Math.min(i, j), 2, { list: list, s: s, k: character(s) });
    }
    /* Los meses solo de WO van con el de al lado. */
    for (var i = 0; i < segs.length && segs.length > 1; i++) {
      if (segs[i].k === 'wo') { join(i, i > 0 ? i - 1 : i + 1); i = -1; }
    }
    for (i = 1; i < segs.length; i++) {
      if (segs[i].k === segs[i - 1].k) { join(i - 1, i); i = 0; }
    }
    /* Se unen los dos tramos seguidos que más se parecen (juegos y balance). */
    function gap(a, b) {
      return (Math.abs(a.s.gp - b.s.gp) / 100 + Math.abs(a.s.rate - b.s.rate) / 2) * Math.min(a.list.length, b.list.length);
    }
    while (segs.length > 3) {
      var best = 0;
      for (var k = 1; k < segs.length - 1; k++) if (gap(segs[k], segs[k + 1]) < gap(segs[best], segs[best + 1])) best = k;
      join(best, best + 1);
    }
    /* Una temporada entera de un solo carácter se cuenta en tres tramos. */
    if (segs.length === 1 && order.length >= 3) {
      var all = segs[0].list, cut1 = Math.round(order.length / 3), cut2 = Math.round(2 * order.length / 3);
      segs = [order.slice(0, cut1), order.slice(cut1, cut2), order.slice(cut2)].map(function (ms) {
        var list = all.filter(function (r) { return ms.indexOf(r.mes) >= 0; }), s = stats(list);
        return { list: list, s: s, k: character(s) };
      });
    }
    return segs.map(function (sg, k) {
      var extra = '';
      if (k === segs.length - 1) {
        var lastPlayed = sg.list.filter(function (r) { return !r.wo; }).pop();
        if (lastPlayed && lastPlayed.win) extra = ' Y se cerró ganando, ante ' + lastPlayed.rival + '.';
      }
      var ms = sg.s.months;
      var when = ms.length > 1 ? ms[0] + ' → ' + ms[ms.length - 1] : ms[0];
      var groups = sg.s.groups;
      return {
        ph: 'Acto ' + (ROMAN[k] || k + 1) + ' · ' + when, title: TITLES[sg.k], kind: sg.k,
        dates: (groups.length ? (groups.length > 1 ? 'Grupos ' : 'Grupo ') + groups.join(', ') + ' · ' : '') +
          sg.s.W + '–' + sg.s.L,
        text: actText(sg.k, sg.s, sg.list) + extra
      };
    });
  }

  /* El duelo: el rival repetido con el giro más grande entre partidos. */
  function duel(rows) {
    var by = {};
    rows.forEach(function (r) { if (!r.wo) (by[r.rivalId] = by[r.rivalId] || []).push(r); });
    var best = null;
    Object.keys(by).forEach(function (id) {
      var l = by[id];
      if (l.length < 2) return;
      var mixed = l.some(function (r) { return r.win; }) && l.some(function (r) { return !r.win; });
      var swing = Math.abs((l[l.length - 1].gf - l[l.length - 1].ga) - (l[0].gf - l[0].ga));
      var val = (mixed ? 100 : 0) + swing;
      if (!best || val > best.val) best = { val: val, list: l };
    });
    if (!best) return null;
    var l = best.list, a = l[0], b = l[l.length - 1];
    function card(r, i) {
      var txt;
      if (i === 0) {
        txt = r.win ? (r.stb ? 'Ganado, pero al límite del super tie-break.' : 'El primer asalto fue vuestro.')
          : (r.stb ? 'Se escapó en el super tie-break, ' + score({ sets: [r.sets[2]] }) + '.' : 'El primer asalto fue suyo.');
      } else if (r.win && !a.win) {
        txt = 'La revancha. ' + (r.ganoS1 ? 'Sin dudas desde el primer set.' : 'Perdiendo el primer set y remontando.');
      } else if (!r.win && a.win) {
        txt = 'Esta vez se lo llevaron ellos: aprendieron del primero.';
      } else {
        txt = r.win ? 'Otra vez vuestro: ' + (r.gf - r.ga) + ' juegos de diferencia.' : 'Otra vez suyo.';
      }
      return { when: r.mesnom + (r.grupo != null ? ' · Grupo ' + r.grupo : ''), score: score(r), text: txt,
        hot: !!r.stb, win: r.win };
    }
    var foot = null;
    if (b.lad) foot = 'Acabaron ' + b.lad + '.º de ' + (b.ladTot || '?') + ' en la liga.';
    return { rival: a.rival, cards: l.map(card), dek: plural(l.length, 'partido', 'partidos') + ' contra la misma pareja' +
      (l.length === 2 ? ', separados por ' + (b.mes - a.mes) + (b.mes - a.mes === 1 ? ' mes.' : ' meses.') : '.'), foot: foot };
  }

  function streaks(rows) {
    var bw = 0, bl = 0, cw = 0, cl = 0;
    rows.forEach(function (r) {
      if (r.win) { cw++; cl = 0; } else { cl++; cw = 0; }
      if (cw > bw) bw = cw; if (cl > bl) bl = cl;
    });
    return { win: bw, loss: bl };
  }

  function highlights(rows) {
    var played = rows.filter(function (r) { return !r.wo; });
    var out = [];
    if (!played.length) return out;
    var st = streaks(rows);
    out.push({ k: 'Mejor racha', v: st.win ? plural(st.win, 'victoria', 'victorias') + ' seguidas' : 'Sin victorias',
      sub: st.loss > 1 ? 'La peor: ' + st.loss + ' derrotas seguidas' : '' });
    var cb = played.filter(function (r) { return r.win && !r.ganoS1; });
    out.push({ k: 'Remontadas', v: String(cb.length), sub: cb.length ? 'Tras perder el primer set: ' + cb.map(function (r) { return r.mesnom; }).join(', ') : 'Ninguna tras perder el primer set' });
    var tb = played.filter(function (r) { return r.stb; });
    if (tb.length) {
      var tbw = tb.filter(function (r) { return r.win; }).length;
      var tight = tb.slice().sort(function (a, b) {
        return Math.abs(a.sets[2][0] - a.sets[2][1]) - Math.abs(b.sets[2][0] - b.sets[2][1]); })[0];
      out.push({ k: 'Super tie-breaks', v: tbw + '–' + (tb.length - tbw),
        sub: 'El más apretado: ' + tight.sets[2][0] + '–' + tight.sets[2][1] + ' ' + (tight.win ? 'a favor' : 'en contra') + ' (' + tight.mesnom + ')' });
    }
    /* Mejor y peor mes. */
    var byMes = {};
    played.forEach(function (r) { (byMes[r.mes] = byMes[r.mes] || []).push(r); });
    var months = Object.keys(byMes).map(function (m) { var s = stats(byMes[m]); s.nom = byMes[m][0].mesnom; return s; });
    if (months.length >= 2) {
      months.sort(function (a, b) { return b.rate - a.rate || b.gp - a.gp; });
      var top = months[0], low = months[months.length - 1];
      out.push({ k: 'Mejor mes', v: top.nom, sub: top.w + '–' + top.l + ' · ' + top.gp + '% de juegos' });
      out.push({ k: 'Mes más duro', v: low.nom, sub: low.w + '–' + low.l + ' · ' + low.gp + '% de juegos' });
    }
    var losses = played.filter(function (r) { return !r.win; });
    if (losses.length) {
      var hard = losses.slice().sort(function (a, b) { return (b.ga - b.gf) - (a.ga - a.gf); })[0];
      out.push({ k: 'El rival más duro', v: hard.rival, sub: score(hard) + ' · ' + hard.mesnom });
    }
    var wins = played.filter(function (r) { return r.win && r.lad; });
    if (wins.length) {
      var gold = wins.slice().sort(function (a, b) { return a.lad - b.lad; })[0];
      out.push({ k: 'La victoria que más vale', v: gold.rival, sub: score(gold) + ' · acabaron ' + gold.lad + '.º de la liga' });
    }
    return out;
  }

  /* Niveles del club: cada uno puntúa por separado. Sin distinguir liga. */
  function levels(club) {
    if (!club || !club.fran || club.fran.length < 2) return null;
    var f = club.fran, c = club.cris || [];
    var out = { me: { name: club.meName, from: f[0].nivel, to: f[f.length - 1].nivel, n: f.length, first: f[0].fecha } };
    if (c.length >= 2) out.partner = { name: club.partnerName, from: c[0].nivel, to: c[c.length - 1].nivel, n: c.length, first: c[0].fecha };
    return out;
  }

  function build(rows, club) {
    rows = rows || [];
    var all = stats(rows);
    return {
      summary: all, acts: acts(rows), duel: duel(rows), highlights: highlights(rows), levels: levels(club)
    };
  }

  return { build: build, stats: stats, acts: acts, duel: duel, highlights: highlights, levels: levels };
});
