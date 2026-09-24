/* ============================================================
   storage.js · persistencia, validación y backup
   Sin backend. Todo vive en localStorage bajo padel-scouting.v1.
   Toda lectura/escritura pasa por aquí: si algún día cambia el
   sistema de almacenamiento, solo cambia este archivo.
   ============================================================ */
(function (global) {
  'use strict';

  var R = global.PadelData.RULES;
  var D = global.PadelData;

  /* ---------- utilidades ---------- */

  function newId() {
    /* Identificador único e independiente de la fecha: permite
       editar, ordenar, borrar e importar sin colisiones. */
    return 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function today() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function available() {
    try {
      var k = '__padel_test__';
      global.localStorage.setItem(k, '1');
      global.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  /* ---------- lectura / escritura ---------- */

  var memory = [];   // respaldo si el navegador bloquea localStorage

  function load() {
    if (!available()) return memory.slice();
    try {
      var raw = global.localStorage.getItem(R.storageKey);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      var list = Array.isArray(parsed) ? parsed : parsed.matches;
      if (!Array.isArray(list)) return [];
      return list.filter(isPlausibleMatch);
    } catch (e) {
      return [];
    }
  }

  function persist(list) {
    memory = list.slice();
    if (!available()) return false;
    try {
      global.localStorage.setItem(R.storageKey, JSON.stringify({
        version: R.backupVersion,
        savedAt: new Date().toISOString(),
        matches: list
      }));
      return true;
    } catch (e) { return false; }
  }

  function sorted(list) {
    return list.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
    });
  }

  /* Quien quiera enterarse de los cambios (la sincronización con la cuenta). */
  var listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function notify(kind, data) {
    listeners.forEach(function (fn) { try { fn(kind, data); } catch (e) {} });
  }

  function all() { return sorted(load()); }

  function get(id) {
    var list = load();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function save(match) {
    var list = load();
    var now = new Date().toISOString();
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === match.id) { idx = i; break; }
    if (idx >= 0) {
      match.createdAt = list[idx].createdAt || now;
      match.updatedAt = now;
      list[idx] = match;
    } else {
      if (!match.id) match.id = newId();
      match.createdAt = now;
      match.updatedAt = now;
      list.push(match);
    }
    persist(list);
    notify('save', match);
    return match;
  }

  function remove(id) {
    var list = load().filter(function (m) { return m.id !== id; });
    persist(list);
    notify('remove', id);
  }

  /* ---------- nombres de rivales para autocompletar ----------
     Se derivan de los partidos guardados: no hace falta una tabla
     aparte de jugadores. */
  function rivalNames() {
    var seen = {};
    load().forEach(function (m) {
      (m.rivals || []).forEach(function (r) {
        var n = (r && r.name || '').trim();
        if (n) seen[n.toLowerCase()] = n;
      });
    });
    return Object.keys(seen).map(function (k) { return seen[k]; })
      .sort(function (a, b) { return a.localeCompare(b, 'es'); });
  }

  /* --- El arquetipo usado la última vez con este rival, para
         proponerlo al volver a escribir su nombre. --- */
  function lastArchetypeFor(name) {
    var target = (name || '').trim().toLowerCase();
    if (!target) return null;
    var list = sorted(load()).reverse();
    for (var i = 0; i < list.length; i++) {
      var rivals = list[i].rivals || [];
      for (var j = 0; j < rivals.length; j++) {
        if ((rivals[j].name || '').trim().toLowerCase() === target) return rivals[j].archetype;
      }
    }
    return null;
  }

  /* ---------- validación ---------- */

  function isPlausibleMatch(m) {
    return !!(m && typeof m === 'object' && m.id && typeof m.date === 'string' &&
      Array.isArray(m.rivals) && Array.isArray(m.sets));
  }

  function isInt(v, lo, hi) {
    return typeof v === 'number' && isFinite(v) && v % 1 === 0 && v >= lo && v <= hi;
  }

  /* Devuelve una lista de mensajes en castellano llano.
     Sin mensajes técnicos: el usuario está en un banquillo. */
  function validate(match) {
    var errors = [];
    var status = D.findById(D.MATCH_STATUS, match.status);

    if (!match.date || !/^\d{4}-\d{2}-\d{2}$/.test(match.date)) {
      errors.push('Revisa la fecha del partido.');
    }
    if (!status) errors.push('Elige el estado del partido.');

    if (status && status.needsSets) {
      var sets = match.sets || [];
      if (sets.length < R.normalSets) {
        errors.push('Completa el resultado: hacen falta al menos los dos primeros sets.');
      }
      sets.forEach(function (s, i) {
        var isSuper = i >= R.normalSets;
        var top = isSuper ? 40 : R.maxGamesPerSet;
        if (!isInt(s.own, 0, top) || !isInt(s.opponent, 0, top)) {
          errors.push('El set ' + (i + 1) + ' está a medias o tiene un resultado imposible.');
          return;
        }
        if (s.own === s.opponent) {
          errors.push('El set ' + (i + 1) + ' no puede acabar empatado.');
          return;
        }
        if (isSuper) {
          var win = Math.max(s.own, s.opponent);
          if (win !== R.superTieBreakTarget) {
            errors.push('El super tie-break lo gana quien llega a ' + R.superTieBreakTarget + '.');
          }
        } else if (Math.max(s.own, s.opponent) < 6) {
          errors.push('El set ' + (i + 1) + ' no está terminado: nadie llega a 6.');
        }
      });
      if (sets.length === R.normalSets && errors.length === 0) {
        var a = sets[0].own > sets[0].opponent;
        var b = sets[1].own > sets[1].opponent;
        if (a !== b) errors.push('Vais 1-1 en sets: falta el super tie-break.');
      }
    } else if (status && status.id !== 'normal') {
      if (match.result !== 'win' && match.result !== 'loss') {
        errors.push('Indica si el partido se ganó o se perdió.');
      }
    }

    if ((match.patterns || []).length > R.maxPatterns) {
      errors.push('Como mucho ' + R.maxPatterns + ' patrones por partido.');
    }
    if (match.readSet != null) {
      if (!isInt(match.readSet, 1, 3)) errors.push('El set de lectura no es válido.');
      if (match.readSet < 3 && !isInt(match.readGame, 1, R.maxGameInSet)) {
        errors.push('Indica en qué juego leíste al rival, o marca «No lo leí».');
      }
    }
    return errors;
  }

  /* ---------- export / import ---------- */

  function exportData() {
    return {
      version: R.backupVersion,
      exportedAt: new Date().toISOString(),
      matches: all()
    };
  }

  function exportFilename() {
    return 'padel-scouting-' + today() + '.json';
  }

  function download() {
    var blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = exportFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 400);
  }

  /* Lee y comprueba un backup SIN tocar los datos actuales.
     Reemplazar es un paso aparte que el usuario confirma. */
  function inspectBackup(text) {
    var data;
    try { data = JSON.parse(text); }
    catch (e) { return { ok: false, message: 'El archivo no es un backup válido de Padel Scouting.' }; }

    if (!data || typeof data !== 'object') {
      return { ok: false, message: 'El archivo no tiene el formato esperado.' };
    }
    if (data.version != null && Number(data.version) > R.backupVersion) {
      return { ok: false, message: 'Ese backup viene de una versión más nueva de la aplicación.' };
    }
    var list = Array.isArray(data) ? data : data.matches;
    if (!Array.isArray(list)) {
      return { ok: false, message: 'El archivo no contiene partidos.' };
    }
    var valid = list.filter(isPlausibleMatch);
    if (!valid.length) {
      return { ok: false, message: 'El archivo no contiene ningún partido reconocible.' };
    }
    return {
      ok: true,
      matches: valid,
      total: list.length,
      discarded: list.length - valid.length,
      exportedAt: data.exportedAt || null
    };
  }

  /* Reemplaza los datos actuales. Solo se llama tras confirmación. */
  function replaceAll(matches, quiet) {
    var before = load().map(function (m) { return m.id; });
    var clean = matches.filter(isPlausibleMatch).map(function (m) {
      if (!m.id) m.id = newId();
      return m;
    });
    persist(clean);
    if (!quiet) notify('replace', { list: clean, before: before });
    return clean.length;
  }

  function clear() {
    var before = load().map(function (m) { return m.id; });
    persist([]);
    notify('replace', { list: [], before: before });
  }

  global.PadelStorage = {
    newId: newId,
    today: today,
    available: available,
    all: all,
    get: get,
    save: save,
    remove: remove,
    rivalNames: rivalNames,
    lastArchetypeFor: lastArchetypeFor,
    validate: validate,
    exportData: exportData,
    exportFilename: exportFilename,
    download: download,
    inspectBackup: inspectBackup,
    replaceAll: replaceAll,
    clear: clear,
    onChange: onChange
  };
})(window);
