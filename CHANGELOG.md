# Changelog

Todos los cambios relevantes de PADEL SCOUTING se documentan en este archivo.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Unreleased]

### Changed — calendario de la liga
- **La temporada la decide el mes en que se jugó**: S1 = febrero→julio (la ronda de julio se
  juega en julio y agosto); S2 = septiembre→diciembre (la de diciembre, en diciembre y enero).
  El cargador enseña «¿Cuándo se jugó cada mes?», propone la temporada y, si pegas meses de los
  dos semestres, guarda cada uno en la suya. En el mixto la web nombra cada ronda con un mes de
  adelanto y sin ronda de agosto («Julio» se jugó en septiembre): ya lo tiene en cuenta.
- La base lo vigila también: `ingest_league` rechaza meter un mes del S2 en un S1 y al revés
  (`month_index`, `semester_of_month`) y guarda el mes jugado (`played_label`).
- **Datos**: el septiembre del mixto estaba dentro del S1; pasa a `2026-s2-mixta` con sus grupos,
  sus 11 partidos y tu grupo de Este mes. El S1 mixto queda febrero→julio-agosto (220 partidos).
- El Master (torneo aparte, fuera del ranking) no entra en la liga. Su carga, pendiente de ver el formato.

### Added — segundo bloque de peticiones
- **Este mes · «Cómo va el grupo»**: la tabla del grupo con PJ, G, P, sets y puntos de la liga
  (4 · 2 · 1 · 0), marcando «Provisional» lo que has apuntado tú y la liga aún no publicó.
- **Este mes · «Cómo se cocina el próximo mes»**: se juega 1.200 veces lo que falta del mes en
  **todos** los grupos (lo jugado cuenta tal cual), se aplican las subidas y bajadas, y sale en qué
  grupo caes y la probabilidad de que te toque cada pareja. Necesita la clasificación del mes pegada.
- **Registrar pregunta cómo cargar**: *Carga masiva* (pegar la clasificación, lleva a Configuración)
  o *Carga detallada* (tus últimos 5 partidos: eliges uno y sale rellenado; o uno en blanco).
- **Competición arriba, semestre dentro**: arriba solo Masculina / Mixta (cambiar lleva a la
  temporada más reciente). En Nuestra temporada, La liga, Crónica y El rival hay un desplegable
  **S1 26 · S2 26 · Todo el recorrido** (los semestres encadenados, meses seguidos y nivel continuo).
- **Nivel del club igual en masculino y mixto**, sin distinguir liga, filtrado a las fechas de cada
  temporada. Botón **«Importar histórico de juego»** en la escalera: pegas la tabla de la web del
  club (tuya o de tu pareja de esa competición), descarta «Restaurar por corrección» y repetidas,
  guarda el Ranking y no duplica lo ya guardado. Tablas `club_levels` y `club_rankings` (privadas).
- **Crónica automática** para cualquier temporada (`js/cronica.js`): actos según el carácter de
  cada mes, el duelo contra el rival repetido, rachas, remontadas, super tie-breaks, mejor y peor
  mes, rival más duro, la victoria que más vale y los niveles del club. Los golpes de cada uno
  («Izquierda y derecha») los escribes tú y se guardan en el dispositivo. Probada con el mixto S1;
  con el masculino S1 saca los mismos tres actos que la escrita a mano.

### Fixed
- **Recargar un mes ya cargado no duplica partidos.** El orden de las parejas en la tabla cambia
  con los puestos, así que un partido podía llegar «al revés» y guardarse dos veces. Ahora la base
  lo reconoce en los dos sentidos (índice `matches_pair_unique`) y, si la liga corrige un resultado,
  lo actualiza (`matchesUpdated`).
- **Grupo del mes duplicado al cargar el S2.** El grupo iba con la temporada y al abrir el S2 pedía
  otro vacío. Ahora va con la competición: uno en curso para masculino y otro para mixto.
  Recuperados en el grupo del S2 los resultados y fechas apuntados en el del S1.
