# PADEL SCOUTING — Especificación funcional (fuente de verdad)

**Propietario:** Fran
**Versión:** V1
**Estado:** criterios funcionales cerrados · implementación en desarrollo
**Tipo:** aplicación web mobile-first, sin backend

---

## 1. Propósito

Convertir cada partido de liga en datos útiles para mejorar la estrategia del siguiente partido.

Ciclo fundamental del producto:

```
JUGAR → REGISTRAR → ACUMULAR → ANALIZAR → PREPARAR → JUGAR
```

Esto **no** es un dashboard deportivo genérico, ni un registro exhaustivo del partido, ni una app de
estadísticas profesionales. Es un sistema personal de aprendizaje.

## 2. Principio fundamental: la fricción es el enemigo

La captura post-partido debe poder hacerse en **≈2 minutos o menos**, desde el móvil, sentado en el
banquillo justo después de jugar, sin ordenador, sin textos largos y sin recordar demasiados detalles.

Es preferible tener **menos datos registrados de forma consistente** que muchos datos registrados
durante tres jornadas y abandonados después.

## 3. Arquetipos de rival

Cuatro valores posibles, asignados **de forma independiente a cada rival** (se permite pareja mixta):

| Valor | Nombre | Definición |
|---|---|---|
| `A` | Táctico experimentado | Veterano, buen posicionamiento, juega con cabeza, lee el partido, concede pocos patrones fáciles. Gana posiciones antes que puntos espectaculares. |
| `B` | Joven agresivo | Joven, pegador, ritmo alto, menor lectura táctica. |
| `otro` | Otro | No encaja en A ni B. |
| `por-definir` | Por definir | Aún sin clasificar. |

### Hipótesis de trabajo (no verdades eternas)

- **A es el perfil que más le cuesta a Fran.** Le gana por colocación y lectura más que por potencia;
  Fran puede entrar incómodo al partido desde el inicio.
- **Contra B, Fran sufre el arranque pero tras ~3 juegos lee el patrón** y puede dar la vuelta al partido.
- **Fortaleza de Fran:** lectura del rival a media partida.
  **Vulnerabilidad:** rivales sin patrones fáciles de leer que ganan posición.

Si los datos contradicen estas hipótesis, **las hipótesis cambian**, no los datos.

## 4. Justificación de cada campo

Un campo solo existe si: (1) ayuda a entender al rival, (2) ayuda a entender el rendimiento propio,
(3) ayuda a detectar patrones, (4) ayuda a preparar futuros partidos, o (5) permite validar o refutar
las hipótesis actuales.

Regla de captura para cada campo: *"¿Fran puede responder esto en pocos segundos después de un partido?"*
Si no, se reconsidera el campo.

---

## 5. Estructura de la aplicación

Cuatro áreas, navegación inferior fija en móvil, en este orden:

1. **Registrar** ← pantalla inicial
2. **Historial**
3. **Análisis**
4. **Briefing**

Curva de complejidad intencional: Registro (extremadamente simple) → Historial (media) →
Análisis (más sofisticado) → Briefing (extremadamente simple otra vez).

### 5.1. Registro rápido

Pantalla más importante del producto. Prioriza botones, chips, selects y valores predefinidos.
El texto libre es opcional y corto.

Campos:

| Campo | Tipo | Reglas |
|---|---|---|
| Fecha | date | Autocompletada con hoy, editable |
| Rival 1 / Rival 2 | texto libre | Con sugerencias derivadas de partidos previos |
| Arquetipo rival 1 / rival 2 | A · B · Otro · Por definir | Independientes entre sí |
| Estado del partido | Normal · WO · Abandono · Otro | "Otro" permite aclaración breve |
| Resultado | sets (propios vs rivales) | Sets ganados, resultado y juegos totales se **calculan** |
| Juego de lectura | "No lo leí" o nº de juego | Opcional |
| Patrones observados | lista cerrada + "Otro" | **Máximo 3** |
| Qué funcionó | selección múltiple | Lista cerrada |
| Qué no funcionó | selección múltiple | Lista cerrada |
| Estado físico | Malo · Normal · Bueno | Escala de 3, no 1–10 |
| Estado mental | Malo · Normal · Bueno | Escala de 3 |
| Notas de la pareja | texto libre corto | Opcional |

Tras guardar: confirmación + resumen inmediato + acciones "Editar" y "Registrar otro".

### 5.2. Historial

Una **tarjeta por partido** (nunca una tabla tipo Excel en móvil) mostrando fecha, rivales, resultado,
arquetipos e información relevante. Filtros por resultado, arquetipo, rival y fecha.

### 5.3. Análisis

- **Win rate por arquetipo** (A · B · Otro · Por definir).
  Un partido cuenta **una sola vez** por arquetipo aunque los dos rivales compartan arquetipo.
