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
    season: '2026-s1',
    cacheKey: 'padel-scouting.liga.v1',
    maxAgeMinutes: 180
  };

  function readCache() {
    try {
      var raw = global.localStorage.getItem(CFG.cacheKey);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.snapshot) return null;
      return parsed;
    } catch (e) { return null; }
  }

  function writeCache(snapshot) {
    try {
      global.localStorage.setItem(CFG.cacheKey, JSON.stringify({
        savedAt: new Date().toISOString(), snapshot: snapshot
      }));
    } catch (e) { /* sin espacio o navegación privada: seguimos sin caché */ }
  }

  function minutesSince(iso) {
    var t = Date.parse(iso);
    if (!t) return Infinity;
    return (Date.now() - t) / 60000;
  }

  function fetchSnapshot() {
    return global.fetch(CFG.url + '/rest/v1/rpc/get_league_snapshot', {
      method: 'POST',
      headers: {
        'apikey': CFG.key,
        'Authorization': 'Bearer ' + CFG.key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ season_slug: CFG.season })
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

  global.PadelDB = { load: load, CFG: CFG, readCache: readCache };
})(window);
