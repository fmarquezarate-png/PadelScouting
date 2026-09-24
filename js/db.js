/* ============================================================
   db.js · lectura de la liga desde Supabase
   Una sola llamada trae la temporada entera (unos 36 KB) y se
   guarda en el navegador: si estás sin cobertura en el club, la
   app sigue funcionando con lo último que descargó.
   La clave es la pública: solo permite leer. Escribir exige sesión.
   ============================================================ */
(function (global) {
  'use strict';

  var CFG = {
    url: 'https://etfsdoufdzibqlgpcdtx.supabase.co',
    key: 'sb_publishable_EMC-kHTVVDIMg0w7PIyCvw_-kxSH1Gk',
    season: '2026-s1',            /* temporada por defecto */
    seasonKey: 'padel-scouting.season.v1',
    seasonsKey: 'padel-scouting.seasons.v1',
    meKey: 'padel-scouting.me.v1',
    cacheKey: 'padel-scouting.liga.v3',   /* v3: septiembre del mixto pasa al S2 */
    maxAgeMinutes: 180
  };

  /* ---------- qué temporada estás mirando ---------- */
  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { global.localStorage.removeItem(k); } catch (e) {} }

  function currentSeason() { return lsGet(CFG.seasonKey) || CFG.season; }
  function setSeason(slug) { lsSet(CFG.seasonKey, slug); }
  function hasChosenSeason() { return !!lsGet(CFG.seasonKey); }

  /* Cada temporada con su copia en el móvil. La de por defecto conserva
     la clave de siempre para no perder lo ya descargado. */
  function cacheKey() {
    var s = currentSeason();
    return s === CFG.season ? CFG.cacheKey : CFG.cacheKey + ':' + s;
  }

  function rpcPublic(fn, args) {
    return global.fetch(CFG.url + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'apikey': CFG.key, 'Authorization': 'Bearer ' + CFG.key,
                 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  /* Lista de competiciones cargadas. Sin red, la última conocida. */
  function listSeasons() {
    var fallback = [{ slug: CFG.season, name: 'Temporada 2026 · primer semestre', kind: 'masculina' }];
    return rpcPublic('list_seasons').then(function (list) {
      if (Array.isArray(list) && list.length) { lsSet(CFG.seasonsKey, JSON.stringify(list)); return list; }
      return fallback;
    }).catch(function () {
      try { return JSON.parse(lsGet(CFG.seasonsKey)) || fallback; } catch (e) { return fallback; }
    });
  }

  /* ---------- quién eres ---------- */
  function myPlayer() {
    try { return JSON.parse(lsGet(CFG.meKey)); } catch (e) { return null; }
  }
  function rememberMe(p) {
    if (p && (p.label || p.category || p.isAdmin)) lsSet(CFG.meKey, JSON.stringify(p)); else lsDel(CFG.meKey);
  }
  /* Administrador = lo dice la base (tabla admins). Aquí solo sirve para enseñar
     u ocultar el cargador: la base rechaza igualmente a quien no lo sea. */
  function isAdmin() { var p = myPlayer(); return !!(p && p.isAdmin); }
  function fetchProfile() {
    return callAuthed('get_my_profile').then(function (p) { rememberMe(p); return p; });
  }
  /* Guarda solo los campos que se pasan: { label, category, playsMixed, defaultKind, avatar }. */
  function updateProfile(patch) {
    return callAuthed('update_my_profile', { patch: patch }).then(function (p) { rememberMe(p); return p; });
  }

  /* Todos los jugadores de todas las competiciones (para «¿quién eres?»). */
  function listPlayers() {
    return rpcPublic('list_players').catch(function () { return []; });
  }

  function saveProfile(label) {
    return callAuthed('set_my_profile_label', { p_label: label })
      .then(function (p) { rememberMe(p); return p; });
  }

  function readCache() {
    try {
      var raw = global.localStorage.getItem(cacheKey());
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.snapshot) return null;
      return parsed;
    } catch (e) { return null; }
  }

  function writeCache(snapshot) {
    try {
      global.localStorage.setItem(cacheKey(), JSON.stringify({
        savedAt: new Date().toISOString(), snapshot: snapshot
      }));
    } catch (e) { /* sin espacio o navegación privada: seguimos sin caché */ }
  }

  function minutesSince(iso) {
    var t = Date.parse(iso);
    if (!t) return Infinity;
    return (Date.now() - t) / 60000;
  }

  function isAll(slug) { return /^all:/.test(slug || ''); }

  function fetchSnapshot() {
    var slug = currentSeason();
    if (!isAll(slug)) return fetchOne(slug);
    /* «Todo el recorrido»: todas las temporadas de la competición, en orden. */
    var kind = slug.slice(4);
    return listSeasons().then(function (list) {
      var slugs = list.filter(function (x) { return x.kind === kind; })
        .map(function (x) { return x.slug; }).sort();
      if (!slugs.length) throw new Error('No hay temporadas de ' + kind);
      return Promise.all(slugs.map(fetchOne)).then(function (snaps) {
        return global.Liga.mergeSnapshots(snaps, kind);
      });
    });
  }

  function fetchOne(slug) {
    return global.fetch(CFG.url + '/rest/v1/rpc/get_league_snapshot', {
      method: 'POST',
      headers: {
        'apikey': CFG.key,
        'Authorization': 'Bearer ' + CFG.key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ season_slug: slug })
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  /* Devuelve { snapshot, from: 'red'|'cache', savedAt, error }.
     Nunca lanza: si falla la red y hay caché, se usa la caché. */
  function load(options) {
    var opts = options || {};
    var cached = readCache();
    var fresh = cached && minutesSince(cached.savedAt) < CFG.maxAgeMinutes;

    if (cached && fresh && !opts.force) {
      return Promise.resolve({ snapshot: cached.snapshot, from: 'cache', savedAt: cached.savedAt });
    }
    return fetchSnapshot().then(function (snapshot) {
      writeCache(snapshot);
      return { snapshot: snapshot, from: 'red', savedAt: new Date().toISOString() };
    }).catch(function (err) {
      if (cached) {
        return { snapshot: cached.snapshot, from: 'cache', savedAt: cached.savedAt, error: err };
      }
      return { snapshot: null, from: null, error: err };
    });
  }

  /* Llamada a una función de la base que requiere sesión. */
  function callAuthed(fn, args) {
    return global.PadelAuth.token().then(function (tok) {
      if (!tok) throw new Error('Necesitas iniciar sesión para esto.');
      return global.fetch(CFG.url + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: {
          'apikey': CFG.key,
          'Authorization': 'Bearer ' + tok,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(args || {})
      });
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error((data && (data.message || data.hint)) || ('Error ' + res.status));
        }
        return data;
      });
    });
  }

  function clearCache() {
    lsDel(cacheKey()); lsDel(CFG.seasonsKey);
  }

  global.PadelDB = {
    load: load, CFG: CFG, readCache: readCache,
    callAuthed: callAuthed, clearCache: clearCache,
    currentSeason: currentSeason, setSeason: setSeason, hasChosenSeason: hasChosenSeason, listSeasons: listSeasons,
    myPlayer: myPlayer, rememberMe: rememberMe, isAdmin: isAdmin, fetchProfile: fetchProfile, saveProfile: saveProfile,
    updateProfile: updateProfile, listPlayers: listPlayers
  };
})(window);