- **Juego medio de lectura**, excluyendo los partidos marcados "No lo leí", mostrando siempre el
  número de observaciones usadas.
- **Evolución temporal** de resultados, rendimiento por arquetipo y juego de lectura.
- **Protección ante muestra insuficiente:** si hay pocos datos se muestra "Datos insuficientes",
  nunca un porcentaje engañosamente preciso ni un 0 % vacío.

### 5.4. Briefing pre-partido

Se elige el arquetipo esperado y el sistema devuelve **máximo 3 bullets accionables**, legibles en el
coche antes de jugar. Nada de ensayos tácticos.

- **A:** no entrar incómodo, observar posicionamiento, identificar quién ocupa qué zona, no precipitarse,
  construir lectura temprana.
- **B:** controlar el arranque, observar patrones, identificar cómo se genera el ritmo, actuar tras la lectura.
- **Otro / Por definir:** principios generales (observar, no precipitarse, identificar patrones, adaptar con evidencia).

Con datos suficientes el briefing podrá incorporar información real: **datos → patrón → acción**
(no "datos → gráfico bonito"). Nunca inventar conclusiones tácticas sin datos que las sostengan.

---

## 6. Modelo de datos

```javascript
{
  id: "...",                    // identificador único, NUNCA la fecha
  date: "YYYY-MM-DD",
  rivals: [
    { name: "...", archetype: "A" },
    { name: "...", archetype: "B" }
  ],
  status: "normal",             // normal | wo | abandono | otro
  statusNote: "",               // solo si status === "otro"
  sets: [ { own: 6, opponent: 4 }, { own: 3, opponent: 6 } ],
  result: "win",                // win | loss | special (derivado de sets)
  totalGames: 27,               // derivado
  readGame: 3,                  // null = "no lo leí"
  patterns: ["..."],            // máx. 3
  worked: ["..."],
  notWorked: ["..."],
  physicalState: "normal",      // bad | normal | good
  mentalState: "good",
  partnerNotes: "...",
  createdAt: "...",
  updatedAt: "..."
}
```

La **fuente conceptual de verdad son los sets**; `result`, `totalGames` y sets ganados son datos
derivados (pueden almacenarse por comodidad, pero se recalculan desde los sets).

### Validaciones (útiles, no burocráticas)

- Un partido `normal` no se guarda sin resultado válido.
- Máximo 3 patrones.
- Sin sets parcialmente rellenados ni juegos absurdos.
- Importación rechazada si no cumple la estructura mínima.

### Persistencia y backup

- V1 usa `localStorage`, clave **`padel-scouting.v1`**. Sin backend, sin login, sin multiusuario.
- Export/import en JSON:

```json
{ "version": 1, "exportedAt": "2026-09-22T...", "matches": [] }
```

- La importación: leer → comprobar estructura → validar versión → validar que hay partidos →
  **confirmar con el usuario** → recién entonces reemplazar. Nunca borrar datos accidentalmente.
- La lista de rivales para autocompletar se deriva de los partidos guardados (no hay tabla aparte).

---

## 7. Arquitectura

No es obligatorio un único archivo HTML. Separación conceptual UI → lógica → datos.

```
PadelScouting/
├── index.html          estructura base, contenedores, navegación, carga de recursos
├── css/styles.css      variables, diseño, responsive, componentes, estados
├── js/data.js          catálogos: arquetipos, patrones, funcionó, no funcionó, estados
├── js/storage.js       cargar, guardar, editar, borrar, exportar, importar, validar
├── js/analysis.js      win rate, medias, agrupaciones, evolución, muestra insuficiente
├── js/briefing.js      reglas de briefing por arquetipo
├── js/app.js           navegación, render, eventos, formularios
├── README.md           cómo funciona y cómo trabajar con él
├── PROJECT_SPEC.md     qué construimos y por qué (este archivo)
└── CHANGELOG.md        qué ha cambiado
```

No construir todo dentro de `app.js`. Los catálogos (`ARCHETYPES`, `PATTERNS`, `WORKED_OPTIONS`,
`NOT_WORKED_OPTIONS`, `STATES`) viven en un solo sitio: `js/data.js`. **Una sola fuente de verdad.**

---

## 8. Diseño

Hereda la **filosofía visual** (no la lógica ni el dataset) del antiguo dashboard
`Analisis Liga de Padel (1).html`: premium, deportivo, limpio, funcional.

- Mobile-first. El escritorio debe verse bien pero no dicta el diseño.
- Fondo y paneles oscuros, texto claro, tonos neutros; verde/sage como color funcional,
  naranja para highlights, rojo/ladrillo para estados negativos. Sin abuso de color.
