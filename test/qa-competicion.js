/* Cambio de competición (masculina / mixta / femenina) y «quién soy». */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const MASC = fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8');
/* Al mixto de prueba se le añade un WO a nuestro favor (Julio, grupo 7) para
   comprobar que los WO se ven en las listas sin contar como partido jugado. */
const MIX = (() => {
  const s = JSON.parse(fs.readFileSync(__dirname + '/fixtures/mixto-snapshot.json', 'utf8'));
  const ours = s.teams.find(t => t[4])[0];
  const other = s.standings.find(x => x[0] === 3 && x[1] === 7 && x[2] !== ours && x[2] !== 1010)[2];
  s.matches.push([3, 7, ours, other, null, 'home']);
  return JSON.stringify(s);
})();
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
  let patches = [];
  await page.route('**/rest/v1/rpc/update_my_profile', r => {
    const patch = JSON.parse(r.request().postData()).patch;
    patches.push(patch);
    profile = Object.assign({}, profile || {}, patch);
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) });
  });
  const kindsOf = {};
  JSON.parse(MASC).teams.forEach(t => [t[2], t[3]].forEach(n => { (kindsOf[n] = kindsOf[n] || new Set()).add('masculina'); }));
  JSON.parse(MIX).teams.forEach(t => [t[2], t[3]].forEach(n => { (kindsOf[n] = kindsOf[n] || new Set()).add('mixta'); }));
  await page.route('**/rest/v1/rpc/list_players', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(Object.keys(kindsOf).sort().map(l => ({ label: l, kinds: [...kindsOf[l]] }))) }));
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
  check('Marca en la que estás', (await page.getAttribute('.comp-item[data-kind="masculina"]', 'aria-checked')) === 'true');
  check('Dice cuántas temporadas tiene cada una', (await page.textContent('#comp-menu')).includes('1 temporada'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check('Escape cierra el menú', await page.locator('#comp-menu').isHidden());
  await page.click('#comp-btn'); await page.waitForTimeout(150);
  await page.click('h1'); await page.waitForTimeout(150);
  check('Tocar fuera cierra el menú', await page.locator('#comp-menu').isHidden());

  // --- a la mixta ---
  await page.click('#comp-btn'); await page.click('.comp-item[data-kind="mixta"]');
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
  check('Portada: la crónica del mixto ya no está «por escribir»', !/por escribir/i.test(home));

  await go('temporada');
  const tm = await text();
  check('Temporada: vuestro balance en el mixto', tm.includes(W + '–' + Lo), 'esperado ' + W + '–' + Lo);
  check('Temporada: el WO sale en la lista de partidos', await page.locator('#rows tr.wo-row').count() === 1 &&
    (await page.textContent('#rows tr.wo-row')).includes('WO'));
  check('Temporada: el WO no cuenta como partido jugado, pero se anota bajo el balance',
    tm.includes(W + '–' + Lo) && tm.includes('+ 1 WO a favor'));
  await page.click('[data-f="w"]'); await page.waitForTimeout(200);
  check('Temporada: el filtro de victorias incluye el WO ganado', await page.locator('#rows tr.wo-row').count() === 1);
  await page.click('[data-f="tb"]'); await page.waitForTimeout(200);
  check('Temporada: el filtro de super tie-break no mete el WO', await page.locator('#rows tr.wo-row').count() === 0);
  await page.click('[data-f="all"]'); await page.waitForTimeout(200);
  check('Temporada: el nivel del club también en mixto (es el mismo)',
    await page.locator('[data-metric="club"]').count() === 1);
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
  check('Crónica: la del mixto se escribe sola con sus partidos', (await text()).includes('Escrita sola') &&
    !(await text()).includes('Cristian'));

  await page.reload(); await page.waitForTimeout(900);
  check('Recuerda la competición al volver', (await page.textContent('#comp-label')) === 'Mixta');

  // --- vuelta al masculino: todo igual que antes ---
  await page.click('#comp-btn'); await page.click('.comp-item[data-kind="masculina"]'); await page.waitForTimeout(900);
  await go('temporada');
  check('Masculino: 12–5 intacto', (await text()).includes('12–5'));
  check('Masculino: vuelve el nivel del club', await page.locator('[data-metric="club"]').count() === 1);
  await go('cronica'); await page.waitForTimeout(400);
  check('Masculino: su crónica', (await text()).includes('Tres actos'));
  const keys = await page.evaluate(() => Object.keys(localStorage));
  check('Cada competición con su copia en el móvil',
    keys.includes('padel-scouting.liga.v2') && keys.includes('padel-scouting.liga.v2:2026-s1-mixta'), keys.join(','));

  // --- quién soy: avatar → entrar → bienvenida de 3 datos ---
  check('Sin sesión el avatar es un interrogante', (await page.textContent('#avatar-btn')).trim() === '?');
  await page.click('#avatar-btn'); await page.waitForTimeout(500);
  check('El avatar lleva a entrar', (await page.textContent('#page-title')) === 'Mi perfil' && await page.locator('#au-email').count() === 1);
  await page.fill('#au-email', 'fmarquezarate@gmail.com'); await page.fill('#au-pass', 'x');
  await page.click('[data-action="auth-go"]'); await page.waitForTimeout(900);
  check('Cuenta nueva: sale la bienvenida', await page.locator('.modal #wz-title').count() === 1);
  check('No deja entrar sin los 3 datos', await page.locator('[data-wz="save"][disabled]').count() === 1);
  await page.fill('#wz-q', 'yag'); await page.waitForTimeout(250);
  check('Busca entre todos los jugadores', await page.locator('[data-wz-player="Yago Garcí"]').count() === 1);
  await page.click('[data-wz-player="Yago Garcí"]');
  await page.click('[data-wz-cat="masculina"]');
  await page.click('[data-wz-mix="0"]'); await page.waitForTimeout(150);
  check('Si no juegas mixto no pregunta qué ver al abrir', await page.locator('[data-wz-def]').count() === 0);
  await page.click('[data-wz="save"]'); await page.waitForTimeout(1200);
  const p1 = patches[patches.length - 1] || {};
  check('Guarda los 3 datos', p1.label === 'Yago Garcí' && p1.category === 'masculina' &&
    p1.playsMixed === false && p1.defaultKind === 'masculina', JSON.stringify(p1));
  check('La bienvenida se cierra', await page.locator('.modal').count() === 0);
  check('El avatar pasa a tu inicial', (await page.textContent('#avatar-btn')).trim() === 'Y');
  await go('inicio');
  check('Portada: ahora es la pareja de Yago', (await text()).includes('Yago') && !(await text()).includes('Cristian'));
  await page.click('#comp-btn'); await page.click('.comp-item[data-kind="mixta"]'); await page.waitForTimeout(900);
  check('Si no juegas esa competición, lo dice', (await text()).includes('No apareces'));
  await page.click('#comp-btn'); await page.click('.comp-item[data-kind="masculina"]'); await page.waitForTimeout(900);

  // --- editar datos: ahora Francisco, que juega mixto y quiere verlo al abrir ---
  await go('perfil');
  check('Mi perfil muestra tus datos', (await text()).includes('Yago Garcí') && (await text()).includes('Masculina'));
  await page.click('[data-pf="edit"]'); await page.waitForTimeout(300);
  await page.click('[data-wz="relabel"]'); await page.waitForTimeout(200);
  await page.fill('#wz-q', 'francis'); await page.waitForTimeout(250);
  await page.click('[data-wz-player="Francisco"]');
  await page.click('[data-wz-mix="1"]'); await page.waitForTimeout(150);
  check('Si juegas mixto pregunta qué ver al abrir', await page.locator('[data-wz-def]').count() === 2);
  await page.click('[data-wz-def="mixta"]');
  await page.click('[data-wz="save"]');
  await page.waitForFunction(() => document.getElementById('comp-label').textContent === 'Mixta', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  check('Te lleva a tu competición por defecto', (await page.textContent('#comp-label')) === 'Mixta');
  await go('inicio');
  check('Y reconoce tu pareja del mixto', (await text()).includes('Ana Clerch'));
  await page.click('#comp-btn'); await page.click('.comp-item[data-kind="masculina"]'); await page.waitForTimeout(900);
  await go('inicio');
  check('Vuelves a ser Francisco', (await text()).includes('Cristian'));

  // --- el registro de scouting no se mezcla entre competiciones ---
  await page.evaluate(() => {
    const base = { status: 'normal', sets: [{ own: 6, opponent: 3 }, { own: 6, opponent: 4 }], readSet: 1, readGame: 3,
      patterns: [], worked: [], notWorked: [], physicalState: 'normal', mentalState: 'normal', partnerNotes: '' };
    window.PadelStorage.save(Object.assign({ id: 'm-masc', date: '2026-09-01', kind: 'masculina',
      rivals: [{ name: 'Yago', archetype: 'A' }, { name: 'Edgar', archetype: 'B' }] }, base));
    window.PadelStorage.save(Object.assign({ id: 'm-mix', date: '2026-09-02', kind: 'mixta',
      rivals: [{ name: 'Sonia', archetype: 'A' }, { name: 'Jordi', archetype: 'B' }] }, base));
    window.PadelStorage.save(Object.assign({ id: 'm-viejo', date: '2026-08-01',
      rivals: [{ name: 'Ana Clerch', archetype: 'A' }, { name: 'Xyz', archetype: 'B' }] }, base));
  });
  const idsMasc = await page.evaluate(() => window.PadelApp.records().map(r => r.id).sort().join(','));
  check('Masculino: solo sus registros (el antiguo con nombres del mixto no entra)', idsMasc === 'm-masc', idsMasc);
  await page.click('#comp-btn'); await page.click('.comp-item[data-kind="mixta"]');
  await page.waitForFunction(() => document.getElementById('comp-label').textContent === 'Mixta', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  const idsMix = await page.evaluate(() => window.PadelApp.records().map(r => r.id).sort().join(','));
  check('Mixto: solo los suyos, y el antiguo se asigna por los nombres de los rivales', idsMix === 'm-mix,m-viejo', idsMix);
  await page.click('#comp-btn'); await page.click('.comp-item[data-kind="masculina"]'); await page.waitForTimeout(900);

  // --- cargar otra competición y verla ---
  await go('config'); await openLoader();
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
