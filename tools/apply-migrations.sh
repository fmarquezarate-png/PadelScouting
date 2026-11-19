#!/usr/bin/env bash
# Aplica en la base las migraciones de db/migrations/*.sql que aún no estén aplicadas.
# · Cada archivo va en una sola transacción: o entra entero o no entra nada.
# · Lo aplicado queda en public.app_migrations (nombre, huella, fecha).
# · Los archivos de db/migrations/APLICADAS-A-MANO.txt se registran sin ejecutarse.
# · Si un archivo ya aplicado cambia, se avisa y NO se vuelve a ejecutar.
# Uso: SUPABASE_DB_URL=postgresql://… tools/apply-migrations.sh [--plan]
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SUPABASE_DB_URL:?Falta SUPABASE_DB_URL (secreto de GitHub)}"
PLAN=0; [ "${1:-}" = "--plan" ] && PLAN=1
export PGOPTIONS='-c client_min_messages=warning'
PSQL=(psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 --no-psqlrc)

if [ $PLAN -eq 0 ]; then
  "${PSQL[@]}" -c "create table if not exists public.app_migrations (
    name text primary key, checksum text not null, applied_at timestamptz not null default now(), how text not null default 'action');
    alter table public.app_migrations enable row level security;" >/dev/null
fi
HAS_TABLE=$("${PSQL[@]}" -At -c "select to_regclass('public.app_migrations') is not null")

manual=$(grep -v '^\s*#' db/migrations/APLICADAS-A-MANO.txt 2>/dev/null | sed 's/\s*$//' | grep -v '^$' || true)
applied=0; skipped=0; registered=0
for f in $(ls db/migrations/*.sql 2>/dev/null | sort); do
  name=$(basename "$f"); sum=$(sha256sum "$f" | cut -d' ' -f1)
  prev=""
  [ "$HAS_TABLE" = "t" ] && prev=$("${PSQL[@]}" -At -c "select checksum from public.app_migrations where name = '$name'")
  if [ -n "$prev" ]; then
    [ "$prev" != "$sum" ] && echo "::warning::$name cambió después de aplicarse: no se vuelve a ejecutar. Haz un archivo nuevo."
    skipped=$((skipped+1)); continue
  fi
  if printf '%s\n' "$manual" | grep -qxF "$name"; then
    echo "· $name: aplicada a mano, se registra"
    [ $PLAN -eq 0 ] && "${PSQL[@]}" -c "insert into public.app_migrations (name, checksum, how) values ('$name', '$sum', 'a mano')" >/dev/null
    registered=$((registered+1)); continue
  fi
  if [ $PLAN -eq 1 ]; then echo "· $name: se aplicaría"; continue; fi
  echo "▶ Aplicando $name"
  "${PSQL[@]}" --single-transaction -f "$f" \
    -c "insert into public.app_migrations (name, checksum) values ('$name', '$sum')" >/dev/null
  echo "✔ $name aplicada"
  applied=$((applied+1))
done
echo "Hecho: $applied aplicadas, $registered registradas (a mano), $skipped ya estaban."