- Tipografía: una principal fuerte (Archivo) + una secundaria para datos (IBM Plex Mono / Sans).
- Componentes reutilizados en toda la app: cards, chips, botones, selects, inputs, badges, indicadores.
- Accesibilidad desde el principio: botones grandes, contraste, labels, estado seleccionado visible.
  Fran puede estar sentado en un banquillo, cansado: no asumir condiciones ideales.

**Prioridad:** legibilidad → velocidad de interacción → jerarquía → consistencia → estética.
La estética nunca perjudica la captura.

### Errores y estados vacíos

- Errores claros, breves y accionables ("Completa el resultado del partido antes de guardar"),
  nunca errores técnicos crudos.
- Cada sección tiene estado vacío útil con una acción ("Todavía no hay partidos registrados" →
  "Registrar partido").

---

## 9. Reglas de desempate

| Tensión | Gana |
|---|---|
| Más información vs. menor fricción | **Menor fricción** |
| Precisión aparente vs. honestidad estadística | **Honestidad estadística** |
| Estética vs. velocidad de captura | **Velocidad de captura** |
| Narrativa bonita vs. lo que muestran los datos | **Los datos** |

Tono de coaching: honesto y directo. Nada de "¡vas mejorando!" si los datos no lo demuestran.

El sistema debe evolucionar de *"esto pasó"* → *"esto pasa"* → *"cuando esto pasa, hacé esto"*.

---

## 10. Alcance

### Cerrado para V1 (no reabrir salvo petición explícita de Fran)

Cuatro áreas · Registro como pantalla inicial · navegación inferior en móvil · captura ≤2 min ·
arquetipos A/B/Otro/Por definir · arquetipos independientes por rival · pareja mixta permitida ·
registro por sets · cálculo automático del resultado · estados normal/WO/abandono/otro · lectura
opcional · máximo 3 patrones · selección múltiple en funcionó/no funcionó · estados físico y mental
de 3 niveles · notas opcionales · historial por tarjetas · filtros · persistencia local · export/import ·
análisis por arquetipo · promedio de juego de lectura · evolución temporal · protección ante muestras
insuficientes · briefing de máximo 3 bullets · mobile-first · estética premium/deportiva · arquitectura
modular · sin backend · sin predicción · sin modelo avanzado de pareja · sin tracking punto a punto ·
sin IA inventada.

### Puede evolucionar con uso real

Lista exacta de patrones · lista exacta de "funcionó" · lista exacta de "no funcionó" · microcopy ·
orden visual de algunos controles · reglas de briefing · umbral de muestra suficiente · visualizaciones ·
detalles de diseño.

### Descartado en V1

Single-file obligatorio · backend · login · multiusuario · predicción de resultados · IA generativa de
análisis · tracking punto a punto · estadísticas de cada golpe · velocidad de saque · winners/errores no
forzados detallados · mapa de calor · rating Elo o por golpe · análisis biomecánico · wearables ·
modelo individual/pareja avanzado · dashboards gigantes.

### Futuro (solo cuando los datos lo justifiquen)

- **V2:** análisis por patrón, evolución de patrones, recomendaciones por frecuencia, comparación de
  acciones, análisis profundo de A y B, briefing adaptativo.
- **V3:** rating por faceta (saque/resto, red/fondo), modelo de pareja, motor predictivo
  (`Resultado → Juegos → Rating → Facetas → Distribución → Predicción`).

Secuencia correcta: `Datos → Calidad → Volumen → Patrones → Validación → Modelo`.
Nunca `Modelo → buscar datos que lo justifiquen`.

---

## 11. Orden de implementación

```
1. Base HTML          5. Historial        9.  README
2. Sistema visual     6. Análisis         10. CHANGELOG
3. Registro rápido    7. Briefing         11. QA
4. Persistencia       8. Backup
```

El registro tiene prioridad sobre el dashboard. No construir todo y descubrir después que registrar
es incómodo.

## 12. Métricas de éxito

1. **¿Fran registra realmente los partidos?** Si registrar tarda 2 minutos, el producto funciona.
   Si tarda 8, está fallando aunque sea espectacular visualmente.
2. **¿Los datos generan decisiones tácticas útiles?** El ciclo Registro → Análisis → Briefing debe cerrarse.

## 13. Proceso de trabajo

- Cada PR: un objetivo claro, un conjunto coherente de cambios, documentación actualizada,
  entrada en `CHANGELOG.md`, sin cambios no relacionados, verificable.
- Rama principal: `main`.
- Toda revisión termina con `## ✅ Verificado` y `## ⚠️ No pude verificar`.
  Nunca afirmar que algo funciona sin haberlo comprobado.
- **Anti-loop:** reproducir → hipótesis → un cambio → comprobar → evaluar. Si el mismo síntoma
  persiste dos veces, parar los parches, volver al diagnóstico y proponer un camino nuevo.

---

*PADEL SCOUTING · JUGAR → REGISTRAR → ACUMULAR → ANALIZAR → PREPARAR → JUGAR*
