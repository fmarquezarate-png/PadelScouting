/* Cambio de competición (masculina / mixta / femenina) y «quién soy». */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const MASC = fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8');
const MIX = fs.readFileSync(__dirname + '/fixtures/mixto-snapshot.json', 'utf8');
const RAW_MIX = fs.readFileSync(__dirname + '/fixtures/mixto-muestra.txt', 'utf8');
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e ? ' → ' + e : ''));

/* Lo que debería salir en el mixto, calculado aparte desde la foto. */
const mx = JSON.parse(MIX);
const ours = mx.teams.find(t => t[4])[0];
let W = 0, Lo = 0;
mx.matches.forEach(m => {
  if (!m[4] || (m[2] !== ours && m[3] !== ours)) return;
  const home = m[2] === ours;
  const won = m[4].filter(s => s[0] > s[1]).length > m[4].filter(s => s[0] < s[1]).length;
  if (won === home) W++; else Lo++;
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

  const seasons = [
    { slug: '2026-s1', name: 'Temporada 2026 · primer semestre', kind: 'masculina', months: 6, matches: 561 },
    { slug: '2026-s1-mixta', name: 'Mixto 2026 · primer semestre', kind: 'mixta', months: 3, matches: 17 }
  ];
  const asked = []; let profile = null, profileSet = null, ingest = null;
  await page.route('**/rest/v1/rpc/get_league_snapshot', r => {
    const slug = JSON.parse(r.request().postData()).season_slug;
    asked.push(slug);
    r.fulfill({ status: 200, contentType: 'application/json', body: slug === '2026-s1-mixta' ? MIX : MASC });
  });
  await page.route('**/rest/v1/rpc/list_seasons', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(seasons) }));
  await page.route('**/auth/v1/token**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ access_token: 'tok', refresh_token: 'ref', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { email: 'fmarquezarate@gmail.com' } }) }));
  await page.route('**/rest/v1/rpc/get_my_profile', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) }));
  await page.route('**/rest/v1/rpc/set_my_profile_label', r => {
    profileSet = JSON.parse(r.request().postData()).p_label;
    profile = { playerId: 1, label: profileSet };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) });
  });
  await page.route('**/rest/v1/rpc/ingest_league', r => {
    ingest = JSON.parse(r.request().postData()).payload;
    seasons.push({ slug: ingest.season.slug, name: ingest.season.name, kind: ingest.season.kind, months: 3, matches: 17 });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      season: ingest.season.slug, kind: ingest.season.kind, playersAdded: 0, teamsAdded: 0,
      monthsUpserted: 3, groupsAdded: 8, standingsUpserted: 30, matchesAdded: 17 }) });
  });

  const text = () => page.textContent('#view');
  const openLoader = async () => {
    if (await page.locator('[data-action="open-loader"]').count()) {
      await page.click('[data-action="open-loader"]'); await page.waitForTimeout(300);
    }
  };
  const go = async v => { await page.evaluate(v => window.PadelApp.go(v), v); await page.waitForTimeout(600); };

  await page.goto(BASE); await page.waitForTimeout(900);

  // --- el interruptor ---
  check('Arriba se ve la competición', (await page.textContent('#comp-label')) === 'Masculina');
  check('Sin tocar nada, la masculina', asked[0] === '2026-s1', asked.join(','));
  await page.click('#comp-btn'); await page.waitForTimeout(200);
  check('El menú lista las competiciones cargadas', await page.locator('.comp-item').count() === 2);
  check('Marca en la que estás', (await page.getAttribute('.comp-item[data-slug="2026-s1"]', 'aria-checked')) === 'true');
  check('Dice cuántos partidos tiene cada una', (await page.textContent('#comp-menu')).includes('17 partidos'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check('Escape cierra el menú', await page.locator('#comp-menu').isHidden());
  await page.click('#comp-btn'); await page.waitForTimeout(150);
  await page.click('h1'); await page.waitForTimeout(150);
  check('Tocar fuera cierra el menú', await page.locator('#comp-menu').isHidden());

  // --- a la mixta ---
  await page.click('#comp-btn'); await page.click('.comp-item[data-slug="2026-s1-mixta"]');
  await page.waitForFunction(() => document.getElementById('comp-label').textContent === 'Mixta' &&
    !document.body.classList.contains('switching'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  check('Pide la foto del mixto', asked.includes('2026-s1-mixta'), asked.join(','));
  check('Arriba pone Mixta', (await page.textContent('#comp-label')) === 'Mixta');
  check('El botón cambia de color', (await page.getAttribute('#comp-btn', 'data-kind')) === 'mixta');
  check('Avisa del cambio', (await page.textContent('#toast')).includes('Mixta'));
  const home = await text();
  check('Portada: tu pareja del mixto', home.includes('Ana Clerch') && !home.includes('Cristian'), (home.match(/FRANCISCO.{0,40}|Francisco.{0,40}/) || [''])[0]);
  check('Portada: el nombre de la temporada mixta', home.includes('Mixto 2026'));
  check('Portada: la crónica del mixto está por escribir', home.includes('Por escribir'));

  await go('temporada');
  const tm = await text();
  check('Temporada: vuestro balance en el mixto', tm.includes(W + '–' + Lo), 'esperado ' + W + '–' + Lo);
  check('Temporada: sin nivel del club (solo existe el del masculino)',
    await page.locator('[data-metric="club"]').count() === 0);
  check('Temporada: sin la leyenda del club', !tm.includes('solo en el nivel del club'));
  check('Temporada: dibuja la escalera', await page.locator('#chart circle, #chart path').count() > 0);

  await go('liga');
  check('Liga: la clasificación es la del mixto', (await text()).includes('Ana Clerch') && !(await text()).includes('Cristian C'));
  check('Liga: vuestra fila marcada', (await page.locator('tr.mine').first().textContent() || '').includes('Ana Clerch'));

  await go('rival');
  const rv = await text();
  check('Rival: busca entre parejas del mixto', !rv.includes('Cristian') && mx.teams.some(t => t[0] !== ours && rv.includes(t[2])));
  const firstRival = await page.locator('[data-rival]').first();
  if (await firstRival.count()) {
    await firstRival.click(); await page.waitForTimeout(700);
    check('Rival: proyecta el partido en el mixto', /\d+%/.test(await text()));
  } else check('Rival: hay parejas para elegir', false);

  await go('cronica');
  check('Crónica: no inventa la del mixto', (await text()).includes('todavía no está escrita'));

  await page.reload(); await page.waitForTimeout(900);
  check('Recuerda la competición al volver', (await page.textContent('#comp-label')) === 'Mixta');

  // --- vuelta al masculino: todo igual que antes ---
  await page.click('#comp-btn'); await page.click('.comp-item[data-slug="2026-s1"]'); await page.waitForTimeout(900);
  await go('temporada');
  check('Masculino: 12–5 intacto', (await text()).includes('12–5'));
  check('Masculino: vuelve el nivel del club', await page.locator('[data-metric="club"]').count() === 1);
  await go('cronica'); await page.waitForTimeout(400);
  check('Masculino: su crónica', (await text()).includes('Tres actos'));
  const keys = await page.evaluate(() => Object.keys(localStorage));
  check('Cada competición con su copia en el móvil',
    keys.includes('padel-scouting.liga.v1') && keys.includes('padel-scouting.liga.v1:2026-s1-mixta'), keys.join(','));

  // --- quién soy ---
  await go('liga');
  await openLoader();
  await page.fill('#au-email', 'fmarquezarate@gmail.com'); await page.fill('#au-pass', 'x');
  await page.click('[data-action="auth-go"]'); await page.waitForTimeout(700);
  check('Sin perfil pregunta quién eres', (await text()).includes('¿Quién eres en la liga?'));
  await page.fill('#me-q', 'yag'); await page.waitForTimeout(250);
  check('Busca jugadores de la competición', await page.locator('[data-me="Yago Garcí"]').count() === 1);
  await page.click('[data-me="Yago Garcí"]'); await page.waitForTimeout(500);
  check('Guarda el jugador elegido', profileSet === 'Yago Garcí');
  check('Confirma quién eres', (await text()).includes('En la liga eres Yago Garcí'));
  await go('inicio');
  check('Portada: ahora es la pareja de Yago', (await text()).includes('Yago') && !(await text()).includes('Cristian'));
  await page.click('#comp-btn'); await page.click('.comp-item[data-slug="2026-s1-mixta"]'); await page.waitForTimeout(900);
  check('Si no juegas esa competición, lo dice', (await text()).includes('No apareces'));
  await page.click('#comp-btn'); await page.click('.comp-item[data-slug="2026-s1"]'); await page.waitForTimeout(900);
  await go('liga'); await openLoader();
  await page.click('[data-action="me-edit"]'); await page.waitForTimeout(200);
  await page.fill('#me-q', 'francis'); await page.waitForTimeout(250);
  await page.click('[data-me="Francisco"]'); await page.waitForTimeout(500);
  await go('inicio');
  check('Vuelves a ser Francisco', (await text()).includes('Cristian'));

  // --- cargar otra competición y verla ---
  await go('liga'); await openLoader();
  check('Se puede cargar femenina', await page.locator('[data-chips="kind"] .chip[data-value="femenina"]').count() === 1);
  await page.click('[data-chips="kind"] .chip[data-value="femenina"]'); await page.waitForTimeout(250);
  check('Propone identificador para la femenina', (await page.inputValue('#ld-slug')) === '2026-s1-femenina');
  await page.fill('#ld-text', RAW_MIX); await page.click('[data-action="parse"]'); await page.waitForTimeout(600);
  await page.fill('#ld-name', 'Femenina prueba');
  await page.click('[data-action="save-league"]'); await page.waitForTimeout(1200);
  const saved = await text();
  check('Tras guardar dice dónde y cuánto', saved.includes('Guardado en la base: 2026-s1-femenina') && saved.includes('17 partidos nuevos'));
  check('Ofrece verla', await page.locator('[data-action="view-season"]').count() === 1);
  await page.click('[data-action="view-season"]');
  await page.waitForFunction(() => document.getElementById('comp-label').textContent === 'Femenina' &&
    document.getElementById('page-title').textContent === 'Nuestra temporada', null, { timeout: 8000 }).catch(() => {});
  check('«Verla ahora» cambia a esa competición', (await page.textContent('#comp-label')) === 'Femenina'
    && (await page.textContent('#page-title')) === 'Nuestra temporada',
    (await page.textContent('#comp-label')) + ' / ' + (await page.textContent('#page-title')));
  await page.click('#comp-btn'); await page.waitForTimeout(150);
  check('La nueva aparece en el menú', await page.locator('.comp-item').count() === 3);
  await page.keyboard.press('Escape');

  // --- móvil estrecho ---
  await page.setViewportSize({ width: 360, height: 780 }); await go('inicio');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('360 px: la barra de arriba cabe sin desbordar', !overflow);
  await page.screenshot({ path: process.env.SHOTS ? process.env.SHOTS + '/50-competicion.png' : '/dev/null' }).catch(() => {});

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
