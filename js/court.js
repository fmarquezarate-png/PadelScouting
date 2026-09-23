/* ============================================================
   court.js · la pista es el menú
   Una pista de pádel real (10 × 20 m, cristales de 3 m, red de
   0,88 m) proyectada con una cámara en perspectiva. En pantalla
   ancha la cámara mira desde detrás del fondo; en el móvil sube
   para que la pista quede en vertical. Cada zona es una sección.
   ============================================================ */
(function (global) {
  'use strict';

  /* Iconos de trazo (24 × 24). Se usan en la pista y en el menú. */
  var ICONS = {
    inicio: '<path d="M4 11.5 12 4.5l8 7M6.5 9.8V19.5h11V9.8M10 19.5v-5h4v5"/>',
    temporada: '<rect x="4.5" y="5.5" width="15" height="14" rx="1.5"/><path d="M4.5 9.5h15M8.5 3.5v4M15.5 3.5v4M8 13h2M12 13h2M8 16h2"/>',
    rival: '<ellipse cx="8.2" cy="8.2" rx="3.6" ry="4.4" transform="rotate(-45 8.2 8.2)"/><ellipse cx="15.8" cy="8.2" rx="3.6" ry="4.4" transform="rotate(45 15.8 8.2)"/><path d="M10.9 10.9 18.8 18.8M13.1 10.9 5.2 18.8"/>',
    liga: '<path d="M8 4.5h8v4.8a4 4 0 0 1-8 0zM8 6.3H5.2a3 3 0 0 0 3 3.6M16 6.3h2.8a3 3 0 0 1-3 3.6M12 13.3v3.2M9 19.5h6M10 16.5h4v3h-4z"/>',
    cronica: '<path d="M7 3.5h7l4 4v13H7zM14 3.5v4h4M9.8 11h5.4M9.8 14h5.4M9.8 17h3.4"/>',
    registro: '<path d="M5 19.5l1-4.2L15.8 5.5l3.2 3.2L9.2 18.5zM13.8 7.5l3.2 3.2"/>',
    historial: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.9h3.9M12 8v4.3l3 1.9"/>',
    analisis: '<path d="M5.5 19.5v-6M10 19.5v-11M14.5 19.5v-8M19 19.5v-14M3.5 19.5h17"/>',
    config: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
    perfil: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"/>'
  };

  function icon(name, extra) {
    return '<svg class="ico' + (extra ? ' ' + extra : '') + '" viewBox="0 0 24 24" aria-hidden="true">' +
      (ICONS[name] || '') + '</svg>';
  }

  /* ---------- cámara ---------- */
  var CAMS = {
    wide: { W: 1000, H: 600, y: 17.5, z: -20, pitch: 33, margin: 16 },
    tall: { W: 400, H: 600, y: 27, z: -8, pitch: 60, margin: 10 }
  };

  function camera(mode) {
    var c = CAMS[mode];
    var p = c.pitch * Math.PI / 180;
    var cam = { mode: mode, W: c.W, H: c.H, y: c.y, z: c.z, sp: Math.sin(p), cp: Math.cos(p), s: 1, ox: 0, oy: 0 };
    /* Encaja la escena en el lienzo: pista, cristales, focos y la puerta. */
    var pts = [];
    [-5, 5].forEach(function (x) {
      [0, 20].forEach(function (z) { pts.push([x, 0, z], [x, 4, z]); });
    });
    /* La puerta y el rótulo de «El rival» también tienen que caber. */
    pts.push([0, 0, mode === 'tall' ? -4.2 : -3.6]);
    var raw = pts.map(function (q) { return rawProj(cam, q[0], q[1], q[2]); });
    var minX = Math.min.apply(null, raw.map(function (r) { return r[0]; }));
    var maxX = Math.max.apply(null, raw.map(function (r) { return r[0]; }));
    var minY = Math.min.apply(null, raw.map(function (r) { return r[1]; }));
    var maxY = Math.max.apply(null, raw.map(function (r) { return r[1]; }));
    var m = c.margin;
    cam.s = Math.min((c.W - 2 * m) / (maxX - minX), (c.H - 2 * m) / (maxY - minY));
    cam.ox = (c.W - (maxX - minX) * cam.s) / 2 - minX * cam.s;
    cam.oy = (c.H - (maxY - minY) * cam.s) / 2 - minY * cam.s;
    return cam;
  }

  function rawProj(cam, X, Y, Z) {
    var y = Y - cam.y, z = Z - cam.z;
    var depth = -y * cam.sp + z * cam.cp;
    var up = y * cam.cp + z * cam.sp;
    return [X / depth, -up / depth, depth];
  }

  function P(cam, X, Y, Z) {
    var r = rawProj(cam, X, Y, Z);
    return [r[0] * cam.s + cam.ox, r[1] * cam.s + cam.oy, r[2]];
  }

  function f(n) { return Math.round(n * 10) / 10; }

  function poly(cam, pts, attrs) {
    return '<polygon points="' + pts.map(function (q) {
      var p = P(cam, q[0], q[1], q[2]); return f(p[0]) + ',' + f(p[1]);
    }).join(' ') + '" ' + (attrs || '') + '/>';
  }

  function line(cam, a, b, attrs) {
    var p = P(cam, a[0], a[1], a[2]), q = P(cam, b[0], b[1], b[2]);
    return '<line x1="' + f(p[0]) + '" y1="' + f(p[1]) + '" x2="' + f(q[0]) + '" y2="' + f(q[1]) + '" ' + (attrs || '') + '/>';
  }

  /* Círculo sobre el suelo (charco de luz), aproximado con 28 lados. */
  function floorEllipse(cam, cx, cz, r, attrs) {
    var pts = [];
    for (var i = 0; i < 28; i++) {
      var a = i / 28 * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r]);
    }
    return poly(cam, pts, attrs);
  }

  /* ---------- zonas ---------- */
  var COLS = [[-5, -5 / 3], [-5 / 3, 5 / 3], [5 / 3, 5]];
  var ZONES = [
    { id: 'cronica', view: 'cronica', col: 0, far: true, title: 'Crónica' },
    { id: 'analisis', view: 'analisis', col: 1, far: true, title: 'Análisis' },
    { id: 'registro', view: 'registro', col: 2, far: true, title: 'Registrar' },
    { id: 'liga', view: 'liga', col: 0, far: false, title: 'La liga' },
    { id: 'historial', view: 'historial', col: 1, far: false, title: 'Historial' },
    { id: 'temporada', view: 'temporada', col: 2, far: false, title: 'Nuestra temporada' }
  ];

  function zoneQuad(z) {
    var c = COLS[z.col];
    var z0 = z.far ? 10.35 : 0.25, z1 = z.far ? 19.75 : 9.65;
    return [[c[0] + 0.12, 0, z0], [c[1] - 0.12, 0, z0], [c[1] - 0.12, 0, z1], [c[0] + 0.12, 0, z1]];
  }

  function zoneCenter(z) {
    var c = COLS[z.col];
    return [(c[0] + c[1]) / 2, 0, z.far ? 15.6 : 5.6];
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Título en dos líneas si no cabe («Nuestra temporada»). */
  function titleText(x, y, title, size, cls) {
    var words = String(title).toUpperCase().split(' ');
    if (words.length > 1 && title.length > 11) {
      return '<text class="' + cls + '" x="' + f(x) + '" y="' + f(y - size * 0.55) + '" font-size="' + size + '">' +
        esc(words[0]) + '</text><text class="' + cls + '" x="' + f(x) + '" y="' + f(y + size * 0.55) +
        '" font-size="' + size + '">' + esc(words.slice(1).join(' ')) + '</text>';
    }
    return '<text class="' + cls + '" x="' + f(x) + '" y="' + f(y) + '" font-size="' + size + '">' + esc(title.toUpperCase()) + '</text>';
  }

  function badge(cam, name, x, y, r) {
    return '<circle class="zb" cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r) + '"/>' +
      '<g class="zi" transform="translate(' + f(x - r * 0.55) + ' ' + f(y - r * 0.55) + ') scale(' + (r * 1.1 / 24).toFixed(3) + ')">' +
      ICONS[name] + '</g>';
  }

  /* ---------- la escena ---------- */
  function svg(mode, live) {
    var cam = camera(mode);
    var tall = mode === 'tall';
    var W = cam.W, H = cam.H;
    var h = [];

    h.push('<svg class="court court-3d ' + mode + '" viewBox="0 0 ' + W + ' ' + H + '" role="group" ' +
      'aria-label="La pista: cada zona abre una parte de la app">');
    h.push('<defs>' +
      '<linearGradient id="cSurf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#173e70"/>' +
      '<stop offset=".55" stop-color="#1d4f8c"/><stop offset="1" stop-color="#1a4679"/></linearGradient>' +
      '<radialGradient id="cPool" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff3d6" stop-opacity=".22"/>' +
      '<stop offset="1" stop-color="#fff3d6" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="cLamp" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff8e6"/>' +
      '<stop offset=".25" stop-color="#ffd9a0" stop-opacity=".75"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="cBall" cx="35%" cy="35%" r="70%"><stop offset="0" stop-color="#FFE2B8"/>' +
      '<stop offset="1" stop-color="#ED6C05"/></radialGradient>' +
      '<radialGradient id="cGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ED6C05" stop-opacity=".35"/>' +
      '<stop offset="1" stop-color="#ED6C05" stop-opacity="0"/></radialGradient>' +
      '<pattern id="cMesh" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<path d="M0 0H7M0 0V7" stroke="#cfd8e3" stroke-opacity=".20" stroke-width=".8"/></pattern>' +
      '<pattern id="cNet" width="4" height="4" patternUnits="userSpaceOnUse">' +
      '<path d="M0 0H4M0 0V4" stroke="#e8edf3" stroke-opacity=".35" stroke-width=".6"/></pattern>' +
      '</defs>');

    /* suelo del club y setos */
    h.push(poly(cam, [[-11, 0, -4], [11, 0, -4], [11, 0, 24], [-11, 0, 24]], 'class="c-ground"'));
    [[-6.2, -0.6], [6.2, -0.6], [-6.2, 20.6], [6.2, 20.6]].forEach(function (l) {
      h.push(floorEllipse(cam, l[0] * 0.8, l[1] < 10 ? 2.2 : 17.8, 4.6, 'fill="url(#cPool)"'));
    });

    /* pared del fondo (lejana): cristal + malla, con la lona del club */
    h.push(poly(cam, [[-5, 3, 20], [5, 3, 20], [5, 4, 20], [-5, 4, 20]], 'class="c-mesh" fill="url(#cMesh)"'));
    h.push(poly(cam, [[-5, 0, 20], [5, 0, 20], [5, 3, 20], [-5, 3, 20]], 'class="c-glass far"'));
    var b0 = P(cam, -2.1, 2.55, 20), b1 = P(cam, 2.1, 1.35, 20);
    var bw = b1[0] - b0[0], bh = b1[1] - b0[1];
    var banner = ('<g class="c-banner"><rect x="' + f(b0[0]) + '" y="' + f(b0[1]) + '" width="' + f(bw) + '" height="' + f(bh) + '" rx="2"/>' +
      '<image href="assets/logo.png" x="' + f(b0[0] + bh * 0.12) + '" y="' + f(b0[1] + bh * 0.1) + '" width="' + f(bh * 0.8) + '" height="' + f(bh * 0.8) + '"/>' +
      '<text x="' + f(b0[0] + bh * 1.05) + '" y="' + f(b0[1] + bh * 0.42) + '" font-size="' + f(bh * 0.2) + '" class="c-banner-s">CLUB TENNIS</text>' +
      '<text x="' + f(b0[0] + bh * 1.05) + '" y="' + f(b0[1] + bh * 0.78) + '" font-size="' + f(bh * 0.34) + '" class="c-banner-t">EL MOLÍ</text></g>');

    /* paredes laterales: cristal en los extremos, malla en el centro */
    [-5, 5].forEach(function (x) {
      h.push(poly(cam, [[x, 0, 4], [x, 0, 16], [x, 3, 16], [x, 3, 4]], 'class="c-mesh" fill="url(#cMesh)"'));
      h.push(poly(cam, [[x, 0, 16], [x, 0, 20], [x, 3, 20], [x, 3, 16]], 'class="c-glass"'));
      h.push(poly(cam, [[x, 0, 0], [x, 0, 4], [x, 3, 4], [x, 3, 0]], 'class="c-glass near"'));
      h.push(poly(cam, [[x, 3, 16], [x, 3, 20], [x, 4, 20]], 'class="c-mesh" fill="url(#cMesh)"'));
    });

    /* la pista */
    h.push(poly(cam, [[-5, 0, 0], [5, 0, 0], [5, 0, 20], [-5, 0, 20]], 'fill="url(#cSurf)" class="c-surf"'));
    [[-2.5, 5], [2.5, 5], [-2.5, 15], [2.5, 15]].forEach(function (q) {
      h.push(floorEllipse(cam, q[0], q[1], 3.2, 'fill="url(#cPool)" class="c-pool"'));
    });
    var L = 'class="c-line"';
    h.push(line(cam, [-5, 0, 3.05], [5, 0, 3.05], L));
    h.push(line(cam, [-5, 0, 16.95], [5, 0, 16.95], L));
    h.push(line(cam, [0, 0, 3.05], [0, 0, 16.95], L));
    h.push(line(cam, [0, 0, 16.95], [0, 0, 17.15], L));
    h.push(line(cam, [0, 0, 3.05], [0, 0, 2.85], L));
    h.push(poly(cam, [[-5, 0, 0], [5, 0, 0], [5, 0, 20], [-5, 0, 20]], 'class="c-edge"'));

    /* postes de la estructura */
    for (var z = 0; z <= 20; z += 2) {
      [-5, 5].forEach(function (x) {
        h.push(line(cam, [x, 0, z], [x, (z >= 16 || z <= 4) ? 3 : 3, z], 'class="c-post"'));
      });
    }
    [-5, -2.5, 0, 2.5, 5].forEach(function (x) { h.push(line(cam, [x, 0, 20], [x, 4, 20], 'class="c-post"')); });
    h.push(line(cam, [-5, 4, 20], [5, 4, 20], 'class="c-post"'));
    [-5, 5].forEach(function (x) {
      h.push(line(cam, [x, 3, 0], [x, 3, 20], 'class="c-rail"'));
    });
    h.push(banner);

    /* zonas: la mitad lejana primero, la red en medio, la cercana después */
    function zoneSvg(zn) {
      var q = zoneQuad(zn), c = zoneCenter(zn), p = P(cam, c[0], c[1], c[2]);
      /* Todo se dimensiona con el ancho real de la zona en pantalla. */
      var col = COLS[zn.col];
      var zw = P(cam, col[1], 0, c[2])[0] - P(cam, col[0], 0, c[2])[0];
      var two = zn.title.length > 11;
      var longest = two ? Math.max.apply(null, zn.title.split(' ').map(function (w) { return w.length; })) : zn.title.length;
      var sub = String(live[zn.id] || '');
      var r = Math.min(tall ? 18 : 26, zw * 0.2);
      var ts = Math.min(tall ? 12.5 : 18, zw * 0.84 / (longest * 0.72));
      var ss = Math.min(ts * 0.66, zw * 0.88 / (Math.max(sub.length, 1) * 0.66));
      var ty = p[1] + r + ts * (two ? 1.35 : 1.05);
      var sy = ty + ts * (two ? 1.55 : 1.15);
      return '<g class="zone" data-zone="' + zn.id + '" data-view="' + zn.view + '" tabindex="0" role="button" ' +
        'aria-label="' + esc(zn.title) + (live[zn.id] ? ' · ' + esc(live[zn.id]) : '') + '" ' +
        'data-cx="' + c[0] + '" data-cz="' + c[2] + '">' +
        poly(cam, q, 'class="zone-hit"') +
        badge(cam, zn.id, p[0], p[1] - (tall ? 6 : 10), r) +
        titleText(p[0], ty - (tall ? 6 : 10), zn.title, ts, 'zt') +
        '<text class="zs" x="' + f(p[0]) + '" y="' + f(sy - (tall ? 6 : 10)) + '" font-size="' + f(ss) + '">' +
        esc((live[zn.id] || '').toUpperCase()) + '</text>' +
        '<circle class="zdot" cx="' + f(p[0]) + '" cy="' + f(sy - (tall ? 6 : 10) + ts * 0.9) + '" r="' + (tall ? 2 : 2.6) + '"/>' +
        '</g>';
    }
    ZONES.filter(function (zn) { return zn.far; }).forEach(function (zn) { h.push(zoneSvg(zn)); });

    /* la red */
    h.push(poly(cam, [[-5.05, 0, 10], [5.05, 0, 10], [5.05, 0.88, 10], [-5.05, 0.88, 10]], 'fill="url(#cNet)" class="c-net"'));
    h.push(line(cam, [-5.05, 0.9, 10], [5.05, 0.9, 10], 'class="c-tape"'));
    [-5.05, 5.05].forEach(function (x) { h.push(line(cam, [x, 0, 10], [x, 0.95, 10], 'class="c-netpost"')); });

    /* pared cercana: solo el marco, con la puerta abierta en el centro.
       Va debajo de los rótulos para que el cristal no los tache. */
    [-5, -3, 3, 5].forEach(function (x) { h.push(line(cam, [x, 0, 0], [x, 3, 0], 'class="c-post near"')); });
    h.push(line(cam, [-5, 3, 0], [-1.1, 3, 0], 'class="c-rail near"'));
    h.push(line(cam, [1.1, 3, 0], [5, 3, 0], 'class="c-rail near"'));
    h.push(poly(cam, [[-5, 0, 0], [-1.1, 0, 0], [-1.1, 2.2, 0], [-5, 2.2, 0]], 'class="c-glass front"'));
    h.push(poly(cam, [[1.1, 0, 0], [5, 0, 0], [5, 2.2, 0], [1.1, 2.2, 0]], 'class="c-glass front"'));

    ZONES.filter(function (zn) { return !zn.far; }).forEach(function (zn) { h.push(zoneSvg(zn)); });

    /* la sombra y la pelota */
    var b = P(cam, 0, 0, 1.5);
    h.push('<ellipse id="ballShadow" class="c-shadow" cx="' + f(b[0]) + '" cy="' + f(b[1]) + '" rx="6" ry="2.4"/>');
    h.push('<circle id="ball" class="ball" cx="' + f(b[0]) + '" cy="' + f(b[1]) + '" r="' + (tall ? 5 : 6.5) + '" fill="url(#cBall)"/>');

    /* focos */
    [[-6.2, -0.6], [6.2, -0.6], [-6.2, 20.6], [6.2, 20.6]].forEach(function (l) {
      h.push(line(cam, [l[0], 0, l[1]], [l[0], 6.4, l[1]], 'class="c-pole"'));
      var head = P(cam, l[0] * 0.93, 6.4, l[1]);
      var gr = tall ? 22 : 34;
      h.push('<circle cx="' + f(head[0]) + '" cy="' + f(head[1]) + '" r="' + gr + '" fill="url(#cLamp)" class="c-lamp"/>');
    });

    /* la puerta: el rival te espera fuera de la pista */
    var d = P(cam, 0, 0, -1.5);
    var dr = tall ? 19 : 26, dts = tall ? 12.5 : 17;
    h.push('<circle cx="' + f(d[0]) + '" cy="' + f(d[1]) + '" r="' + (dr * 2.4) + '" fill="url(#cGlow)" class="c-doorglow"/>');
    h.push('<g class="zone door" data-zone="rival" data-view="rival" tabindex="0" role="button" ' +
      'aria-label="El rival · busca y compara" data-cx="0" data-cz="-1.5">' +
      '<rect class="zone-hit" x="' + f(d[0] - dr * 3.2) + '" y="' + f(d[1] - dr * 1.4) + '" width="' + f(dr * 6.4) + '" height="' + f(dr * 3.9) + '" rx="10"/>' +
      badge(cam, 'rival', d[0], d[1] - dr * 0.1, dr) +
      '<text class="zt" x="' + f(d[0]) + '" y="' + f(d[1] + dr + dts * 1.1) + '" font-size="' + dts + '">EL RIVAL</text>' +
      '<text class="zs" x="' + f(d[0]) + '" y="' + f(d[1] + dr + dts * 2.2) + '" font-size="' + f(dts * 0.66) + '">BUSCA Y COMPARA</text>' +
      '</g>');

    h.push('</svg>');
    return { html: h.join(''), cam: cam };
  }

  /* ---------- movimiento ---------- */
  var current = null;   /* { cam, pos:[x,z] } */

  function reduceMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function placeBall(x, y, z) {
    var ball = document.getElementById('ball'), sh = document.getElementById('ballShadow');
    if (!ball || !current) return false;
    var p = P(current.cam, x, y, z), s = P(current.cam, x, 0, z);
    ball.setAttribute('cx', f(p[0])); ball.setAttribute('cy', f(p[1]));
    sh.setAttribute('cx', f(s[0])); sh.setAttribute('cy', f(s[1]));
    sh.setAttribute('opacity', String(Math.max(0.15, 0.55 - y * 0.08)));
    current.pos = [x, z];
    return true;
  }

  /* Un golpe: de donde está la pelota a (x, z) con una parábola. */
  function shot(x, z, dur, height, done) {
    if (!current) { done && done(); return; }
    var from = current.pos.slice(), t0 = null;
    function step(ts) {
      if (!document.getElementById('ball')) return;
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur);
      var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      placeBall(from[0] + (x - from[0]) * e, 0.25 + Math.sin(Math.PI * k) * height, from[1] + (z - from[1]) * e);
      if (k < 1) global.requestAnimationFrame(step); else if (done) done();
    }
    global.requestAnimationFrame(step);
  }

  function rally() {
    if (reduceMotion()) return;
    var pts = [[-2.6, 17.5], [2.8, 4], [-1.5, 15.5], [0.5, 6.5]], i = 0;
    (function next() {
      if (i >= pts.length || !document.getElementById('ball')) return;
      var p = pts[i++];
      shot(p[0], p[1], 620, 2.6, next);
    })();
  }

  function bind(root, go) {
    Array.prototype.forEach.call(root.querySelectorAll('.court .zone'), function (g) {
      function activate() {
        var target = g.getAttribute('data-view');
        g.classList.add('hit');
        if (reduceMotion() || !current) { go(target); return; }
        shot(Number(g.getAttribute('data-cx')), Number(g.getAttribute('data-cz')), 380, 1.8,
          function () { go(target); });
      }
      g.addEventListener('click', activate);
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activate(); }
      });
    });
    setTimeout(rally, 300);
  }

  /* Pinta la pista en `host` y la redibuja si cambia la orientación. */
  function mount(host, live, go) {
    var mode = null;
    function draw() {
      var next = host.clientWidth >= 700 && global.innerWidth > global.innerHeight * 0.9 ? 'wide' : 'tall';
      if (next === mode && host.firstChild) return;
      mode = next;
      var out = svg(mode, live);
      host.innerHTML = out.html;
      current = { cam: out.cam, pos: [0, 1.5] };
      placeBall(0, 0.25, 1.5);
      bind(host, go);
    }
    draw();
    var rz = null;
    function onResize() {
      if (!document.body.contains(host)) { global.removeEventListener('resize', onResize); return; }
      clearTimeout(rz); rz = setTimeout(draw, 150);
    }
    global.addEventListener('resize', onResize);
  }

  global.PadelCourt = { mount: mount, svg: svg, ICONS: ICONS, icon: icon };
})(window);
