# Pruebas

Cinco suites (256 comprobaciones) contra un navegador real (Chromium vía Playwright). No hay que tocar Supabase:
la llamada a la base se intercepta con `fixtures/league-snapshot.json`, que es
**byte a byte lo que devuelve la base de datos** (comprobado por md5 de cada array).

```bash
# todo de una vez (necesita playwright: npm i playwright)
bash test/run-all.sh

# o a mano:
# 1. servir la app
python3 -m http.server 8111

# 2. en otra terminal
node test/qa-app.js        # Inicio, temporada, liga y crónica (todo lo del HTML original)
node test/qa-rival.js      # Rival, motor y caché
node test/qa-carga.js      # Sesión y carga de una clasificación
node test/qa-scouting.js   # Registro, historial, análisis, backup
node test/qa-competicion.js # Cambio de competición y «quién soy»
```

Cada suite termina imprimiendo cuántas comprobaciones pasan y cuáles fallan, y sale con
código distinto de cero si algo se rompe.

El fixture se regenera desde el texto crudo de la liga con `node tools/make-fixture.js`.

`fixtures/mixto-snapshot.json` es una foto de prueba del mixto hecha desde la muestra
(`node tools/make-mixto-fixture.js`); no son los datos reales del mixto.
