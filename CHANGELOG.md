# Changelog

Todos los cambios relevantes de PADEL SCOUTING se documentan en este archivo.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Unreleased]

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
