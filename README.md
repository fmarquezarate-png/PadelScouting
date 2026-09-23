# PADEL SCOUTING

Sistema personal de scouting y coaching de pádel para Fran.
Aplicación web **mobile-first**, sin backend, sin login, sin instalación.

> Cada partido alimenta datos. Los datos alimentan la estrategia del siguiente partido.
>
> `JUGAR → REGISTRAR → ACUMULAR → ANALIZAR → PREPARAR → JUGAR`

---

## Qué es

Cuatro pantallas y un único objetivo: que registrar un partido cueste **menos de 2 minutos** desde el
móvil, sentado en el banquillo, y que con el tiempo esos registros se conviertan en decisiones tácticas.

| Pantalla | Para qué |
|---|---|
| **La pista** | Inicio. Una pista de pádel que es el menú: tocas una zona y la bola vuela hasta ella. Puesto animado, forma y accesos. |
| **Nuestra temporada** | Números, escalera animada (5 métricas), mes a mes, acantilado, todos los partidos, rivales y techo. |
| **La liga** | Clasificación general ordenable, explorador de cualquier pareja y carga de datos. |
| **Crónica** | Tres actos, Ernesto & Jordi, izquierda y derecha, los dos niveles del club. |
| **Rival** | Eliges la pareja que te toca y salen proyección, historial directo, comparativa y lectura. |
| **Registrar** | Formulario rápido post-partido. |
| **Historial** | Tarjeta por partido, con filtros por rival, arquetipo, resultado y fecha. |
| **Análisis** | Win rate por arquetipo, juego medio de lectura, evolución temporal. |
| **Briefing** | Eliges el arquetipo esperado → máximo 3 bullets accionables antes de jugar. |

La fuente de verdad funcional es [`PROJECT_SPEC.md`](PROJECT_SPEC.md).
El historial de cambios está en [`CHANGELOG.md`](CHANGELOG.md).

## Cómo ejecutarlo

No hay que instalar ni compilar nada.

**Opción 1 — abrir el archivo directamente**
Haz doble clic en `index.html`. Se abre en el navegador y funciona.

**Opción 2 — servidor local** (recomendado si algo no carga bien)

```bash
cd PadelScouting
python3 -m http.server 8000
```

Luego abre `http://localhost:8000` en el navegador.

**Opción 3 — en el móvil**
Publica la carpeta en GitHub Pages, Netlify o Vercel y añade la URL a la pantalla de inicio del
teléfono. Así se abre como si fuera una app.

> ⚠️ Los datos viven en el navegador donde registras. Si registras en el móvil y luego abres la web
> en el ordenador, **no verás los mismos partidos**: hay que mover los datos con export/import.

## Dónde se guardan los datos

En el `localStorage` del navegador, bajo la clave `padel-scouting.v1`. Eso significa:

- Los datos siguen ahí aunque cierres el navegador o apagues el móvil.
- **No** se sincronizan entre dispositivos.
- Si borras los datos de navegación / caché del sitio, se borran los partidos.

Por eso el backup no es opcional.

## Backup y restauración

**Exportar (guardar copia):**

1. Entra en **Historial** y baja hasta la tarjeta *Datos*.
2. Pulsa *Exportar JSON*.
3. Se descarga un archivo `.json`. Guárdalo en Drive, en el correo, donde quieras.

**Importar (restaurar o mover a otro dispositivo):**

1. En esa misma tarjeta, pulsa *Importar JSON*.
2. Elige el archivo `.json`.
3. La app valida el archivo y **pide confirmación** antes de reemplazar lo que tengas.

Formato del backup:

```json
{ "version": 1, "exportedAt": "2026-09-22T10:00:00.000Z", "matches": [] }
```

Recomendación: exportar una vez al mes o después de cada jornada de liga.

## Arquitectura

