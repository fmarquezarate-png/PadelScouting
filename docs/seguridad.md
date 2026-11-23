# Seguridad de PADEL SCOUTING

Qué protege la app y qué queda fuera. Ordenado según los controles de la ISO/IEC 27001:2022 (anexo A).
La ISO 27001 certifica cómo una **organización** gestiona su seguridad (riesgos, políticas, auditorías);
una app no se «certifica» sola. Este documento dice qué controles cubre la app y cuáles serían del responsable.

## Lo que hace la app

| Control (anexo A) | Qué hay en la app |
|---|---|
| 5.15 Control de acceso | Leer la liga es público; escribir pide cuenta. En la base, cada función mira quién eres (RLS + `security definer`). El nivel del club solo lo ven el jugador, su pareja y el admin. |
| 5.17 Información de autenticación | Recuperar la contraseña por correo (enlace de un solo uso, caduca). Cambiarla en **Mi perfil → Seguridad** pide la actual. La contraseña nueva: mínimo 8 caracteres, distinta de la actual, escrita dos veces. Las contraseñas no se guardan en el aparato. |
| 8.5 Autenticación segura | Sesiones de Supabase Auth con caducidad y renovación. Mensajes de error que no dicen si un email tiene cuenta («Si ese email tiene cuenta, te llegará…»). Tras volver de un enlace del correo, el token se quita de la barra de direcciones. |
| 8.2 Derechos de acceso privilegiado | Admin solo por `is_admin()` en la base; las funciones de admin lo comprueban (`assert_admin`). |
| 8.9 Configuración | Cabeceras de seguridad en `vercel.json` (abajo). |
| 8.23 Filtrado web / 8.26 Requisitos de seguridad de aplicaciones | Política de contenido (CSP): solo se ejecuta el código propio de la web; el único script incrustado (el del tema) va autorizado por su huella. Sin `eval`. La web no se puede meter dentro de otra (clickjacking). Solo se conecta a Supabase. |
| 8.24 Uso de criptografía | Todo por HTTPS; HSTS de 2 años obliga a HTTPS también en el futuro. |
| 8.25 / 8.29 Desarrollo y pruebas de seguridad | `test/qa-seguridad.js` comprueba las cabeceras, que la política no bloquea ninguna pantalla, que bloquea un script ajeno, y los flujos de contraseña. |
| 8.32 Gestión de cambios | Cambios por git en `main`; migraciones de base en `db/migrations/` (no se editan una vez aplicadas). |

### Cabeceras (`vercel.json`)

- `Content-Security-Policy`: `default-src 'self'`; scripts propios y el del tema por su huella (`sha256-…`);
  estilos propios y Google Fonts; conexiones solo a la web y a Supabase; `frame-ancestors 'none'`; `object-src 'none'`.
  **Si se cambia el script del tema en `index.html`, hay que poner su huella nueva en `vercel.json`**
  (`test/qa-seguridad.js` falla si no coinciden).
- `X-Frame-Options: DENY`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (sin cámara, micro, ubicación, pagos)
  y `Cross-Origin-Opener-Policy: same-origin`.
- `legacy/` no lleva la CSP (son páginas viejas de consulta).
- En local: `python3 test/serve-headers.py` sirve la app con estas mismas cabeceras.

## Lo que queda fuera de la app (lo decide el responsable)

- Ajustes de Supabase Auth: longitud mínima de contraseña en el servidor (hoy, la de Supabase), protección contra
  contraseñas filtradas, límites de intentos, plantillas de los correos, direcciones de vuelta permitidas.
- Copias de seguridad de la base y su prueba de restauración.
- Verificación en dos pasos, cierre de sesión en todos los aparatos, descarga y borrado de los datos de la cuenta:
  posibles mejoras, no hechas (se hablaron el 22/11/2026 y no se eligieron por ahora).
- Políticas, análisis de riesgos, formación y auditorías: son de la organización, no del código.
