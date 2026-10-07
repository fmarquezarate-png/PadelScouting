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

`list_seasons()` y `get_league_snapshot(slug)` son de lectura pública. La foto de una temporada
trae solo las parejas que juegan en ella.

`profiles` guarda los datos de cada cuenta (una fila por cuenta, cada una solo ve la suya): su
jugador, categoría, si juega mixto, qué competición ver al abrir y su foto (JPEG ya reducido).
`get_my_profile()` y `update_my_profile(patch)` requieren sesión; `list_players()` es pública y
dice en qué competiciones aparece cada jugador.

**Nombre de la web y mes jugado**: `league_months.label` es el nombre que pone la web (con él
se emparejan las cargas) y `played_label`, si existe, el mes en que de verdad se jugó; la foto de
la temporada devuelve `played_label` cuando lo hay. En el mixto 2026 la web va un mes por delante.

**Meses**: un mes con nombre («Junio») se empareja por nombre con el que ya existe. La carga se
rechaza si intenta renombrar un mes existente o si pone a una pareja en otro grupo del que ya
tiene ese mes (migraciones `ingest_league_months_by_name` e `ingest_league_group_consistency_guard`). Competiciones admitidas:
`masculina`, `mixta`, `femenina`.

El primer semestre de 2026 se cargó desde `legacy/liga-2026-s1.txt` con `js/liga-parser.js`.

## Este mes (por cuenta, con RLS)

- `rounds`: la ronda en curso de cada temporada (etiqueta, mes de inicio, grupo, tu pareja, origen
  `liga` / `prevision` / `manual`). `start_round(payload)` cierra la anterior y crea la nueva con sus
  rivales; `keep_round(id)` la deja un mes más («sigue la misma ronda»).
- `fixtures`: cada partido de la ronda (rival, fecha y hora, estado, sets desde nuestro lado,
  registro enganchado). `update_fixture(id, patch)` cambia solo lo que viene.
- `scouting_records`: el registro de scouting de cada cuenta. `list_my_records()` y
  `push_my_records(items)` (el más reciente gana; los borrados viajan como `deleted`).

## Nivel del club (por cuenta, con RLS)

- `club_levels (user_id, who, played_at, won, level)`: cada fila del «Histórico del nivel de
  juego» del club. `who` = `me` o `partner:<competición>` (tu pareja de masculino no es la de mixto).
- `club_rankings (user_id, who, ranking, name)`: el «Ranking: N» y el nombre de la pareja.
- RPC `get_my_club_levels()` → `{ me: {ranking, name, rows: [[fecha, ganado, nivel]]}, 'partner:masculina': … }`.
- RPC `import_club_levels(p_who, p_ranking, p_name, p_rows)`: upsert por fecha y hora; devuelve
  `{added, updated, total}`. Las filas «Restaurar por corrección» se quitan antes, en `js/club.js`.
- La fecha y hora de la web se guardan tal cual (como UTC) para que no se muevan.

## Administradores

- `admins (user_id)`: quién puede escribir la liga. `is_admin()` lo consulta (security definer).
- Políticas `*_write` de `seasons`, `league_months`, `league_groups`, `group_standings`, `matches`,
  `players`, `teams` y `league_imports`: solo `is_admin()`. La lectura sigue siendo pública.
- `assert_admin()` da el mensaje claro al principio de `ingest_league` e `ingest_league_matches`.
- `get_my_profile()` devuelve `isAdmin`, `side` y `hand`; `update_my_profile` acepta `side` y `hand`.

## Rondas repetidas con otro nombre

`ingest_league` reconoce un mes ya guardado por sus grupos: si el 80 % o más de las parejas del
texto están en el mismo grupo que en un mes existente de la temporada, lo trata como ese mes
(`tmp_month_map.by_groups`) y se queda con el nombre nuevo. Si coincide con un mes de otra
temporada de la misma competición, rechaza la carga.

## Un jugador, una cuenta

- `profiles_player_unique`: índice único parcial sobre `profiles.player_id`.
- `update_my_profile` y `set_my_profile` convierten la violación en `JUGADOR_OCUPADO: …`; la app
  quita el prefijo y enseña el mensaje. Para liberar un jugador (p. ej. alguien se vinculó por error),
  el administrador pone `player_id = null` en ese perfil desde el panel de Supabase.

## Este mes compartido por la pareja

- `my_team_ids()`: parejas (teams) en las que juega el jugador de tu perfil.
- `rounds` / `fixtures`: se leen y cambian si son tuyos **o** de una de tus parejas
  (políticas «pareja: leer / cambiar»). Crear y borrar sigue siendo solo tuyo.
- `get_my_round(season)`: el grupo en curso de la competición (el de la pareja, el más reciente).
- `start_round`: valida que `myTeamId` sea tuyo; si tu pareja ya abrió el grupo de ese mes, lo devuelve.
- `update_fixture`: gana lo último guardado; toca también `rounds.updated_at`.

## Avisos en el móvil (web push)

- **Aparatos**: `push_subscriptions` (uno por navegador, con `user_id`). La app los guarda con
  `save_push_subscription(sub)` y los borra con `delete_push_subscription(p_endpoint)`; la clave
  pública sale de `vapid_public_key()`. Las claves VAPID y la contraseña interna (`notify_token`)
  viven en Vault; la privada nunca sale de la base ni de la función.
- **Preferencias**: `profiles.notify_reminders / notify_results / notify_loads` (por defecto sí),
  editables con `update_my_profile` (`notifyReminders`, `notifyResults`, `notifyLoads`).
- **Cuándo se avisa** (todo pasa por `notify_call(body)` → pg_net → función `notify`):
  - `fixtures_notify_result`: un resultado apuntado (jugado / w.o.) → avisa a la pareja de quien lo apuntó.
  - `league_imports_notify`: carga masiva con partidos → a todos los de esa competición con cuenta,
    con su grupo y puesto.
  - Tarea `padel-recordatorios` (cada hora): la función solo actúa a las 20:00 de España y avisa
    de los partidos con fecha de mañana.
  - `send_test_push()`: aviso de prueba a tus aparatos.
- **Función `notify`** (`db/functions/notify/index.ts`, sin verificación JWT: exige la cabecera
  `x-notify-token`). Los mensajes los arman funciones solo para `service_role`
  (`notify_result_messages`, `notify_load_messages`, `notify_reminder_messages`,
  `notify_test_messages`, `notify_targets`). Un aparato que responde 404/410 se borra (`push_mark`).
  Un aviso que falla nunca rompe lo que se estaba guardando.
- Probar a mano (SQL): `select notify_call('{"type":"reminders","force":true}')` y mirar
  `net._http_response`.

## Fechas de la liga (partidos por jugar)

- `league_schedules`: una fila por enfrentamiento y mes (`team_lo`/`team_hi` para no duplicar el
  cruce), con `scheduled_at` en hora de España. La escribe `ingest_league` desde `payload.schedules`
  (`[mes, grupo, local, visitante, 'AAAA-MM-DDTHH:MM']`, que saca `LigaParser`); si la web cambia
  la fecha, se actualiza.
- `apply_league_schedules(season)` (admin): pasa esas fechas a los `fixtures` pendientes y **sin
  fecha** de las rondas en curso. Una fecha puesta por la pareja no se pisa nunca.
- `get_league_snapshot` devuelve `schedules` solo de los cruces que aún no tienen partido.
