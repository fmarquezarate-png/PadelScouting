# Changelog

Todos los cambios relevantes de PADEL SCOUTING se documentan en este archivo.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Unreleased]

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