- **El rival** enseñaba solo 40 parejas: ahora todas.
- **Masculino y mixto no se mezclan en tu registro de scouting**: cada registro guarda su
  competición; los antiguos se asignan por los nombres de los rivales.
- Móvil: sin zoom automático al tocar un campo (letra de 16 px); tras hacer zoom con dos dedos,
  la pantalla vuelve sola a su tamaño; en la app instalada, tirar hacia abajo desde arriba recarga.
- Ordenador: el menú ☰ es más grande.

### Changed — orden del menú y la pista sin solapes
- **Orden lógico**, igual en la pista y en el menú ☰: al fondo, la liga (La liga · Temporada ·
  Crónica); en la red, **Este mes**; en vuestro lado, el scouting en el orden en que se usa
  (Registrar · Historial · Análisis); en la puerta, El rival. Menú: La pista · Ahora · La liga ·
  Tu scouting · Tu cuenta. La pelota recorre la pista en ese orden, cruzando la red.
- **«Este mes» ya no pisa otros botones**: en el ordenador va en la malla de la red, la fila del
  fondo muestra icono y título (sin subtítulo) y la de delante se equilibra; el texto de la red
  se acorta si no cabe en el ancho de la pista. Tablet en vertical: la foto se ve entera.
- Prueba permanente: en 5 tamaños (360 px a 1920 px) ningún botón, rótulo, «Este mes» ni el
  marcador se solapan.

### Added — Este mes
- **Este mes**: tu grupo en curso, con un botón iluminado en la red de la pista (enseña el
  próximo partido: «sáb 27 · 19:00 · Sonia/Annabelle») y en el menú ☰. Por rival: probabilidad de
  ganar, marcador más probable, puesto, si viene subiendo o bajando, historial directo, fecha y
  hora editables, «Comparar →» y «Al calendario» (.ics con aviso 2 h antes). Arriba, tu
  probabilidad de **subir, mantenerte o bajar** simulando el grupo entero con los puntos de la liga.
- **Nueva ronda**: al abrir la app en un mes nuevo, pregunta tus rivales ya propuestos. Si la
  liga ya publicó el grupo del mes, sale exacto de la liga; si no, se prevé con las reglas del
  histórico (masculino: 1.º sube 2, 2.º sube 1, 3.º baja 1, 4.º baja 2; mixto: 1.º sube 1, 2.º se
  queda, 3.º baja 1; aciertan el grupo el 97 % de las veces). «Sigue la misma ronda» para el verano.
- **Resultado al abrir**: 2 h después de la hora del partido pregunta «¿Cómo fue contra…?»:
  resultado básico (sets, con el super tie-break solo si hace falta), registro completo (el
  formulario ya relleno y enganchado al partido), WO a favor o en contra, o «aún no se jugó».
- **Resultados provisionales**: lo que apuntas cuenta ya en tus números, marcado como provisional;
  cuando pegas la clasificación oficial, manda la de la liga.
- **Registro de scouting en tu cuenta**: se sincroniza entre dispositivos (el más reciente gana)
  y la primera vez sube lo que ya había en el navegador.
- Base: tablas `rounds`, `fixtures`, `scouting_records` (cada cuenta solo ve lo suyo).

### Fixed
- **Mixto: cada ronda con el mes en que se jugó.** La web de la liga nombra las rondas un mes
  antes (su «Enero» se jugó en febrero; su «Junio», en julio-agosto; su «Julio», en septiembre).
  Ningún partido faltaba: estaban bajo el nombre de la web. Ahora la app enseña Febrero… Julio-Agosto,
  Septiembre (`league_months.played_label`) y por dentro conserva el nombre de la web, así que las
  próximas cargas pegadas tal cual siguen encajando. Copia local renovada (`liga.v2`).
- **Los WO no aparecían en Nuestra temporada.** Ahora salen en la lista de partidos (marcados
  «WO», a favor o en contra), en la ficha de cada rival y como nota bajo el balance
  («+ 1 WO a favor»). No cuentan en juegos, sets ni rating porque no se jugaron.

