/* ============================================================
   sync.js · el registro de scouting en tu cuenta
   El navegador guarda una copia (funciona sin red) y cada cambio
   se sube a Supabase. Al abrir la app se baja lo que falte: si un
   registro cambió en dos sitios, gana el más reciente. La primera
   vez se sube todo lo que ya había en este navegador.
   ============================================================ */
(function (global) {
  'use strict';

  var S = global.PadelStorage;
  var TOMB = 'padel-scouting.tomb.v1';   /* borrados pendientes de subir */
  var state = { syncing: false, last: null, error: null };

  function user() { return global.PadelAuth && global.PadelAuth.user(); }
  function call(fn, args) { return global.PadelDB.callAuthed(fn, args); }

  function tombs() { try { return JSON.parse(global.localStorage.getItem(TOMB)) || []; } catch (e) { return []; } }
  function setTombs(t) { try { global.localStorage.setItem(TOMB, JSON.stringify(t)); } catch (e) {} }

  function item(m) { return { id: m.id, data: m, deleted: false, updatedAt: m.updatedAt || m.createdAt || new Date().toISOString() }; }

  function push(items) {
    if (!user() || !items.length) return Promise.resolve(0);
    return call('push_my_records', { items: items }).then(function (n) {
      state.error = null;
      /* los borrados ya subidos dejan de estar pendientes */
      var ids = items.filter(function (i) { return i.deleted; }).map(function (i) { return i.id; });
      if (ids.length) setTombs(tombs().filter(function (t) { return ids.indexOf(t.id) < 0; }));
      return n;
    }).catch(function (e) { state.error = e.message; return 0; });
  }

  /* Baja lo de la cuenta, mezcla con lo local y sube lo que falte. */
  function syncAll() {
    if (!user() || state.syncing) return Promise.resolve();
    state.syncing = true;
    return call('list_my_records').then(function (remote) {
      var local = S.all(), byId = {};
      local.forEach(function (m) { byId[m.id] = m; });
      var pending = {};
      tombs().forEach(function (t) { pending[t.id] = t.at; });
      var changed = false, up = [];
      (remote || []).forEach(function (r) {
        var l = byId[r.id];
        var rt = Date.parse(r.updatedAt) || 0, lt = l ? (Date.parse(l.updatedAt || l.createdAt) || 0) : 0;
        if (pending[r.id] && Date.parse(pending[r.id]) >= rt) return;          /* lo borraste aquí después */
        if (r.deleted) { if (l && lt <= rt) { delete byId[r.id]; changed = true; } return; }
        if (!l || lt < rt) { byId[r.id] = r.data; changed = true; }
        else if (lt > rt) up.push(item(l));
      });
      var remoteIds = (remote || []).map(function (r) { return r.id; });
      Object.keys(byId).forEach(function (id) { if (remoteIds.indexOf(id) < 0) up.push(item(byId[id])); });
      if (changed) S.replaceAll(Object.keys(byId).map(function (k) { return byId[k]; }), true);
      tombs().forEach(function (t) { up.push({ id: t.id, data: {}, deleted: true, updatedAt: t.at }); });
      return push(up).then(function () {
        state.last = new Date().toISOString();
        if (changed) {
          var app = global.PadelApp;
          if (app && ['historial', 'analisis'].indexOf(app.state.view) >= 0) app.go(app.state.view);
        }
      });
    }).catch(function (e) { state.error = e.message; })
      .then(function () { state.syncing = false; });
  }

  /* Cada cambio local sale hacia la cuenta al momento. */
  S.onChange(function (kind, data) {
    var at = new Date().toISOString();
    if (kind === 'save') { push([item(data)]); return; }
    if (kind === 'remove') {
      setTombs(tombs().concat([{ id: data, at: at }]));
      push([{ id: data, data: {}, deleted: true, updatedAt: at }]);
      return;
    }
    if (kind === 'replace') {
      var now = data.list.map(function (m) { return m.id; });
      var gone = data.before.filter(function (id) { return now.indexOf(id) < 0; });
      setTombs(tombs().concat(gone.map(function (id) { return { id: id, at: at }; })));
      push(data.list.map(item).concat(gone.map(function (id) { return { id: id, data: {}, deleted: true, updatedAt: at }; })));
    }
  });

  global.PadelSync = { state: state, syncAll: syncAll, push: push };
})(window);
