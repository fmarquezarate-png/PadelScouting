/* ============================================================
   enlaces.js · «El club»: enlaces oficiales y de interés
   · Los pone el administrador (Configuración no hace falta: se editan
     en la misma pantalla «El club»). Todos los ven igual.
   · Salen en una pantalla propia con tarjetas grandes y en el menú ☰.
   · Base: list_club_links() (pública), save_club_link(p) y
     hide_club_link(p_id) (solo admin). Un enlace quitado se oculta, no se borra.
   ============================================================ */
(function (global) {
  'use strict';

  var CACHE = 'padel-scouting.club-links.v1';
  var DB = function () { return global.PadelDB; };

  /* Iconos para elegir (trazo, 24×24, como los de la pista). */
  var ICONS = {
    web: { label: 'Web', svg: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5S14.6 18.1 12 20.5M12 3.5C9.4 5.9 8.1 8.7 8.1 12s1.3 6.1 3.9 8.5"/>' },
    reserva: { label: 'Reservar', svg: '<rect x="4.5" y="5.5" width="15" height="14" rx="1.5"/><path d="M4.5 9.5h15M8.5 3.5v4M15.5 3.5v4M9 14.5l2 2 4-4"/>' },
    liga: { label: 'Liga', svg: '<path d="M8 4.5h8v4.8a4 4 0 0 1-8 0zM8 6.3H5.2a3 3 0 0 0 3 3.6M16 6.3h2.8a3 3 0 0 1-3 3.6M12 13.3v3.2M9 19.5h6M10 16.5h4v3h-4z"/>' },
    redes: { label: 'Redes', svg: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.8" cy="7.2" r=".9"/>' },
    chat: { label: 'Chat', svg: '<path d="M5 18.5l1.2-3.6A7.5 7.5 0 1 1 9.1 18z"/><path d="M9 11.5h6M9 14h4"/>' },
    mapa: { label: 'Cómo llegar', svg: '<path d="M12 20.5s-6-5.4-6-10.2a6 6 0 0 1 12 0c0 4.8-6 10.2-6 10.2z"/><circle cx="12" cy="10.3" r="2.3"/>' },
    info: { label: 'Info', svg: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>' }
  };
  function iconSvg(k, size) {
    var ic = ICONS[k] || ICONS.web;
    return '<svg viewBox="0 0 24 24" width="' + (size || 22) + '" height="' + (size || 22) + '" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ic.svg + '</svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} }

  /* Solo direcciones web normales: https://… (si se escribe sin, se añade). */
  function cleanUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
    if (!/^https?:\/\//i.test(u)) return '';
    try { var x = new URL(u); return x.hostname.indexOf('.') > 0 ? x.href : ''; } catch (e) { return ''; }
  }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

  var state = { list: null, loading: false, edit: null, error: null, busy: false };

  function cached() { try { return JSON.parse(lsGet(CACHE)) || []; } catch (e) { return []; } }

  /* Trae los enlaces; mientras, usa la última copia. */
  function load() {
    if (!state.list) state.list = cached();
    state.loading = true;
    return DB().rpcPublic('list_club_links').then(function (rows) {
      state.list = (Array.isArray(rows) ? rows : []).filter(function (x) { return cleanUrl(x.url); });
      lsSet(CACHE, JSON.stringify(state.list));
    }).catch(function () { /* sin red o sin la tabla: seguimos con la copia */ })
      .then(function () { state.loading = false; paintDrawer(); return state.list; });
  }

  /* ---------- menú ☰: grupo «El club» ---------- */
  function paintDrawer() {
    var nav = document.getElementById('drawer-nav');
    if (!nav) return;
    var g = document.getElementById('dr-club');
    if (!g) {
      g = document.createElement('div');
      g.id = 'dr-club';
      g.className = 'dr-group';
      nav.appendChild(g);
    }
    var list = state.list || [];
    var title = global.PadelData.NAMES.club;
    g.innerHTML = '<div class="dr-title">' + esc(title) + '</div>' +
      list.slice(0, 5).map(function (x) {
        return '<a class="dr-item dr-link" href="' + esc(cleanUrl(x.url)) + '" target="_blank" rel="noopener noreferrer">' +
          iconSvg(x.icon) + '<span>' + esc(x.title) + '</span><i class="dr-ext" aria-hidden="true">↗</i></a>';
      }).join('') +
      '<button type="button" class="dr-item" data-drawer-go="club">' + iconSvg('info') + '<span>' +
      (list.length ? 'Todos los enlaces' : 'Enlaces del club') + '</span></button>';
    if (!g._bound) {
      g._bound = true;
      g.addEventListener('click', function (ev) {
        if (ev.target.closest('.dr-link') && global.PadelShell) global.PadelShell.closeDrawer();
      });
    }
  }

  /* ---------- pantalla «El club» ---------- */
  var $view = null;
  function render(view) {
    $view = view;
    paint();
    load().then(function () { if ($view && document.body.contains($view) && global.PadelApp.state.view === 'club') paint(); });
  }

  function paint() {
    var admin = DB().isAdmin(), list = state.list || [];
    var h = ['<div class="club-page">'];
    if (!list.length && !admin) {
      h.push('<div class="empty-state club-empty">' + iconSvg('web', 42) +
        '<p>' + (state.loading ? 'Cargando los enlaces del club…' : 'Todavía no hay enlaces. El administrador los añadirá aquí.') + '</p></div>');
    }
    h.push('<div class="club-grid">');
    list.forEach(function (x, i) {
      var url = cleanUrl(x.url);
      h.push('<article class="club-card' + (i === 0 ? ' lead' : '') + '">' +
        '<a class="club-hit" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="club-ico">' + iconSvg(x.icon, i === 0 ? 30 : 26) + '</span>' +
        '<span class="club-txt"><b>' + esc(x.title) + '</b>' + (x.note ? '<span class="club-note">' + esc(x.note) + '</span>' : '') +
        '<span class="club-host">' + esc(hostOf(url)) + ' ↗</span></span></a>' +
        (admin ? '<div class="club-admin"><button type="button" class="btn small ghost" data-cl-edit="' + x.id + '">Editar</button>' +
          (i > 0 ? '<button type="button" class="btn small ghost" data-cl-up="' + x.id + '" aria-label="Subir">↑</button>' : '') +
          '<button type="button" class="btn small ghost danger" data-cl-hide="' + x.id + '">Quitar</button></div>' : '') +
        '</article>');
    });
    h.push('</div>');
    if (admin) {
      h.push(state.edit ? editorHtml() : '<div class="btn-row club-add"><button type="button" class="btn primary" data-cl-new>＋ Añadir un enlace</button></div>');
      h.push('<p class="note">Solo tú, como administrador, ves los botones para añadir, editar y quitar.</p>');
    }
    h.push('</div>');
    $view.innerHTML = h.join('');
    bind();
  }

  function editorHtml() {
    var e = state.edit;
    return '<section class="card club-editor"><h3>' + (e.id ? 'Editar enlace' : 'Nuevo enlace') + '</h3>' +
      '<div class="field"><label for="cl-title">Título</label><input id="cl-title" maxlength="40" placeholder="Web del club" value="' + esc(e.title) + '"></div>' +
      '<div class="field"><label for="cl-url">Dirección</label><input id="cl-url" inputmode="url" autocomplete="off" placeholder="https://…" value="' + esc(e.url) + '"></div>' +
      '<div class="field"><label for="cl-note">Una frase <span class="opt">· opcional</span></label><input id="cl-note" maxlength="90" placeholder="Reservas, horarios y noticias" value="' + esc(e.note) + '"></div>' +
      '<span class="field-label">Icono</span><div class="chips tight club-icons">' +
      Object.keys(ICONS).map(function (k) {
        return '<button type="button" class="chip" data-cl-icon="' + k + '" aria-pressed="' + (e.icon === k) + '">' + iconSvg(k, 18) + ' ' + esc(ICONS[k].label) + '</button>';
      }).join('') + '</div>' +
      (state.error ? '<div class="notice bad">' + esc(state.error) + '</div>' : '') +
      '<div class="btn-row"><button type="button" class="btn primary" data-cl-save' + (state.busy ? ' disabled' : '') + '>Guardar</button>' +
      '<button type="button" class="btn ghost" data-cl-cancel>Cancelar</button></div></section>';
  }

  function readForm() {
    var e = state.edit;
    ['title', 'url', 'note'].forEach(function (k) { var el = document.getElementById('cl-' + k); if (el) e[k] = el.value; });
  }

  function byId(id) { return (state.list || []).filter(function (x) { return String(x.id) === String(id); })[0]; }

  function call(fn, args, ok) {
    state.busy = true;
    return DB().callAuthed(fn, args).then(function () {
      state.busy = false; state.edit = null; state.error = null;
      global.PadelApp.toast(ok);
      return load().then(paint);
    }).catch(function (err) { state.busy = false; state.error = err.message; global.PadelApp.toast(err.message, true); paint(); });
  }

  function bind() {
    $view.querySelectorAll('[data-cl-new]').forEach(function (b) {
      b.addEventListener('click', function () { state.edit = { id: null, title: '', url: '', note: '', icon: 'web' }; state.error = null; paint(); });
    });
    $view.querySelectorAll('[data-cl-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var x = byId(b.getAttribute('data-cl-edit'));
        if (x) { state.edit = { id: x.id, title: x.title, url: x.url, note: x.note || '', icon: x.icon || 'web' }; state.error = null; paint(); }
        var ed = $view.querySelector('.club-editor');
        if (ed && ed.scrollIntoView) ed.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
    $view.querySelectorAll('[data-cl-icon]').forEach(function (b) {
      b.addEventListener('click', function () { readForm(); state.edit.icon = b.getAttribute('data-cl-icon'); paint(); });
    });
    $view.querySelectorAll('[data-cl-cancel]').forEach(function (b) {
      b.addEventListener('click', function () { state.edit = null; state.error = null; paint(); });
    });
    $view.querySelectorAll('[data-cl-save]').forEach(function (b) {
      b.addEventListener('click', function () {
        readForm();
        var e = state.edit, url = cleanUrl(e.url);
        if (!e.title.trim()) { state.error = 'Ponle un título.'; paint(); return; }
        if (!url) { state.error = 'Esa dirección no parece una web (https://…).'; paint(); return; }
        call('save_club_link', { p: { id: e.id, title: e.title.trim(), url: url, note: e.note.trim(), icon: e.icon } },
          e.id ? 'Enlace guardado.' : 'Enlace añadido.');
      });
    });
    $view.querySelectorAll('[data-cl-hide]').forEach(function (b) {
      b.addEventListener('click', function () {
        var x = byId(b.getAttribute('data-cl-hide'));
        if (!x || !global.confirm('¿Quitar «' + x.title + '» de El club?')) return;
        call('hide_club_link', { p_id: x.id }, 'Enlace quitado.');
      });
    });
    $view.querySelectorAll('[data-cl-up]').forEach(function (b) {
      b.addEventListener('click', function () {
        var list = state.list || [], i = list.indexOf(byId(b.getAttribute('data-cl-up')));
        if (i < 1) return;
        var ids = list.map(function (x) { return x.id; });
        ids.splice(i - 1, 0, ids.splice(i, 1)[0]);
        call('order_club_links', { p_ids: ids }, 'Orden guardado.');
      });
    });
  }

  global.PadelEnlaces = { load: load, render: render, paintDrawer: paintDrawer, cleanUrl: cleanUrl, ICONS: ICONS, state: state };
  function boot() { paintDrawer(); load(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  else setTimeout(boot, 0);
})(window);