### Changed — la pelota
- La pelota naranja pasa a ser una **pelota de pádel de verdad** (`assets/pelota.webp`, 6 KB,
  recortada de la foto que pasó Fran). Tamaño proporcional a la profundidad (se mide con los
  botones: más grande delante, más pequeña al fondo), avance a velocidad constante con altura en
  parábola, sombra que se achica al subir, giro en el aire y aplastamiento al botar.
- El peloteo: la pelota cae desde arriba, bota una vez en cada botón cruzando la red, termina
  fuera de la pista en «El rival» y sale con un bote muy alto por arriba de la pantalla; a los
  pocos segundos vuelve a caer. Bote instantáneo, sin aplastarse ni pararse. Se detiene si la
  pestaña no se ve. Al tocar una zona, la pelota va hasta ese botón.

### Changed — la pista realista
- La portada usa las fotos del diseñador (`assets/pista-web.webp` y `assets/pista-movil.webp`,
  convertidas a WebP: 2,5 MB → 250 KB cada una). Los botones de la app van encima, colocados con
  la perspectiva calculada desde las líneas de la foto (esquinas del fondo y línea de saque
  cercana). En el móvil la foto llena la pantalla y el marcador flota sobre los árboles.
- Si la foto no carga, se ve la pista dibujada: la portada nunca queda vacía.
- Fotos provisionales a 1672 × 941: se sustituyen por los originales a tamaño completo cuando
  lleguen (mismos nombres de archivo; si cambia el encuadre hay que recalcular los 4 puntos en
  `js/court.js` → `PHOTOS`).

### Fixed
- **iPhone (app instalada)**: la barra de arriba quedaba debajo de la hora y la batería. Ahora cada
  borde reserva la zona segura que informa el móvil (muesca, isla dinámica, recortes de Android);
  en un ordenador no cambia nada. Hay una prueba que lo comprueba emulando un iPhone.

### Changed
- Botones de la pista más grandes (el círculo ocupa casi un tercio de cada zona).

### Added
- `docs/brief-pista-realista.md`: encargo para el diseñador de la versión realista de la pista
  (web y móvil), con `docs/referencia-pista-fran.webp` como referencia.

### Added — Fase 1: marco nuevo
- **Pista azul en perspectiva** como portada y menú: pista real de 10 × 20 m con cristales, malla,
  red, focos y la lona del club, dibujada con una cámara 3D. En pantalla ancha se ve desde detrás
  del fondo; en el móvil la cámara sube y la pista queda en vertical. Seis zonas en la pista y
  «El rival» esperando en la puerta. Los rótulos se dimensionan con el ancho real de cada zona.
- **Barra fija arriba**: escudo y club, título con la competición debajo (es el selector), y
  ⚙ Configuración · 🏠 Inicio · ☰ Menú · tu inicial o tu foto.
- **Panel ☰** con todas las secciones, agrupadas (La liga · Tu scouting · Tu cuenta).
- **Bienvenida de 3 datos** al estrenar cuenta: quién eres en la liga, tu categoría y si juegas
  mixto (y qué ver al abrir). La app te lleva a tu competición por defecto.
- **Mi perfil** (foto reducida a 256 px en el móvil antes de subirla) y **Configuración**
  (competición al abrir, carga de datos de la liga, copia de seguridad).

### Changed
- Fuera la barra de abajo, el botón «volver» y las tarjetas repetidas de la portada.
- La carga de datos pasa de «La liga» a Configuración.

### Fixed
- **Meses con nombre**: el lector los numeraba por orden de aparición, así que pegar un mes suelto
  lo metía en el mes 1. Ahora cada mes lleva su número de calendario y la base empareja por nombre.
- **Dos protecciones nuevas en la carga**: no deja renombrar un mes que ya existe, y no deja meter
  a una pareja en otro grupo del que ya tiene ese mes (señal de que el texto es de otro mes).
