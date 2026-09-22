/* ============================================================
   data.js · catálogos y configuración estática
   ÚNICA FUENTE DE VERDAD. Si una lista cambia, se cambia aquí
   y se propaga sola a registro, historial, análisis y briefing.
   ============================================================ */
(function (global) {
  'use strict';

  /* --- Arquetipos de rival. Se asignan de forma independiente
         a cada rival: se permite pareja mixta (A + B). --- */
  var ARCHETYPES = [
    { id: 'A',           key: 'A', label: 'Táctico experimentado',
      desc: 'Veterano, buen posicionamiento, juega con cabeza, concede pocos patrones fáciles.' },
    { id: 'B',           key: 'B', label: 'Joven agresivo',
      desc: 'Pegador, ritmo alto, menor lectura táctica.' },
    { id: 'otro',        key: '·', label: 'Otro',
      desc: 'No encaja en A ni en B.' },
    { id: 'por-definir', key: '?', label: 'Por definir',
      desc: 'Todavía sin clasificar.' }
  ];

  /* --- Estado del partido --- */
  var MATCH_STATUS = [
    { id: 'normal',   label: 'Normal',   needsSets: true  },
    { id: 'wo',       label: 'WO',       needsSets: false },
    { id: 'abandono', label: 'Abandono', needsSets: false },
    { id: 'otro',     label: 'Otro',     needsSets: false, allowsNote: true }
  ];

  /* --- Patrones observados del rival. Máximo 3 por partido.
         Describen comportamiento observable, no interpretación. --- */
  var PATTERNS = [
    { id: 'centro',        label: 'Juega mucho al centro' },
    { id: 'globo',         label: 'Busca el globo constantemente' },
    { id: 'presion-red',   label: 'Presiona desde la red' },
    { id: 'ataca-globo',   label: 'Ataca después del globo' },
    { id: 'castiga-reves', label: 'Castiga al jugador de revés' },
    { id: 'cambia-ritmo',  label: 'Cambia el ritmo para descolocar' },
    { id: 'evita-pared',   label: 'Juega poco las paredes' },
    { id: 'se-queda-fondo',label: 'Se queda en fondo, no sube a red' },
    { id: 'no-suelta-red', label: 'Gana la red y no la suelta' },
    { id: 'arriesga',      label: 'Arriesga mucho: define pronto, falla pronto' },
    { id: 'otro',          label: 'Otro', freeText: true }
  ];

  /* --- Qué funcionó (selección múltiple) --- */
  var WORKED_OPTIONS = [
    { id: 'globo-red',     label: 'Globo para recuperar la red' },
    { id: 'paciencia',     label: 'Paciencia, construir el punto' },
    { id: 'centro',        label: 'Jugar al centro de la pareja' },
    { id: 'rival-debil',   label: 'Atacar al rival más débil' },
    { id: 'subir-juntos',  label: 'Subir juntos a la red' },
    { id: 'bajar-ritmo',   label: 'Bajar el ritmo' },
    { id: 'salida-pared',  label: 'Salida de pared limpia' },
    { id: 'comunicacion',  label: 'Comunicación con mi pareja' }
  ];

  /* --- Qué no funcionó (selección múltiple) --- */
  var NOT_WORKED_OPTIONS = [
    { id: 'precipitacion', label: 'Precipitación, definir demasiado pronto' },
    { id: 'quedarse-fondo',label: 'Quedarnos en fondo, regalar la red' },
    { id: 'globo-corto',   label: 'Globo corto o mal ejecutado' },
    { id: 'no-forzados',   label: 'Errores no forzados en bolas fáciles' },
    { id: 'mala-com',      label: 'Mala comunicación, bolas al medio' },
    { id: 'entrar-frio',   label: 'Entrar frío al partido' },
    { id: 'insistir',      label: 'Insistir en un plan que no daba resultado' },
    { id: 'bajon',         label: 'Bajón físico o mental a media partida' }
  ];

  /* --- Estados físico y mental: escala de tres, a propósito --- */
  var LEVELS = [
    { id: 'malo',   label: 'Malo' },
    { id: 'normal', label: 'Normal' },
    { id: 'bueno',  label: 'Bueno' }
  ];

  /* --- Reglas del sistema --- */
  var RULES = {
    storageKey: 'padel-scouting.v1',
    backupVersion: 1,
    maxPatterns: 3,
    /* Formato de la liga: 2 sets normales + super tie-break a 10,
       sin exigir diferencia de 2. El super TB no suma a juegos totales. */
    normalSets: 2,
    superTieBreakTarget: 10,
    maxGamesPerSet: 7,
    maxGameInSet: 13,
    /* Muestra: por debajo de minSample no se muestra porcentaje.
       Entre minSample y goodSample se muestra con aviso. */
    minSample: 5,
    goodSample: 10
  };

  function findById(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function labelOf(list, id) {
    var item = findById(list, id);
    return item ? item.label : id;
  }

  global.PadelData = {
    ARCHETYPES: ARCHETYPES,
    MATCH_STATUS: MATCH_STATUS,
    PATTERNS: PATTERNS,
    WORKED_OPTIONS: WORKED_OPTIONS,
    NOT_WORKED_OPTIONS: NOT_WORKED_OPTIONS,
    LEVELS: LEVELS,
    RULES: RULES,
    findById: findById,
    labelOf: labelOf
  };
})(window);
