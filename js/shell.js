/* ============================================================
   shell.js · el marco de la app
   Barra fija de arriba (⚙ · 🏠 · ☰ · tu inicial o foto), el
   panel con todas las secciones, Mi perfil, Configuración y la
   bienvenida de 3 datos al estrenar cuenta.
   ============================================================ */
(function (global) {
  'use strict';

  var go = null;
  var PL = function () { return global.PadelLiga; };
  var DB = function () { return global.PadelDB; };

  /* El mismo orden que la pista: portada; lo que toca ahora (la red y la
     puerta); la liga (el fondo); tu scouting (vuestro lado); tu cuenta. */
  var SECTIONS = [
    { group: '', items: [['inicio', 'La pista', 'inicio']] },
    { group: 'Ahora', items: [
      ['estemes', 'Este mes', 'estemes'], ['rival', 'El rival', 'rival']] },
    { group: 'La liga', items: [
      ['liga', 'La liga', 'liga'], ['temporada', 'Nuestra temporada', 'temporada'], ['cronica', 'Crónica', 'cronica']] },
    { group: 'Tu scouting', items: [
      ['registro', 'Registrar partido', 'registro'], ['historial', 'Historial', 'historial'],
      ['analisis', 'Análisis y briefing', 'analisis']] },
    { group: 'Tu cuenta', items: [['perfil', 'Mi perfil', 'perfil'], ['config', 'Configuración', 'config']] }
  ];

  var KIND = { masculina: 'Masculina', mixta: 'Mixta', femenina: 'Femenina' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function icon(n) { return global.PadelCourt ? global.PadelCourt.icon(n) : ''; }
  function user() { return global.PadelAuth && global.PadelAuth.user(); }
  function me() { return DB().myPlayer() || null; }
  function norm(x) {
    return String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  /* ============================================================
     barra y panel
     ============================================================ */
  function init(goFn) {
    go = goFn;
    var nav = document.getElementById('drawer-nav');
    nav.innerHTML = SECTIONS.map(function (g) {
      return '<div class="dr-group' + (g.group ? '' : ' first') + '">' +
        (g.group ? '<div class="dr-title">' + esc(g.group) + '</div>' : '') +
        g.items.map(function (it) {
          return '<button type="button" class="dr-item" data-drawer-go="' + it[0] + '">' +
            icon(it[2]) + '<span>' + esc(it[1]) + '</span></button>';
        }).join('') + '</div>';
    }).join('');

    document.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-shell]');
      if (b) {
        var a = b.getAttribute('data-shell');
        if (a === 'menu') { isOpen() ? closeDrawer() : openDrawer(); return; }
        if (a === 'close') { closeDrawer(); return; }
        if (a === 'home') { closeDrawer(); go('inicio'); return; }
        if (a === 'config') { closeDrawer(); go('config'); return; }
        if (a === 'perfil') { closeDrawer(); go('perfil'); return; }
      }
      var d = ev.target.closest('[data-drawer-go]');
      if (d) { closeDrawer(); go(d.getAttribute('data-drawer-go')); }
    });
    document.getElementById('scrim').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (document.querySelector('.modal')) { closeModal(); return; }
      if (isOpen()) { closeDrawer(); document.getElementById('menu-btn').focus(); }
    });
    paintAvatar();
  }

  function isOpen() { return !document.getElementById('drawer').hidden; }

  function openDrawer() {
    var d = document.getElementById('drawer'), s = document.getElementById('scrim');
    d.hidden = false; s.hidden = false;
    global.requestAnimationFrame(function () { d.classList.add('open'); s.classList.add('open'); });
    document.getElementById('menu-btn').setAttribute('aria-expanded', 'true');
    var cur = d.querySelector('[aria-current="page"]') || d.querySelector('.dr-item');
    if (cur) cur.focus();
  }

  function closeDrawer() {
    var d = document.getElementById('drawer'), s = document.getElementById('scrim');
    if (d.hidden) return;
    d.classList.remove('open'); s.classList.remove('open');
    document.getElementById('menu-btn').setAttribute('aria-expanded', 'false');
    setTimeout(function () { if (!d.classList.contains('open')) { d.hidden = true; s.hidden = true; } }, 220);
  }

  function onNavigate(view) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-drawer-go]'), function (b) {
      if (b.getAttribute('data-drawer-go') === view) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.topbar [data-shell]'), function (b) {
      var a = b.getAttribute('data-shell');
      b.classList.toggle('is-on', (a === 'home' && view === 'inicio') || a === view);
    });
  }

  /* Tu inicial, o tu foto si la has subido. Sin sesión, un interrogante. */
  function paintAvatar() {
    var btn = document.getElementById('avatar-btn');
    if (!btn) return;
    var p = me(), u = user();
    btn.classList.toggle('guest', !u);
    if (u && p && p.avatar) {
      btn.innerHTML = '<img src="' + esc(p.avatar) + '" alt="">';
    } else {
      var name = (p && p.label) || (u && u.email) || '';
      btn.innerHTML = '<span id="avatar-initial">' + esc(u ? (name.charAt(0) || '?').toUpperCase() : '?') + '</span>';
    }
    btn.setAttribute('aria-label', u ? 'Mi perfil' : 'Entrar');
    btn.title = u ? 'Mi perfil' : 'Entrar';
  }

  function needsWelcome(p) {
    return !p || !p.label || !p.category || p.playsMixed == null;
  }

  var welcomeSkipped = false;
  function onProfile(p) {
    paintAvatar();
    if (user() && global.PadelEsteMes) global.PadelEsteMes.boot();
    if (user() && global.PadelSync) global.PadelSync.syncAll();
    if (user() && needsWelcome(p) && !welcomeSkipped) openWelcome(p || {});
  }

  /* ============================================================
     bienvenida: 3 datos y listo
     ============================================================ */
  var wz = null;

  function openWelcome(p, editing) {
    wz = {
      label: p.label || '', category: p.category || null,
      playsMixed: p.playsMixed == null ? null : !!p.playsMixed,
      defaultKind: p.defaultKind || null, query: '', players: null, busy: false, error: null,
      editing: !!editing
    };
    paintWelcome();
    DB().listPlayers().then(function (list) { if (wz) { wz.players = list || []; paintWelcome(); } });
  }

  function welcomeHtml() {
    var h = ['<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="wz-title">'];
    h.push('<img class="wz-crest" src="assets/logo.png" alt="" width="54" height="54">');
    h.push('<h2 id="wz-title">' + (wz.editing ? 'Tus datos' : 'Bienvenido a la pista') + '</h2>');
    h.push('<p class="field-note">' + (wz.editing ? 'Cámbialos cuando quieras.'
      : 'Tres datos y la app se ajusta a ti: tu pareja, tu competición y lo que ves al abrir.') + '</p>');

    /* 1 · quién eres */
    h.push('<div class="wz-step"><span class="wz-n">1</span><div class="wz-body">' +
      '<label class="field-label" for="wz-q">¿Quién eres en la liga?</label>');
    if (wz.label) {
      h.push('<p class="wz-picked"><b>' + esc(wz.label) + '</b> · <button class="linkish" data-wz="relabel">cambiar</button></p>');
    } else {
      h.push('<input type="search" id="wz-q" autocomplete="off" placeholder="Tu nombre como sale en la clasificación" value="' +
        esc(wz.query) + '">');
      var q = norm(wz.query);
      if (!wz.players) h.push('<p class="field-note">Cargando jugadores…</p>');
      else if (q.length >= 2) {
        var hits = wz.players.filter(function (x) { return norm(x.label).indexOf(q) >= 0; }).slice(0, 8);
        h.push(hits.length ? '<div class="me-hits">' + hits.map(function (x) {
          return '<button type="button" class="chip" data-wz-player="' + esc(x.label) + '">' + esc(x.label) +
            (x.kinds ? ' <small>' + x.kinds.map(function (k) { return (KIND[k] || k).charAt(0); }).join('·') + '</small>' : '') +
            '</button>';
        }).join('') + '</div>' : '<p class="field-note">No sale nadie así. La liga corta los nombres a 10 letras: prueba con menos.</p>');
      } else h.push('<p class="field-note">Escribe al menos dos letras.</p>');
    }
    h.push('</div></div>');

    /* 2 · categoría */
    h.push('<div class="wz-step"><span class="wz-n">2</span><div class="wz-body">' +
      '<span class="field-label">Tu categoría</span><div class="chips tight">' +
      ['masculina', 'femenina'].map(function (k) {
        return '<button type="button" class="chip" data-wz-cat="' + k + '" aria-pressed="' + (wz.category === k) + '">' + KIND[k] + '</button>';
      }).join('') + '</div></div></div>');

    /* 3 · mixto */
    h.push('<div class="wz-step"><span class="wz-n">3</span><div class="wz-body">' +
      '<span class="field-label">¿Juegas también mixto?</span><div class="chips tight">' +
      '<button type="button" class="chip" data-wz-mix="1" aria-pressed="' + (wz.playsMixed === true) + '">Sí</button>' +
      '<button type="button" class="chip" data-wz-mix="0" aria-pressed="' + (wz.playsMixed === false) + '">No</button></div>');
    if (wz.playsMixed && wz.category) {
      h.push('<span class="field-label" style="margin-top:12px">Al abrir la app, ver</span><div class="chips tight">' +
        [wz.category, 'mixta'].map(function (k) {
          return '<button type="button" class="chip" data-wz-def="' + k + '" aria-pressed="' + (defaultKind() === k) + '">' + KIND[k] + '</button>';
        }).join('') + '</div>');
    }
    h.push('</div></div>');

    if (wz.error) h.push('<div class="notice bad">' + esc(wz.error) + '</div>');
    var ready = wz.label && wz.category && wz.playsMixed != null;
    h.push('<div class="btn-row">' +
      '<button class="btn primary" data-wz="save"' + (ready && !wz.busy ? '' : ' disabled') + '>' +
      (wz.busy ? 'Guardando…' : (wz.editing ? 'Guardar' : 'Entrar a la pista')) + '</button>' +
      '<button class="btn ghost" data-wz="later">' + (wz.editing ? 'Cancelar' : 'Luego') + '</button></div>');
    h.push('</div>');
    return h.join('');
  }

  function defaultKind() {
    if (!wz.playsMixed) return wz.category;
    return wz.defaultKind === 'mixta' ? 'mixta' : wz.category;
  }

  function paintWelcome() {
    var root = document.getElementById('modal-root');
    var focusId = document.activeElement && document.activeElement.id;
    var pos = focusId === 'wz-q' ? document.activeElement.selectionStart : null;
    root.innerHTML = '<div class="modal">' + welcomeHtml() + '</div>';
    document.body.classList.add('has-modal');
    var q = document.getElementById('wz-q');
    if (q) {
      if (focusId === 'wz-q' || !wz.label) { q.focus(); if (pos != null) try { q.setSelectionRange(pos, pos); } catch (e) {} }
      q.addEventListener('input', function () { wz.query = q.value; paintWelcome(); });
    }
    root.querySelectorAll('[data-wz-player]').forEach(function (b) {
      b.addEventListener('click', function () { wz.label = b.getAttribute('data-wz-player'); wz.query = ''; paintWelcome(); });
    });
    root.querySelectorAll('[data-wz-cat]').forEach(function (b) {
      b.addEventListener('click', function () { wz.category = b.getAttribute('data-wz-cat'); paintWelcome(); });
    });
    root.querySelectorAll('[data-wz-mix]').forEach(function (b) {
      b.addEventListener('click', function () { wz.playsMixed = b.getAttribute('data-wz-mix') === '1'; paintWelcome(); });
    });
    root.querySelectorAll('[data-wz-def]').forEach(function (b) {
      b.addEventListener('click', function () { wz.defaultKind = b.getAttribute('data-wz-def'); paintWelcome(); });
    });
    root.querySelectorAll('[data-wz]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-wz');
        if (a === 'relabel') { wz.label = ''; paintWelcome(); }
        else if (a === 'later') { if (!wz.editing) welcomeSkipped = true; closeModal(); }
        else if (a === 'save') saveWelcome();
      });
    });
  }

  function saveWelcome() {
    wz.busy = true; wz.error = null; paintWelcome();
    var kind = defaultKind();
    DB().updateProfile({ label: wz.label, category: wz.category, playsMixed: wz.playsMixed, defaultKind: kind })
      .then(function (p) {
        var editing = wz.editing;
        closeModal();
        paintAvatar();
        var m = PL().state.model;
        if (m) PL().applyMe(m);
        /* Te lleva a tu competición por defecto. */
        global.PadelApp.refreshSeasons().then(function () {
          var A = global.PadelApp, list = PL().state.seasons || [];
          var has = list.some(function (x) { return x.kind === kind; });
          if (has && A.kindOfSlug(DB().currentSeason()) !== kind) A.switchTo(A.latestSlugOfKind(kind), false);
          else go(global.PadelApp.state.view);
        });
        global.PadelApp.toast(editing ? 'Datos guardados.' : '¡Bienvenido, ' + (p && p.label ? p.label.split(' ')[0] : '') + '!');
      }).catch(function (err) {
        if (!wz) return;
        wz.busy = false; wz.error = err.message; paintWelcome();
      });
  }

  function closeModal() {
    wz = null;
    document.getElementById('modal-root').innerHTML = '';
    document.body.classList.remove('has-modal');
  }

  /* ============================================================
     MI PERFIL
     ============================================================ */
  var photo = { busy: false, error: null };

  function renderPerfil(view, bind) {
    function redraw() { renderPerfil(view, bind); }
    var u = user(), p = me() || {};
    var h = ['<div class="page-narrow">'];

    if (!u) {
      h.push('<section class="card profile-card"><div class="pf-head">' +
        '<span class="avatar big guest"><span>?</span></span><div><h2>Entra en tu cuenta</h2>' +
        '<p class="field-note">Con cuenta, la app sabe quién eres, guarda tus datos en la nube y te deja cargar la liga.</p></div></div>' +
        PL().authForm() + '</section>');
      h.push('</div>');
      view.innerHTML = h.join('');
      PL().bindAuth(view, redraw, function () { redraw(); });
      bind();
      return;
    }

    h.push('<section class="card profile-card"><div class="pf-head">' +
      '<span class="avatar big">' + (p.avatar ? '<img src="' + esc(p.avatar) + '" alt="Tu foto">'
        : '<span>' + esc(((p.label || u.email || '?').charAt(0)).toUpperCase()) + '</span>') + '</span>' +
      '<div><h2>' + esc(p.label || 'Sin jugador') + '</h2><p class="field-note">' + esc(u.email || '') + '</p>' +
      '<div class="btn-row tight"><button class="btn ghost small" data-pf="photo">' +
      (photo.busy ? 'Subiendo…' : (p.avatar ? 'Cambiar foto' : 'Subir foto')) + '</button>' +
      (p.avatar ? '<button class="btn ghost small" data-pf="nophoto">Quitar</button>' : '') + '</div>' +
      '<input type="file" id="pf-file" accept="image/*" hidden></div></div>' +
      (photo.error ? '<div class="notice bad">' + esc(photo.error) + '</div>' : '') + '</section>');

    h.push('<section class="card"><h3>Tus datos</h3><dl class="pf-list">' +
      '<dt>En la liga</dt><dd>' + esc(p.label || '—') + '</dd>' +
      '<dt>Categoría</dt><dd>' + esc(KIND[p.category] || '—') + '</dd>' +
      '<dt>Mixto</dt><dd>' + (p.playsMixed == null ? '—' : (p.playsMixed ? 'Sí' : 'No')) + '</dd>' +
      '<dt>Al abrir</dt><dd>' + esc(KIND[p.defaultKind] || '—') + '</dd></dl>' +
      '<div class="btn-row"><button class="btn" data-pf="edit">Editar mis datos</button>' +
      '<button class="btn ghost" data-action="sign-out">Cerrar sesión</button></div></section>');
    h.push('</div>');
    view.innerHTML = h.join('');

    var file = document.getElementById('pf-file');
    view.querySelectorAll('[data-pf]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-pf');
        if (a === 'photo') file.click();
        else if (a === 'nophoto') saveAvatar('', redraw);
        else if (a === 'edit') openWelcome(me() || {}, true);
      });
    });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      photo.busy = true; photo.error = null; redraw();
      shrink(f, 256).then(function (url) { saveAvatar(url, redraw); })
        .catch(function () { photo.busy = false; photo.error = 'No he podido leer esa imagen.'; redraw(); });
    });
    PL().bindAuth(view, function () { go('inicio'); });
    bind();
  }

  function saveAvatar(url, redraw) {
    photo.busy = true; photo.error = null;
    DB().updateProfile({ avatar: url }).then(function () {
      photo.busy = false; paintAvatar(); redraw();
    }).catch(function (err) { photo.busy = false; photo.error = err.message; redraw(); });
  }

  /* La foto se reduce en el móvil (cuadrada, 256 px) antes de subirla. */
  function shrink(file, size) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = reject;
      r.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var s = Math.min(img.width, img.height);
          var c = document.createElement('canvas');
          c.width = c.height = size;
          c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
          resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  /* ============================================================
     CONFIGURACIÓN
     ============================================================ */
  function renderConfig(view, bind) {
    view.innerHTML = PL().loadingHtml('Cargando…');
    PL().ensureLoaded(function () { paintConfig(view, bind); });
  }

  function paintConfig(view, bind) {
    function redraw() { paintConfig(view, bind); }
    var p = me() || {}, u = user();
    var list = PL().state.seasons || [];
    var slug = DB().currentSeason();
    var h = ['<div class="page-narrow">'];

    h.push('<section class="card"><h3>Competición</h3>' +
      '<p class="field-note">Estás viendo <b>' + esc((global.PadelApp.KIND[global.PadelApp.kindOfSlug(slug)] || '') + ' · ' +
      global.PadelApp.seasonName(slug)) + '</b>. La competición se cambia arriba, junto al título; el semestre, dentro de cada página.</p>');
    if (u) {
      var kinds = [];
      list.forEach(function (x) { if (kinds.indexOf(x.kind) < 0) kinds.push(x.kind); });
      if (kinds.length > 1) {
        h.push('<span class="field-label">Al abrir la app, ver</span><div class="chips tight" id="cfg-def">' +
          kinds.map(function (k) {
            return '<button type="button" class="chip" data-kind="' + k + '" aria-pressed="' + (p.defaultKind === k) + '">' + esc(KIND[k] || k) + '</button>';
          }).join('') + '</div>');
      }
    }
    h.push('</section>');

    h.push('<section class="card"><h3>Datos de la liga</h3>' + PL().sourceNote() + PL().loaderCard() + '</section>');

    h.push('<section class="card"><h3>Tu registro de scouting</h3>' +
      '<p class="field-note">Tus notas de partido viven en este navegador. La copia de seguridad está en el Historial.</p>' +
      '<div class="btn-row"><button class="btn" data-goto="historial">Ir a la copia de seguridad</button></div></section>');

    h.push('<p class="note center">Padel Scouting · Club Tennis El Molí</p></div>');
    view.innerHTML = h.join('');

    var def = document.getElementById('cfg-def');
    if (def) def.addEventListener('click', function (ev) {
      var c = ev.target.closest('[data-kind]');
      if (!c) return;
      DB().updateProfile({ defaultKind: c.getAttribute('data-kind') }).then(function () {
        global.PadelApp.toast('Guardado: al abrir verás ' + (KIND[c.getAttribute('data-kind')] || '') + '.');
        redraw();
      }).catch(function (err) { global.PadelApp.toast(err.message, true); });
    });
    PL().bindLoader(view, redraw);
    bind();
  }

  global.PadelShell = {
    init: init, onNavigate: onNavigate, onProfile: onProfile, paintAvatar: paintAvatar,
    openWelcome: openWelcome, closeModal: closeModal, closeDrawer: closeDrawer,
    renderPerfil: renderPerfil, renderConfig: renderConfig
  };
})(window);