```
PadelScouting/
├── index.html          estructura, navegación, carga de recursos
├── manifest.webmanifest  para instalarla como app en el móvil
├── assets/             escudo del club: favicon, iconos de app y logo
├── css/
│   └── styles.css      variables, componentes, responsive
├── js/
│   ├── liga-parser.js  lee la clasificación de la liga (navegador y Node)
│   ├── liga.js         motor: rating, simulación y calibración
│   ├── db.js           lectura desde Supabase con caché local
│   ├── views-liga.js   pantalla Rival y carga de datos
│   ├── views-temporada.js  Nuestra temporada (secciones 01–06)
│   ├── views-general.js    La pista (inicio), La liga y Crónica
│   ├── data.js         catálogos (arquetipos, patrones, funcionó, no funcionó, estados)
│   ├── storage.js      leer/guardar/editar/borrar · export · import · validación
│   ├── analysis.js     win rate, medias, evolución, muestra insuficiente
│   ├── briefing.js     reglas de briefing por arquetipo
│   └── app.js          navegación, render, eventos, formularios
├── PROJECT_SPEC.md     qué construimos y por qué
├── README.md           cómo funciona y cómo trabajar con él
└── CHANGELOG.md        qué ha cambiado
```

Separación de responsabilidades: **UI → lógica → datos**. Nada de meter toda la app en `app.js`, y los
catálogos en un solo sitio (`data.js`) para que no haya dos listas de patrones distintas conviviendo.

Sin frameworks, sin build, sin dependencias: HTML + CSS + JavaScript plano. Es suficiente y evita que
el proyecto se vuelva difícil de mantener.

## El motor de proyección

Hereda la estructura del motor predictivo ya validado: fuerzas → distribución → simulación →
derivados → **calibración**.

1. Cada pareja tiene un rating que parte de su grupo de entrada y se mueve partido a partido.
2. La diferencia de rating se convierte en probabilidad de ganar **un juego**, con una escala
   ajustada contra los partidos reales de la liga.
3. Se simulan 4.000 partidos (sets a 6 con tie-break, super tie-break a 10).
4. Todo lo que ves —probabilidad de ganar, reparto 2-0/2-1/1-2/0-2, juegos esperados— sale de
   esa misma simulación. Nunca hay dos cálculos en paralelo.
5. El acierto se mide contra los partidos ya jugados y **se publica en la propia app**.

Con los datos del primer semestre el motor acierta quién gana el **61,3%** de las veces (moneda
al aire: 50%). Es una ayuda para preparar el partido, no un pronóstico fiable, y la app lo dice.

> Un detalle que costó encontrar: en la tabla de la liga, el equipo listado primero gana el 89,4%
> de los partidos. Ese orden depende del propio resultado, así que no mide nada. La calibración se
> hace en orientación neutra para no engañarse con ese 89%.

## Alcance de V1

**Formato de partido:** al mejor de 3, con dos sets normales y super tie-break a 10 como tercero.
El super tie-break no cuenta como juegos.

**Incluye:** registro rápido, persistencia local, edición, historial con filtros, análisis por arquetipo
con protección ante muestras pequeñas, briefing de 3 bullets, export/import JSON.

**No incluye (decidido explícitamente):** backend, login, multiusuario, predicción de resultados, IA
generativa de análisis, tracking punto a punto, estadísticas de cada golpe, ratings avanzados.

## Fases futuras

- **V2** — análisis por patrón, evolución de patrones, recomendaciones por frecuencia, briefing adaptativo.
- **V3** — rating por faceta (saque/resto, red/fondo), modelo de pareja, motor predictivo.

Ninguna de las dos se construye hasta que haya suficientes partidos acumulados para justificarla.
Primero datos, después modelo.

## Cómo trabajar en el repo

- Rama principal: `main`. Los cambios relevantes van por PR.
- Cada PR actualiza `CHANGELOG.md` y la documentación que corresponda.
- Toda revisión termina declarando qué se verificó y qué no.
