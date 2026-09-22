# Changelog

Todos los cambios relevantes de PADEL SCOUTING se documentan en este archivo.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Unreleased]

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
