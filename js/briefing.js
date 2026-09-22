/* ============================================================
   briefing.js · plan de partido, máximo 3 bullets
   Empieza con las hipótesis ya establecidas y las va sustituyendo
   por datos reales según se acumulan partidos. Nunca inventa una
   conclusión táctica que los datos no sostengan.
   ============================================================ */
(function (global) {
  'use strict';

  var D = global.PadelData;
  var A = global.PadelAnalysis;
  var R = D.RULES;

  /* --- Bullets de partida: hipótesis de trabajo, no verdades. --- */
  var BASE = {
    'A': [
      'Primeros juegos sin acelerar: gana la posición antes de buscar la definición.',
      'Mira dónde se coloca cada uno: quién cubre el centro y quién sale a la pared.',
      'No regales la red. Si no puedes subir, globo largo y vuelve a construir.'
    ],
    'B': [
      'Sobrevive al arranque: bola alta y profunda, déjale enseñar el patrón.',
      'Hasta el juego 3 o 4, observa de dónde sale su ritmo: saque, bandeja o remate.',
      'Cuando lo tengas leído, ataca ese patrón. Antes no.'
    ],
    'otro': [
      'Sin plan previo: los primeros juegos son para observar, no para resolver.',
      'Prueba las dos diagonales y mira cuál falla antes.',
      'Si aparece un patrón claro, regístralo al acabar: el próximo briefing saldrá de ahí.'
    ],
    'por-definir': [
      'Sin plan previo: los primeros juegos son para observar, no para resolver.',
      'Prueba las dos diagonales y mira cuál falla antes.',
      'Clasifica al rival en cuanto lo veas jugar: eso es lo que hará útil el siguiente briefing.'
    ]
  };

  var CONTEXT = {
    'A': 'Es el perfil que más te cuesta: te gana por colocación y lectura, no por pegada.',
    'B': 'Sueles sufrir el arranque y darle la vuelta cuando lo lees.',
    'otro': 'Perfil sin hipótesis previa.',
    'por-definir': 'Perfil todavía sin clasificar.'
  };

  function bullet(text, source, fromData) {
    return { text: text, source: source || null, fromData: !!fromData };
  }

  /* Construye el briefing combinando datos reales (prioridad) con
     las hipótesis de partida, y corta siempre en 3. */
  function build(archetypeId, rawMatches) {
    var matches = A.decorateAll(rawMatches || []);
    var base = BASE[archetypeId] || BASE['por-definir'];
    var bullets = [];

    var loss = A.lossSignal(matches, archetypeId);
    if (loss) {
      bullets.push(bullet(
        'Evita ' + lower(loss.label) + '. Es lo que se repite cuando pierdes contra este perfil.',
        loss.count + ' de ' + loss.losses + ' derrotas contra este perfil',
        true));
    }

    var read = A.readingStats(matches, function (m) {
      return (m.rivals || []).some(function (r) { return r && r.archetype === archetypeId; });
    });
    if (read.n >= R.minSample && read.average != null) {
      var g = Math.round(read.average);
      bullets.push(bullet(
        'De media lo lees sobre el juego ' + g + '. Hasta ahí, plan conservador: construir y observar.',
        read.n + ' partidos con lectura registrada',
        true));
    }

    var win = A.winSignal(matches, archetypeId);
    if (win) {
      bullets.push(bullet(
        'Lo que sí funciona: ' + lower(win.label) + '.',
        win.count + ' de ' + win.wins + ' victorias contra este perfil',
        true));
    }

    base.forEach(function (t) { bullets.push(bullet(t, 'hipótesis de partida', false)); });

    return {
      archetype: D.findById(D.ARCHETYPES, archetypeId),
      context: CONTEXT[archetypeId] || '',
      bullets: bullets.slice(0, 3),
      dataBullets: bullets.slice(0, 3).filter(function (b) { return b.fromData; }).length,
      sample: sampleFor(matches, archetypeId)
    };
  }

  function sampleFor(matches, archetypeId) {
    var played = matches.filter(function (m) {
      return m.isNormal && m.result &&
        (m.rivals || []).some(function (r) { return r && r.archetype === archetypeId; });
    }).length;
    return { played: played, level: A.sampleLevel(played), note: A.sampleNote(played) };
  }

  function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

  global.PadelBriefing = { build: build, BASE: BASE };
})(window);
