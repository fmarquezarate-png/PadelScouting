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
    perfil: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"/>',
    estemes: '<rect x="4.5" y="5.5" width="15" height="14" rx="1.5"/><path d="M4.5 9.5h15M8.5 3.5v4M15.5 3.5v4M9 14.5l2 2 4-4"/>'
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
    pts.push([0, 0, -4.6]);
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
    if (cam.photo) {
      var g = cam.hp(X, Z);
      if (!Y) return [g[0], g[1], 1];
      /* La foto no tiene cámara conocida: la altura se aproxima con la escala local del suelo. */
      var a = cam.hp(X - 0.5, Z), b = cam.hp(X + 0.5, Z);
      return [g[0], g[1] - Y * Math.abs(b[0] - a[0]) * 0.9, 1];
    }
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

  function zoneCenter(z, cam) {
    var c = COLS[z.col];
    var fz = (cam && cam.farZ) || 15.6, nz = (cam && cam.nearZ) || 5.6;
    return [(c[0] + c[1]) / 2, 0, z.far ? fz : nz];
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

  function badge(cam, name, x, y, r) {  /* cam no se usa: el círculo ya viene en píxeles */
    return '<circle class="zb" cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r) + '"/>' +
      '<g class="zi" transform="translate(' + f(x - r * 0.55) + ' ' + f(y - r * 0.55) + ') scale(' + (r * 1.1 / 24).toFixed(3) + ')">' +
      ICONS[name] + '</g>';
  }


  /* Un botón de zona: círculo con icono, título, dato vivo y punto de luz.
     k escala todo (1 en la pista dibujada; más en la foto, que tiene más píxeles). */
  function zoneMarkup(cam, zn, live, tall, k) {
    if (zn.far && cam.farK) k *= cam.farK;
    var q = zoneQuad(zn), c = zoneCenter(zn, cam), p = P(cam, c[0], c[1], c[2]);
    /* Todo se dimensiona con el ancho real de la zona en pantalla. */
    var col = COLS[zn.col];
    var zw = P(cam, col[1], 0, c[2])[0] - P(cam, col[0], 0, c[2])[0];
    var two = zn.title.length > 11;
    var longest = two ? Math.max.apply(null, zn.title.split(' ').map(function (w) { return w.length; })) : zn.title.length;
    var sub = String(live[zn.id] || '');
    /* Botones grandes: el círculo ocupa casi un tercio del ancho de la zona. */
    var r = Math.min((tall ? 25 : 36) * k, zw * 0.28);
    var ts = Math.min((tall ? 14 : 21) * k, zw * 0.8 / (longest * 0.72));
    var ss = Math.min(ts * 0.66, zw * 0.88 / (Math.max(sub.length, 1) * 0.66));
    var off = (tall ? 6 : 10) * k;
    /* Si la foto se recorta por los lados, el botón y su rótulo no se acercan al borde. */
    var px = p[0];
    if (cam.safeX) {
      var hw = Math.max(longest * 0.72 * ts, sub.length * 0.66 * ss) / 2 + 6 * k;
      px = Math.max(cam.safeX[0] + hw, Math.min(cam.safeX[1] - hw, px));
    }
    p = [px, p[1] - r * 0.55, p[2]];
    var ty = p[1] + r + ts * (two ? 1.35 : 1.05);
    var sy = ty + ts * (two ? 1.55 : 1.15);
    return '<g class="zone" data-zone="' + zn.id + '" data-view="' + zn.view + '" tabindex="0" role="button" ' +
      'aria-label="' + esc(zn.title) + (live[zn.id] ? ' · ' + esc(live[zn.id]) : '') + '" ' +
      'data-cx="' + c[0] + '" data-cz="' + c[2] + '">' +
      poly(cam, q, 'class="zone-hit"') +
      badge(cam, zn.id, p[0], p[1] - off, r) +
      titleText(p[0], ty - off, zn.title, ts, 'zt') +
      '<text class="zs" x="' + f(p[0]) + '" y="' + f(sy - off) + '" font-size="' + f(ss) + '">' +
      esc((live[zn.id] || '').toUpperCase()) + '</text>' +
      '<circle class="zdot" cx="' + f(p[0]) + '" cy="' + f(sy - off + ts * 0.9) + '" r="' + f((tall ? 2 : 2.6) * k) + '"/>' +
      '</g>';
  }

  /* «El rival» en la puerta: (x, y) es el centro del botón; ly, dónde empieza el rótulo. */
  function doorMarkup(x, y, dr, dts, ly) {
    var top = Math.max(y + dr, ly);
    return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(dr * 2.4) + '" fill="url(#cGlow)" class="c-doorglow"/>' +
      '<g class="zone door" data-zone="rival" data-view="rival" tabindex="0" role="button" ' +
      'aria-label="El rival · busca y compara" data-cx="0" data-cz="-1.5">' +
      '<rect class="zone-hit" x="' + f(x - dr * 3.2) + '" y="' + f(y - dr * 1.4) + '" width="' + f(dr * 6.4) + '" height="' +
      f(top - y + dr * 1.4 + dts * 2.6) + '" rx="10"/>' +
      badge(null, 'rival', x, y - dr * 0.1, dr) +
      '<text class="zt" x="' + f(x) + '" y="' + f(top + dts * 1.1) + '" font-size="' + f(dts) + '">EL RIVAL</text>' +
      '<text class="zs" x="' + f(x) + '" y="' + f(top + dts * 2.2) + '" font-size="' + f(dts * 0.66) + '">BUSCA Y COMPARA</text>' +
      '</g>';
  }

  /* La pelota de pádel (foto recortada) y su sombra. La posición, el tamaño y
     el giro los pone el movimiento; aquí solo nace escondida en el origen. */
  function ballMarkup() {
    return '<ellipse id="ballShadow" class="c-shadow" cx="0" cy="0" rx="0" ry="0" opacity="0"/>' +
      '<g id="ball" class="ball" opacity="0"><image href="assets/pelota.webp" x="-0.5" y="-0.5" width="1" height="1"/></g>';
  }


  /* «Este mes» en la red: lo que separa tu campo del rival es el partido que toca. */
  function netMarkup(x, y, fs, label) {
    var text = String(label || 'Tu grupo del mes').toUpperCase();
    var w = Math.max(text.length, 10) * fs * 0.64 + fs * 2.2, hgt = fs * 3;
    return '<g class="zone net-btn" data-zone="estemes" data-view="estemes" tabindex="0" role="button" ' +
      'aria-label="Este mes · ' + esc(label || '') + '">' +
      '<rect class="zone-hit nb-bg" x="' + f(x - w / 2) + '" y="' + f(y - hgt / 2) + '" width="' + f(w) + '" height="' + f(hgt) +
      '" rx="' + f(hgt / 2) + '"/>' +
      '<text class="nb-k" x="' + f(x) + '" y="' + f(y - fs * 0.25) + '" font-size="' + f(fs * 0.72) + '">ESTE MES</text>' +
      '<text class="nb-t" x="' + f(x) + '" y="' + f(y + fs * 0.95) + '" font-size="' + f(fs) + '">' + esc(text) + '</text></g>';
  }

  /* ---------- la pista en foto ----------
     Cuatro puntos de la foto con posición conocida en la pista real (las
     esquinas del fondo y los extremos de la línea de saque cercana) bastan
     para saber dónde cae cualquier punto del suelo (una homografía). */
  var PHOTOS = {
    wide: { src: 'assets/pista-web.webp', W: 1672, H: 941, k: 1.6,
      pts: [[[-5, 20], [568, 247]], [[5, 20], [1102, 247]], [[-5, 3.05], [230, 585]], [[5, 3.05], [1441, 585]]],
      door: [835, 728], label: 824, net: [835, 352],
      /* La mitad del fondo es muy estrecha en esta foto: botones algo menores y
         más cerca de la red, para no tapar el escudo del club. */
      farZ: 14, farK: 0.75 },
    tall: { src: 'assets/pista-movil.webp', W: 941, H: 1672, k: 2.35,
      pts: [[[-5, 20], [227, 447]], [[5, 20], [714, 447]], [[-5, 3.05], [-68, 1144]], [[5, 3.05], [1013, 1144]]],
      door: [477, 1362], label: 1462, net: [470, 712],
      /* En el móvil la foto se recorta un poco por los lados para llenar la pantalla. */
      safeX: [85, 856] }
  };

  function solve(A, b) {
    var n = b.length, M = A.map(function (row, i) { return row.concat([b[i]]); });
    for (var c = 0; c < n; c++) {
      var p = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      var t = M[c]; M[c] = M[p]; M[p] = t;
      for (r = 0; r < n; r++) {
        if (r === c) continue;
        var fct = M[r][c] / M[c][c];
        for (var j = c; j <= n; j++) M[r][j] -= fct * M[c][j];
      }
    }
    return M.map(function (row, i) { return row[n] / row[i]; });
  }

  function homography(pts) {
    var A = [], b = [];
    pts.forEach(function (q) {
      var X = q[0][0], Z = q[0][1], u = q[1][0], v = q[1][1];
      A.push([X, Z, 1, 0, 0, 0, -u * X, -u * Z]); b.push(u);
      A.push([0, 0, 0, X, Z, 1, -v * X, -v * Z]); b.push(v);
    });
    var h = solve(A, b);
    return function (X, Z) {
      var w = h[6] * X + h[7] * Z + 1;
      return [(h[0] * X + h[1] * Z + h[2]) / w, (h[3] * X + h[4] * Z + h[5]) / w];
    };
  }

  function photoSvg(mode, live) {
    var ph = PHOTOS[mode], tall = mode === 'tall', k = ph.k;
    var cam = { photo: true, mode: mode, W: ph.W, H: ph.H, hp: homography(ph.pts),
      farZ: ph.farZ, farK: ph.farK, safeX: ph.safeX };
    var h = ['<div class="court-photo ' + mode + '" style="aspect-ratio:' + ph.W + ' / ' + ph.H + '">' +
      '<img src="' + ph.src + '" alt="" decoding="async">' +
      '<svg class="court court-3d court-over ' + mode + '" viewBox="0 0 ' + ph.W + ' ' + ph.H + '"' +
      (tall ? ' preserveAspectRatio="xMidYMax slice"' : '') + ' role="group" ' +
      'aria-label="La pista: cada zona abre una parte de la app">' +
      '<defs><radialGradient id="cBall" cx="35%" cy="35%" r="70%"><stop offset="0" stop-color="#FFE2B8"/>' +
      '<stop offset="1" stop-color="#ED6C05"/></radialGradient>' +
      '<radialGradient id="cGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ED6C05" stop-opacity=".35"/>' +
      '<stop offset="1" stop-color="#ED6C05" stop-opacity="0"/></radialGradient></defs>'];
    ZONES.forEach(function (zn) { h.push(zoneMarkup(cam, zn, live, tall, k)); });
    h.push(doorMarkup(ph.door[0], ph.door[1], (tall ? 26 : 36) * k, (tall ? 14.5 : 20) * k, ph.label));
    h.push(netMarkup(ph.net[0], ph.net[1], (tall ? 11 : 12.5) * k, live.estemes));
    h.push(ballMarkup());
    h.push('</svg></div>');
    return { html: h.join(''), cam: cam };
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
    function zoneSvg(zn) { return zoneMarkup(cam, zn, live, tall, 1); }
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

    /* focos */
    [[-6.2, -0.6], [6.2, -0.6], [-6.2, 20.6], [6.2, 20.6]].forEach(function (l) {
      h.push(line(cam, [l[0], 0, l[1]], [l[0], 6.4, l[1]], 'class="c-pole"'));
      var head = P(cam, l[0] * 0.93, 6.4, l[1]);
      var gr = tall ? 22 : 34;
      h.push('<circle cx="' + f(head[0]) + '" cy="' + f(head[1]) + '" r="' + gr + '" fill="url(#cLamp)" class="c-lamp"/>');
    });

    /* la puerta: el rival te espera fuera de la pista */
    var d = P(cam, 0, 0, -1.5);
    h.push(doorMarkup(d[0], d[1], tall ? 26 : 36, tall ? 14.5 : 20, d[1]));
    var nb = P(cam, 0, 0.9, 10);
    h.push(netMarkup(nb[0], nb[1], tall ? 11 : 13, live.estemes));
    h.push(ballMarkup());

    h.push('</svg>');
    return { html: h.join(''), cam: cam };
  }

  /* ---------- movimiento ---------- */
  /* La pelota bota de botón en botón. Todo se mide en la pantalla con los
     propios botones: su radio dice cuán cerca está esa zona de la cámara,
     así la pelota es más grande delante y más pequeña al fondo. */
  var ball = null;   /* { x, y, r, rot, token, anchors } */

  function reduceMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function anchorsOf(host) {
    var out = {};
    Array.prototype.forEach.call(host.querySelectorAll('.court .zone'), function (g) {
      var c = g.querySelector('.zb');
      if (!c) return;
      out[g.getAttribute('data-zone')] = { x: +c.getAttribute('cx'), y: +c.getAttribute('cy'), r: +c.getAttribute('r') };
    });
    return out;
  }

  /* Tamaño de la pelota respecto al botón: exagerada frente a la escala real
     (a escala mediría 2 px), pero en proporción con la profundidad. */
  var BALL_OF_BADGE = 0.42;

  function drawBall(x, y, r, lift, sx, sy) {
    var g = document.getElementById('ball'), sh = document.getElementById('ballShadow');
    if (!g || !sh) return false;
    var hf = Math.min(1, lift / (r * 7));                 /* 0 en el suelo, 1 en lo alto */
    var grow = 1 + 0.16 * hf;                             /* más alta = más cerca de la cámara */
    var d = 2 * r * grow;
    g.setAttribute('transform', 'translate(' + f(x) + ' ' + f(y - lift) + ') rotate(' + f(ball.rot) + ') scale(' +
      (d * (sx || 1)).toFixed(2) + ' ' + (d * (sy || 1)).toFixed(2) + ')');
    g.setAttribute('opacity', '1');
    sh.setAttribute('cx', f(x)); sh.setAttribute('cy', f(y + r * 0.55));
    sh.setAttribute('rx', f(r * 1.05 * (1 - 0.45 * hf))); sh.setAttribute('ry', f(r * 0.42 * (1 - 0.45 * hf)));
    sh.setAttribute('opacity', (0.5 * (1 - 0.65 * hf)).toFixed(2));
    return true;
  }

  function ballInit(host) {
    var anchors = anchorsOf(host);
    var start = anchors.rival || anchors.historial;
    ball = { anchors: anchors, token: (ball ? ball.token + 1 : 0), rot: 0,
      x: start.x, y: start.y, r: start.r * BALL_OF_BADGE };
    hideBall();   /* entra cayendo desde arriba cuando empieza el peloteo */
  }

  /* Un golpe: avance a velocidad constante y altura en parábola, como una
     pelota de verdad. Distancia larga = golpe más alto y más largo.
     El bote es instantáneo: al tocar el botón sale ya hacia el siguiente. */
  function hop(target, opts, done) {
    if (!ball) { done && done(); return; }
    var token = ball.token;
    var a = opts.to || ball.anchors[target];
    if (!a) { done && done(); return; }
    var x0 = ball.x, y0 = ball.y, r0 = ball.r, r1 = (a.r || ball.r / BALL_OF_BADGE) * BALL_OF_BADGE;
    var dist = Math.hypot(a.x - x0, a.y - y0);
    var unit = (r0 + r1) / 2 / BALL_OF_BADGE;            /* radio medio de botón */
    var peak = opts.fall ? 0 : Math.max(unit * 1.6, Math.min(dist * 0.42, unit * 5.5)) * (opts.peak || 1);
    var dur = (opts.dur || Math.max(380, Math.min(900, 300 + dist / unit * 55))) * (opts.speed || 1);
    var spin = (a.x >= x0 ? 1 : -1) * (360 + dist / unit * 40);
    var rot0 = ball.rot, t0 = null;
    function step(ts) {
      if (!ball || ball.token !== token || !document.getElementById('ball')) return;
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur);
      /* Al caer desde fuera, la gravedad acelera: la bajada va en k². */
      var kv = opts.fall ? k * k : k;
      ball.x = x0 + (a.x - x0) * k;
      ball.y = y0 + (a.y - y0) * kv;
      ball.r = r0 + (r1 - r0) * k;
      ball.rot = rot0 + spin * k;
      drawBall(ball.x, ball.y, ball.r, 4 * peak * k * (1 - k));
      if (k < 1) global.requestAnimationFrame(step); else if (done) done();
    }
    global.requestAnimationFrame(step);
  }

  function hideBall() {
    var g = document.getElementById('ball'), sh = document.getElementById('ballShadow');
    if (g) g.setAttribute('opacity', '0');
    if (sh) sh.setAttribute('opacity', '0');
  }

  /* El peloteo: la pelota cae desde arriba, bota una vez en cada botón
     cruzando la red, termina fuera de la pista en «El rival» y de ahí sale
     con un bote muy alto por arriba de la pantalla. Unos segundos después
     vuelve a caer. Se para si la pestaña no se ve. */
  var RALLY = ['historial', 'analisis', 'liga', 'cronica', 'temporada', 'registro', 'rival'];

  function svgHeight() {
    var svg = document.querySelector('.court-host svg.court');
    var vb = svg && svg.viewBox && svg.viewBox.baseVal;
    return vb ? vb.height : 1000;
  }

  function rally() {
    if (reduceMotion() || !ball) return;
    var token = ball.token, H = svgHeight();
    function alive() { return ball && ball.token === token && document.getElementById('ball'); }
    function later(fn, ms) { setTimeout(function () { if (alive()) fn(); }, ms); }
    function round() {
      if (document.hidden) { later(round, 1000); return; }
      /* entra cayendo desde fuera, encima del primer botón */
      var first = ball.anchors[RALLY[0]];
      ball.x = first.x - first.r * 0.6; ball.y = -H * 0.25; ball.r = first.r * BALL_OF_BADGE;
      hop(RALLY[0], { fall: true, dur: 700 }, function () { play(1); });
    }
    function play(i) {
      if (!alive()) return;
      if (i < RALLY.length) { hop(RALLY[i], {}, function () { play(i + 1); }); return; }
      /* desde la puerta: bote altísimo y fuera de la pantalla por arriba */
      hop(null, { to: { x: ball.x + ball.r * 6, y: -H * 0.45, r: ball.r / BALL_OF_BADGE * 0.8 },
        peak: 1.4, dur: 1100 }, function () { hideBall(); later(round, 3200); });
    }
    round();
  }

  function bind(root, go) {
    Array.prototype.forEach.call(root.querySelectorAll('.court .zone'), function (g) {
      function activate() {
        var target = g.getAttribute('data-view');
        g.classList.add('hit');
        if (reduceMotion() || !ball) { go(target); return; }
        ball.token++;                                       /* corta el peloteo */
        hop(g.getAttribute('data-zone'), { speed: 0.55, peak: 0.8 }, function () { go(target); });
      }
      g.addEventListener('click', activate);
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activate(); }
      });
    });
    setTimeout(rally, 500);
  }

  /* Pinta la pista en `host` y la redibuja si cambia la orientación. */
  function mount(host, live, go) {
    var mode = null, photoOk = true;
    function draw() {
      var next = host.clientWidth >= 700 && global.innerWidth > global.innerHeight * 0.9 ? 'wide' : 'tall';
      if (next === mode && host.firstChild) return;
      mode = next;
      paint(photoOk ? photoSvg(mode, live) : svg(mode, live));
      var img = host.querySelector('.court-photo img');
      if (img) img.addEventListener('error', function () {
        /* Sin la foto (sin red, archivo perdido) queda la pista dibujada. */
        photoOk = false; paint(svg(mode, live));
      });
    }
    function paint(out) {
      host.innerHTML = out.html;
      host.classList.toggle('is-photo', !!out.cam.photo);
      var home = host.closest('.home');
      if (home) home.classList.toggle('has-photo', !!out.cam.photo);
      ballInit(host);
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
