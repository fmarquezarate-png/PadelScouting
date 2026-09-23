# Base de datos (Supabase)

Proyecto `PadelScouting`, región `eu-central-1`.

## Idea del modelo

Dos capas sobre el mismo partido:

1. **La liga** — lo objetivo: quién jugó, resultado, grupo y posición. Viene de la clasificación
   oficial y no se escribe a mano.
2. **El scouting** — lo subjetivo: patrones del rival, qué funcionó, estado. Se añade encima de un
   partido que ya existe.

Así un resultado no se teclea dos veces, y el registro post-partido solo pide lo que la liga no sabe.

La unidad de análisis es el **jugador**, no la pareja: `teams` son dos `players`, de modo que se
pueden seguir los partidos de una persona aunque cambie de compañero.

## Tablas

| Tabla | Qué guarda |
|---|---|
| `seasons` | Semestres de liga |
| `players` | Personas. `is_me` marca a Fran |
| `teams` | Pareja = dos jugadores |
| `league_months` · `league_groups` | Estructura de la liga cada mes |
| `group_standings` | Posición de cada pareja dentro de su grupo |
| `matches` | Partidos. `sets` es la fuente de verdad; el resto es derivado |
| `player_archetypes` | Arquetipo A/B/Otro/Por definir **por persona** |
| `scouting` | Capa subjetiva, una fila por partido |
| `league_imports` | Texto crudo de cada carga, para poder reprocesar |

### Por qué el arquetipo va en la persona

Clasificas a un rival una vez y todos sus partidos, pasados y futuros, lo heredan. Es lo que permite
hacer scouting retroactivo de una temporada entera en minutos en lugar de partido a partido.

### Escalera de la liga

No se guarda el puesto: se calcula. `puesto = equipos en los grupos por encima + posición en el grupo`,
igual que en el dashboard del primer semestre.

## Nombres e identidad

La liga corta los nombres a 10 caracteres, y no siempre: el mismo jugador aparece como
`Carla Caye` en enero y `Carla Cayero` en julio. Por eso:

- Una **pareja** se identifica por sus dos jugadores (`teams_players_unique` sobre el par
  ordenado), nunca por su etiqueta de texto.
- `resolve_player()` une un nombre recortado con su versión larga **solo** cuando el corto mide
  exactamente 10 caracteres y es el principio del largo. `Jaume Bal` (9 letras, nombre completo)
  no se une con `Jaume Bale`: serían dos personas y eso no se adivina.
- La app enseña cada unión en la vista previa, antes de guardar.

## Seguridad

RLS activo en todas las tablas: **lectura pública**, escritura solo con sesión autenticada.
El texto crudo de `league_imports` solo lo ve quien puede escribir.

## Competiciones

`seasons.kind` distingue `masculina` de `mixta`. Los ratings se calculan **por separado** en cada
una: mezclar formatos distintos ensuciaría las proyecciones. La capa de scouting, en cambio, es del
jugador y vale para las dos.

## Carga de datos

`ingest_league_matches(jsonb)` inserta partidos derivando siempre sets ganados, juegos y super
tie-break desde el marcador, para que no haya dos sitios donde se calcule distinto.

`ingest_league(jsonb)` carga una clasificación entera en una transacción: jugadores, parejas, meses,
grupos, posiciones y partidos, resolviendo todo por nombre. Es **idempotente** —cargar el mismo mes
dos veces no duplica nada— y guarda el texto crudo en `league_imports` para poder reprocesar sin
volver a la web. Solo la puede ejecutar una sesión autenticada.
El identificador se guarda en minúsculas y **pertenece a una sola competición**: si ya existe con
otra (`2026-s1` es masculina), la carga se rechaza en vez de mezclar datos. Supabase bloquea los
`DELETE` sin `WHERE` que llegan desde la API, así que la función no usa ninguno
(migración `ingest_league_safe_delete_and_kind_guard`).

`list_seasons()` y `get_league_snapshot(slug)` son de lectura pública.

El primer semestre de 2026 se cargó desde `legacy/liga-2026-s1.txt` con `js/liga-parser.js`.
