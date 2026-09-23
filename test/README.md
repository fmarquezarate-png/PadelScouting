# Pruebas

Dos suites contra un navegador real (Chromium vía Playwright). No hay que tocar Supabase:
la llamada a la base se intercepta con `fixtures/league-snapshot.json`, que es
**byte a byte lo que devuelve la base de datos** (comprobado por md5 de cada array).

```bash
# 1. servir la app
python3 -m http.server 8111

# 2. en otra terminal
node test/qa-liga.js       # Liga, Rival, motor y caché
node test/qa-scouting.js   # Registro, historial, análisis, backup
```

Cada suite termina imprimiendo cuántas comprobaciones pasan y cuáles fallan, y sale con
código distinto de cero si algo se rompe.

El fixture se regenera desde el texto crudo de la liga con `node tools/make-fixture.js`.
