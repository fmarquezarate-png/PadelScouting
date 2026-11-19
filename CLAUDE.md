# PADEL SCOUTING · notas para trabajar en el proyecto

App vanilla (HTML/CSS/JS) en https://padel-scouting.vercel.app · base en Supabase (proyecto `etfsdoufdzibqlgpcdtx`).
Se trabaja y se sube directamente a `main` (Vercel publica solo).

## Cambios en la base de datos
- Vía normal: el conector de Supabase (apply_migration / execute_sql).
- **Si el conector falla o no está**: escribir la migración en `db/migrations/AAAA-MM-DD_descripcion.sql`
  y subirla a `main`. La acción «Base de datos · migraciones» (`.github/workflows/db-migrations.yml`)
  la aplica sola con `tools/apply-migrations.sh` (cada archivo en una transacción; registro en
  `public.app_migrations`). Se puede lanzar a mano desde GitHub → Actions, con «solo mirar» primero.
- Una migración ya aplicada **no se edita**: los cambios van en un archivo nuevo.
- Si Fran aplica algo a mano en el SQL Editor, se añade su nombre a `db/migrations/APLICADAS-A-MANO.txt`.
- Escribir migraciones que se puedan repetir sin romper (`if not exists`, `create or replace`, `drop policy if exists`).
- Cambios que eliminan o pisan datos: confirmarlo con Fran antes de subirlos.

## Pruebas
`test/run-all.sh` (o cada `test/qa-*.js` con `node`); buscan solas el navegador (`test/chrome-path.js`).
