const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const SNAP = fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8');
const RAW = fs.readFileSync(__dirname + '/../legacy/liga-2026-s1.txt', 'utf8');
const MIXTO = fs.readFileSync(__dirname + '/fixtures/mixto-muestra.txt', 'utf8');
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e ? ' → ' + e : ''));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

  let ingest = null, ingestAuth = null, ingestApiKey = null, authCalls = 0, badLogin = true;
  await page.route('**/rest/v1/rpc/get_league_snapshot', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: SNAP }));
  await page.route('**/auth/v1/token**', r => {
    authCalls++;
    if (badLogin) return r.fulfill({ status: 400, contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }) });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      access_token: 'tok-123', refresh_token: 'ref-123',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { email: 'fmarquezarate@gmail.com' } }) });
  });
  await page.route('**/rest/v1/rpc/ingest_league', async r => {
    ingest = JSON.parse(r.request().postData()).payload;
    ingestAuth = r.request().headers()['authorization'];
    ingestApiKey = r.request().headers()['apikey'];
    const auth = ingestAuth;
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      season: ingest.season.slug, kind: ingest.season.kind,
      playersAdded: 12, teamsAdded: 6, monthsUpserted: 1,
      groupsAdded: 18, standingsUpserted: 72, matchesAdded: 96, _auth: auth }) });
  });

  await page.goto(BASE); await page.waitForTimeout(700);
  await page.evaluate(() => window.PadelApp.go('liga')); await page.waitForTimeout(700);

  // --- la carga está escondida hasta que la pides ---
  check('El cargador no estorba de entrada', await page.locator('#ld-text').count() === 0);
  await page.click('[data-action="open-loader"]'); await page.waitForTimeout(300);
  check('Sin sesión pide entrar', await page.locator('#au-email').count() === 1);
  check('Explica por qué hace falta', (await page.textContent('#view')).includes('sin que nadie pueda tocar'));

  // --- credenciales malas ---
  await page.fill('#au-email', 'fmarquezarate@gmail.com');
  await page.fill('#au-pass', 'mal');
  await page.click('[data-action="auth-go"]'); await page.waitForTimeout(400);
  check('Credenciales malas: mensaje en castellano',
    (await page.textContent('#view')).includes('Email o contraseña incorrectos'));
  check('No inventa sesión con login fallido', await page.locator('#ld-text').count() === 0);

  // --- login bueno ---
  badLogin = false;
  await page.fill('#au-pass', 'buena'); await page.click('[data-action="auth-go"]');
  await page.waitForTimeout(500);
  check('Con sesión aparece el formulario de carga', await page.locator('#ld-text').count() === 1);
  check('Muestra con qué cuenta estás', (await page.textContent('#view')).includes('fmarquezarate@gmail.com'));

  // --- analizar sin texto ---
  await page.click('[data-action="parse"]'); await page.waitForTimeout(300);
  check('Avisa si no has pegado nada', (await page.textContent('#view')).includes('Pega primero'));

  // --- texto basura ---
  await page.fill('#ld-text', 'esto no es una clasificacion');
  await page.click('[data-action="parse"]'); await page.waitForTimeout(300);
  check('Rechaza texto que no es una clasificación',
    (await page.textContent('#view')).includes('No he encontrado ningún resultado'));
  check('Sin análisis válido no ofrece guardar', await page.locator('[data-action="save-league"]').count() === 0);

  // --- clasificación real ---
  await page.fill('#ld-text', RAW);
  await page.click('[data-action="parse"]'); await page.waitForTimeout(800);
  const prev = await page.textContent('#view');
  check('Lee los 6 meses', prev.includes('6 meses'));
  check('Lee las 81 parejas', prev.includes('81 parejas'));
  check('Lee los 561 partidos', prev.includes('561 partidos'));
  check('Detecta los 52 WO', prev.includes('52 de ellos WO'));
  check('Confirma que no hay descuadres', prev.includes('sin descuadres'));
  check('Ahora sí ofrece guardar', await page.locator('[data-action="save-league"]').count() === 1);

  // --- guardar sin identificador ---
  await page.click('[data-action="save-league"]'); await page.waitForTimeout(400);
  check('Exige identificador de temporada', (await page.textContent('#view')).includes('identificador'));
  check('No llama a la base sin identificador', ingest === null);

  // --- guardar de verdad, como mixta ---
  await page.click('[data-chips="kind"] .chip[data-value="mixta"]'); await page.waitForTimeout(300);
  await page.fill('#ld-text', RAW); await page.click('[data-action="parse"]'); await page.waitForTimeout(800);
  await page.fill('#ld-slug', '2026-s1-mixto');
  await page.fill('#ld-name', 'Mixto 2026 · primer semestre');
  await page.selectOption('#ld-first', '1');
  await page.click('[data-action="save-league"]'); await page.waitForTimeout(1200);

  check('Envía el paquete a la base', ingest !== null);
  if (ingest) {
    check('Va con el token de la sesión, no con la clave pública',
      ingestAuth === 'Bearer tok-123' && ingestApiKey && ingestApiKey !== 'Bearer tok-123',
      'authorization=' + ingestAuth);
    check('Marca la competición elegida', ingest.season.kind === 'mixta', ingest.season.kind);
    check('Usa el identificador escrito', ingest.season.slug === '2026-s1-mixto', ingest.season.slug);
    check('Nombra los meses desde el primero elegido', ingest.months[0][1] === 'Febrero',
      ingest.months.map(m => m[1]).join(','));
    check('Manda 561 partidos', ingest.matches.length === 561, 'n=' + ingest.matches.length);
    check('Manda 435 posiciones', ingest.standings.length === 435, 'n=' + ingest.standings.length);
    check('Manda 81 parejas con sus dos jugadores',
      ingest.teams.length === 81 && ingest.teams.every(t => t.length === 3 && t[1] && t[2]));
    check('Guarda el texto crudo para poder reprocesar', (ingest.rawText || '').length > 1000);
    const wo = ingest.matches.filter(m => m[5]).length;
    check('Los WO viajan como WO, no como partidos vacíos', wo === 52, 'wo=' + wo);
  }
  const after = await page.textContent('#view');
  check('Informa de lo guardado', after.includes('96 partidos nuevos'));
  check('Limpia el texto tras guardar', (await page.inputValue('#ld-text')) === '');

  // --- formato del mixto: meses con nombre y nombres recortados ---
  ingest = null;
  await page.fill('#ld-text', MIXTO);
  await page.click('[data-action="parse"]'); await page.waitForTimeout(700);
  const mx = await page.textContent('#view');
  check('Mixto: detecta los meses por su nombre', mx.includes('3 meses'),
    (mx.match(/\d+ meses/) || [])[0]);
  check('Mixto: nombra los meses leídos', mx.includes('Enero') && mx.includes('Febrero') && mx.includes('Julio'));
  check('Mixto: no mete todo en un mes', !mx.includes('1 meses'));
  check('Mixto: ignora los partidos aún no jugados', mx.includes('17 partidos'),
    (mx.match(/\d+ partidos/) || [])[0]);
  check('Mixto: avisa de los nombres que va a unir',
    mx.includes('Carla Caye') && mx.includes('Carla Cayero'));
  check('Mixto: avisa del enlace con gente ya cargada', mx.includes('ya en la base'));
  check('Mixto: explica la regla de las 10 letras', mx.includes('10 letras'));

  await page.fill('#ld-slug', 'mixto-qa');
  await page.fill('#ld-name', 'Mixto QA');
  await page.click('[data-chips="kind"] .chip[data-value="mixta"]'); await page.waitForTimeout(300);
  await page.fill('#ld-text', MIXTO);
  await page.click('[data-action="parse"]'); await page.waitForTimeout(700);
  await page.fill('#ld-slug', 'mixto-qa');
  await page.click('[data-action="save-league"]'); await page.waitForTimeout(1000);
  if (ingest) {
    check('Mixto: manda 3 meses con su nombre',
      ingest.months.length === 3 && ingest.months[0][1] === 'Enero' && ingest.months[2][1] === 'Julio',
      JSON.stringify(ingest.months));
    const g = ingest.groups.map(x => x.join('-')).join(',');
    check('Mixto: los grupos van separados por mes',
      g === '1-1,1-2,1-8,2-1,2-9,3-1,3-4,3-7', g);
    check('Mixto: unifica a Carla en una sola persona',
      ingest.teams.filter(t => /^Carla/.test(t[1])).every(t => t[1] === 'Carla Cayero'),
      ingest.teams.filter(t => /Carla/.test(t[0])).map(t => t[1]).join('|'));
  } else {
    check('Mixto: envía el paquete', false);
  }

  // --- la sesión sobrevive a recargar ---
  await page.reload(); await page.waitForTimeout(800);
  await page.evaluate(() => window.PadelApp.go('liga')); await page.waitForTimeout(700);
  await page.click('[data-action="open-loader"]'); await page.waitForTimeout(300);
  check('La sesión sigue tras recargar', await page.locator('#ld-text').count() === 1);
  await page.click('[data-action="sign-out"]');
  await page.waitForSelector('#au-email', { timeout: 5000 }).catch(() => {});
  check('Cerrar sesión vuelve a pedir entrar', await page.locator('#au-email').count() === 1);

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log('\n===== VERIFICADO =====');
  ok.forEach(o => console.log('  ok  ' + o));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(b => console.log('  XX  ' + b)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})();