- **Mixto reparado**: una segunda carga (Junio con el título «Julio») había duplicado 25 partidos de
  Junio dentro de Enero y renombrado Enero. Se quitaron los duplicados y se restauraron 7 posiciones
  de Enero desde el texto original: el mixto vuelve a 7 meses y 231 partidos.

### Added
- **Competición arriba, para toda la app**: un botón en la barra superior cambia entre masculina,
  mixta (y femenina cuando exista). La pista, Temporada, Rival y Liga pasan a esa competición; la
  app la recuerda y guarda una copia por competición en el móvil.
- **Quién eres**: cada cuenta elige una vez su jugador y la app encuentra su pareja en cada
  competición. Sin sesión se usa la marca de la base (Francisco).
- Tras guardar una carga, la app dice en qué temporada y cuántos meses, grupos y partidos entraron,
  y ofrece «Verla ahora».
- Cada competición tiene su crónica: la del masculino sigue; la del mixto se escribirá con sus datos
  reales y mientras tanto se dice claro que falta.
- **La pista**, nueva portada: una pista de pádel dibujada que hace de menú. Cada zona es una
  pantalla; al tocarla la bola vuela hasta allí. Puesto animado (#67 → #50), forma reciente y
  tarjetas de acceso. Se maneja también con teclado.
- **Nuestra temporada**, **La liga** y **Crónica**: vuelven las 12 secciones del dashboard
  original (números, escalera animada con 5 métricas, mes a mes, acantilado, partidos con
  filtros, rivales, techo, clasificación ordenable, explorador, tres actos, Ernesto & Jordi,
  izquierda y derecha, niveles del club).
- Botón «volver» en la barra superior y navegación inferior de 5 botones.

### Fixed
- Guardar una temporada desde la app fallaba con «DELETE requires a WHERE clause»: Supabase
  bloquea ese tipo de borrado desde la API. Arreglado en la base; no se había escrito nada.
- Un identificador ya usado por otra competición se rechaza (antes el mixto podía acabar mezclado
  con el masculino). La app propone uno propio por competición (`2026-s1-mixta`).
- La vista previa mostraba uniones como «Alberto Lopez → Alberto Lopez» y repetía algunas: ahora
  siempre es «corto → largo», una línea por nombre.
- La forma reciente se lee siempre igual en toda la app: el más reciente primero.

### Fixed
- La liga mixta escribe los meses con su nombre (`Enero`) en lugar de `MES 1`. El lector no los
  reconocía y metía los siete meses en uno solo, con los grupos de meses distintos pisándose.
  Ahora entiende las dos formas, en castellano y en catalán.
- Los nombres llegan recortados a 10 letras en unas jornadas y completos en otras
  (`Carla Caye` / `Carla Cayero`), lo que duplicaba a la misma persona. Se unifican solo cuando el
  corto mide exactamente el ancho de corte, y **la vista previa enseña cada unión antes de guardar**.
  Lo que no cumple la regla se informa como «a revisar» en vez de decidirlo el programa.

### Changed
- Una pareja se identifica por **sus dos jugadores**, no por su etiqueta de texto: la misma pareja
  escrita de dos formas ya no crea dos registros.
- Unido en los datos existentes `Enric Cast` con `Enric Castillo`, que era la misma persona
  recortada.

### Added
- **La liga**, nueva pantalla de inicio: balance, puesto y grupo sobre los datos consolidados,
  escalera mes a mes, todos nuestros partidos y la fiabilidad medida del motor.
- **El rival**, nueva pantalla: eliges la pareja que te toca y devuelve proyección del partido,
  historial directo contra nosotros, comparativa lado a lado, su trayectoria y una lectura
  accionable. Incluye las otras parejas de esos mismos jugadores.
- Motor de liga (`js/liga.js`): rating por pareja anclado al grupo de entrada, probabilidad de
  ganar un juego calibrada contra los 480 partidos con señal, simulación de 4.000 partidos y
  matriz de marcadores de la que salen todos los números mostrados.
- Capa de datos (`js/db.js`): una llamada trae la temporada entera y se guarda en el móvil;
  si no hay cobertura, la app sigue con la última descarga.
- Suites de prueba en `test/`, con un fixture idéntico byte a byte a la base de datos.
- **Sesión** (`js/auth.js`): entrar, crear cuenta y salir contra Supabase, con los mensajes de error
  traducidos. Leer la liga no pide nada; escribir sí.
- **Carga de clasificaciones desde la app**: pegas la tabla, te dice qué ha leído (meses, grupos,
  parejas, partidos, WO y descuadres) y solo entonces ofrece guardar. Idempotente: cargar el mismo
  mes dos veces no duplica nada.
- Separación de competiciones: masculina y mixta viven como temporadas distintas, así los ratings
  de una no contaminan las proyecciones de la otra.

### Changed
- Navegación: Liga · Rival · Registrar · Historial · Análisis. El registro deja de ser la
  pantalla inicial.
- El briefing por arquetipo pasa a ser una sección dentro de Análisis; el plan por rival concreto
  vive ahora en El rival, donde sale de datos reales.
- Escudo del Club Tennis El Molí como identidad de la aplicación: icono de pestaña (favicon),
  icono de pantalla de inicio en iOS y Android, imagen al compartir el enlace, marca en la barra
  superior y en los estados vacíos.
- `manifest.webmanifest`: al añadirla a la pantalla de inicio se abre como app, a pantalla
  completa y con el fondo del sistema visual.

---

## [0.1.0] — 2026-09-22

### Added
- Estructura inicial del repositorio y documentación (`PROJECT_SPEC.md`, `README.md`, `CHANGELOG.md`).
- Sistema visual (`css/styles.css`): paleta oscura con sage y naranja, tipografía Archivo +
  IBM Plex, componentes reutilizables y navegación inferior fija. Mobile-first.
- Catálogos centralizados en `js/data.js`: arquetipos, estados, 11 patrones,
  8 acciones que funcionan, 8 que no, escalas de tres niveles y reglas del sistema.
- **Registro rápido**: fecha automática y editable, dos rivales con autocompletado derivado de
  partidos previos, arquetipo independiente por rival (se permite pareja mixta), estados
  normal/WO/abandono/otro, resultado por sets con cálculo automático de sets, resultado y juegos,
  juego de lectura por set + juego, máximo 3 patrones, selección múltiple de qué funcionó y qué no,
  estados físico y mental, y nota opcional de pareja.
- Confirmación y resumen inmediato tras guardar, con acciones de editar y registrar otro.
- **Persistencia** en `localStorage` bajo `padel-scouting.v1`, con edición y borrado (`js/storage.js`).
- **Historial** por tarjetas desplegables con filtros por resultado, arquetipo, rival y mes.
- **Backup**: exportación e importación JSON con validación y confirmación previa al reemplazo,
  en la tarjeta *Datos* del historial.
- **Análisis** (`js/analysis.js`): win rate por arquetipo contando cada partido una sola vez,
  juego medio de lectura con número de observaciones, evolución mensual y frecuencias de patrones
  y acciones.
- **Briefing** (`js/briefing.js`): máximo 3 bullets por arquetipo, partiendo de las hipótesis de
  trabajo y sustituyéndolas por datos reales cuando la muestra lo permite.

### Decisiones fijadas en esta versión
- Formato de liga: dos sets normales y super tie-break a 10 sin diferencia de dos.
  El super tie-break no suma a los juegos totales.
- Los WO y abandonos registran ganador o perdedor, pero quedan fuera del win rate por arquetipo.
- Umbrales de muestra: menos de 5 partidos, "datos insuficientes"; de 5 a 9, con aviso;
  10 o más, sin aviso.
- El juego de lectura se registra como set + juego, y el sistema deriva el juego acumulado
  del partido para poder promediar entre partidos.
- Export/import viven en el historial mientras se decide la automatización de carga de datos.
