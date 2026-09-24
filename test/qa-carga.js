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

  let ingests = [];
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
  let admin = false;
  await page.route('**/rest/v1/rpc/get_my_profile', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ label: 'Francisco', category: 'masculina', playsMixed: true, defaultKind: 'masculina', isAdmin: admin }) }));
  await page.route('**/rest/v1/rpc/ingest_league', async r => {
    ingest = JSON.parse(r.request().postData()).payload; ingests.push(ingest);
    ingestAuth = r.request().headers()['authorization'];
    ingestApiKey = r.request().headers()['apikey'];
    const auth = ingestAuth;
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      season: ingest.season.slug, kind: ingest.season.kind,
      playersAdded: 12, teamsAdded: 6, monthsUpserted: 1,
      groupsAdded: 18, standingsUpserted: 72, matchesAdded: 96, _auth: auth }) });
  });

  await page.goto(BASE); await page.waitForTimeout(700);
  await page.evaluate(() => window.PadelApp.go('config')); await page.waitForTimeout(700);

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
  check('Cuenta normal: NO aparece el cargador', await page.locator('#ld-text').count() === 0);
  check('Cuenta normal: explica que es solo del administrador', (await page.textContent('#view')).includes('solo las hace el administrador'));
  admin = true;
  await page.evaluate(() => window.PadelDB.fetchProfile().then(() => window.PadelApp.go('config'))); await page.waitForTimeout(700);
  if (await page.locator('[data-action="open-loader"]').count()) { await page.click('[data-action="open-loader"]'); await page.waitForTimeout(300); }
  check('Administrador: aparece el formulario de carga', await page.locator('#ld-text').count() === 1);
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

  // --- meses sin nombre: hay que decir cuándo se jugó ---
  check('Enseña la tabla «¿Cuándo se jugó cada mes?»', await page.locator('[data-played]').count() === 6);
  await page.click('[data-action="save-league"]'); await page.waitForTimeout(400);
  check('Sin mes jugado no guarda', (await page.textContent('#view')).includes('en qué mes se jugó') && ingest === null);

  // --- guardar de verdad, como mixta ---
  await page.click('[data-chips="kind"] .chip[data-value="mixta"]'); await page.waitForTimeout(300);
  for (let i = 0; i < 6; i++) await page.selectOption('[data-played="' + (i + 1) + '"]', String(i + 1));
  await page.waitForTimeout(300);
  const cal = await page.$$eval('.cal-t tbody tr td:last-child', e => e.map(x => x.textContent));
  check('Febrero→julio van al S1 del mixto', cal.length === 6 && cal.every(t => /^20\d\d-s1-mixta$/.test(t)), cal.join(','));
  await page.click('[data-action="save-league"]'); await page.waitForTimeout(1200);

  check('Envía el paquete a la base', ingest !== null);
  if (ingest) {
    check('Va con el token de la sesión, no con la clave pública',
      ingestAuth === 'Bearer tok-123' && ingestApiKey && ingestApiKey !== 'Bearer tok-123',
      'authorization=' + ingestAuth);
    check('Marca la competición elegida', ingest.season.kind === 'mixta', ingest.season.kind);
    check('Temporada decidida por el calendario', /^20\d\d-s1-mixta$/.test(ingest.season.slug) &&
      /primer semestre/.test(ingest.season.name), ingest.season.slug + ' · ' + ingest.season.name);
    check('Nombra los meses con el mes jugado', ingest.months[0][1] === 'Febrero' && ingest.months[0][2] === 'Febrero',
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
  const mergeLines = await page.$$eval('.notice.warn li', els => els.map(e => e.textContent.replace('ya en la base', '').trim()));
  check('Mixto: cada unión va de corto a largo, sin «X → X»',
    mergeLines.length > 0 && mergeLines.every(t => { const n = x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); const [a, b] = t.split(' → '); return a && b && a !== b && n(b).indexOf(n(a)) === 0; }),
    mergeLines.join(' | '));
  check('Mixto: una línea por nombre',
    new Set(mergeLines.map(t => t.split(' → ')[0])).size === mergeLines.length, mergeLines.join(' | '));
  check('Mixto: explica la regla de las 10 letras', mx.includes('10 letras'));

  const calMx = await page.$$eval('.cal-t tbody tr', e => e.map(x => x.querySelector('td').textContent + '>' +
    x.querySelector('select').selectedOptions[0].textContent + '>' + x.lastElementChild.textContent));
  check('Mixto: la web va un mes adelantada («Julio» se jugó en septiembre)',
    /Enero>Febrero>20\d\d-s1-mixta/.test(calMx[0]) && /Julio>Septiembre>20\d\d-s2-mixta/.test(calMx[2]), calMx.join(' | '));
  ingests = []; ingest = null;
  await page.click('[data-action="save-league"]'); await page.waitForTimeout(1500);
  if (ingests.length) {
    check('Mixto: se reparte en dos temporadas (S1 y S2)', ingests.length === 2 &&
      /-s1-mixta$/.test(ingests[0].season.slug) && /-s2-mixta$/.test(ingests[1].season.slug),
      ingests.map(x => x.season.slug).join(','));
    check('Mixto: al S1 enero y febrero de la web; al S2 julio',
      ingests[0].months.map(m => m[1] + '/' + m[2]).join(',') === 'Enero/Febrero,Febrero/Marzo' &&
      ingests[1].months.map(m => m[1] + '/' + m[2]).join(',') === 'Julio/Septiembre',
      JSON.stringify(ingests.map(x => x.months)));
    const g = ingests[0].groups.concat(ingests[1].groups).map(x => x.join('-')).join(',');
    check('Mixto: los grupos van separados por mes',
      g === '1-1,1-2,1-8,2-1,2-9,7-1,7-4,7-7', g);
    ingest = ingests[1];
    check('Mixto: unifica a Carla en una sola persona',
      ingest.teams.filter(t => /^Carla/.test(t[1])).every(t => t[1] === 'Carla Cayero'),
      ingest.teams.filter(t => /Carla/.test(t[0])).map(t => t[1]).join('|'));
  } else {
    check('Mixto: envía el paquete', false);
  }

  // --- la sesión sobrevive a recargar ---
  await page.reload(); await page.waitForTimeout(800);
  await page.evaluate(() => window.PadelApp.go('config')); await page.waitForTimeout(700);
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
