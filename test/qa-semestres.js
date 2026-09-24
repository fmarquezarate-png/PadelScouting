/* Semestres: arriba solo la competición, dentro el semestre o «todo el recorrido». */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e != null ? ' → ' + e : ''));
const J = (r, o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });

const A = JSON.parse(fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8'));
A.season.kind = 'masculina';
/* S2 numera por calendario (Septiembre = 9), como la base de verdad. */
const B = { season: { slug: '2026-s2', name: 'Temporada 2026 - segundo semestre', kind: 'masculina' }, months: [[9, 'Septiembre']],
  teams: A.teams.slice(70), standings: [], archetypes: {},
  matches: A.matches.filter(m => m[0] === 6).slice(0, 20).map(m => [9].concat(m.slice(1))) };
const X = { season: { slug: '2026-s1-mixta', name: 'Mixta', kind: 'mixta' }, months: [[1, 'Enero']],
  teams: [[500, 'Ana/Pep', 'Ana', 'Pep', false], [501, 'Fran/Laura', 'Fran', 'Laura', true]],
  standings: [[1, 1, 500, 1], [1, 1, 501, 2]], matches: [[1, 1, 500, 501, [[6, 1], [6, 1]], null]], archetypes: {} };
const SNAPS = { '2026-s1': A, '2026-s2': B, '2026-s1-mixta': X };

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => localStorage.setItem('padel-scouting.me.v1', JSON.stringify({ label: 'Francisco' })));
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const calls = [];
  await page.route('**/rest/v1/rpc/get_league_snapshot', r => {
    const sl = JSON.parse(r.request().postData()).season_slug; calls.push(sl); J(r, SNAPS[sl]);
  });
  await page.route('**/rest/v1/rpc/list_seasons', r => J(r, [
    { slug: '2026-s1', name: A.season.name, kind: 'masculina' }, { slug: '2026-s1-mixta', name: 'Mixta', kind: 'mixta' },
    { slug: '2026-s2', name: B.season.name, kind: 'masculina' }]));
  await page.goto(BASE); await page.waitForTimeout(1500);

  await page.click('#comp-btn'); await page.waitForTimeout(200);
  const items = await page.$$eval('#comp-menu .comp-item', e => e.map(x => x.dataset.kind));
  check('Arriba solo las competiciones (una por tipo)', JSON.stringify(items) === '["masculina","mixta"]', items.join(','));
  await page.keyboard.press('Escape');

  await page.evaluate(() => window.PadelApp.go('inicio')); await page.waitForTimeout(300);
  check('En la pista no sale el semestre (no quita sitio a la pista)', !(await page.isVisible('#season-bar')));
  await page.evaluate(() => window.PadelApp.go('temporada')); await page.waitForTimeout(800);
  check('En Nuestra temporada sale el semestre', await page.isVisible('#season-bar'));
  const opts = await page.$$eval('#season-sel option', e => e.map(x => x.textContent));
  check('Opciones: S1 26, S2 26 y Todo el recorrido', JSON.stringify(opts) === '["S1 26","S2 26","Todo el recorrido"]', opts.join(','));

  await page.selectOption('#season-sel', 'all:masculina'); await page.waitForTimeout(2000);
  const months = await page.evaluate(() => window.PadelLiga.state.model.months.map(m => m.n + ':' + m.label).join(','));
  check('Todo el recorrido: meses seguidos de los dos semestres', months.endsWith('6:Julio,7:Septiembre') && months.startsWith('1:Febrero'), months);
  check('Todo el recorrido: pide las dos temporadas', calls.includes('2026-s1') && calls.includes('2026-s2'));
  const n = await page.evaluate(() => window.PadelLiga.state.model.matches.length);
  check('Todo el recorrido: suma los partidos', n === A.matches.length + B.matches.length, 'n=' + n);
  check('La competición de arriba sigue siendo Masculina', (await page.textContent('#comp-label')) === 'Masculina');

  await page.click('#comp-btn'); await page.click('#comp-menu [data-kind="mixta"]'); await page.waitForTimeout(1500);
  check('Cambiar a Mixta lleva a su temporada más reciente', await page.evaluate(() => window.PadelDB.currentSeason()) === '2026-s1-mixta');
  const opts2 = await page.$$eval('#season-sel option', e => e.map(x => x.textContent));
  check('En Mixta solo sus semestres', JSON.stringify(opts2) === '["S1 26","Todo el recorrido"]', opts2.join(','));
  await page.click('#comp-btn'); await page.click('#comp-menu [data-kind="masculina"]'); await page.waitForTimeout(1500);
  check('Volver a Masculina lleva a S2 (la más reciente)', await page.evaluate(() => window.PadelDB.currentSeason()) === '2026-s2');

  /* ---------- los filtros no navegan ---------- */
  await page.evaluate(() => window.PadelApp.go('temporada')); await page.waitForTimeout(900);
  await page.selectOption('#season-sel', '2026-s1'); await page.waitForTimeout(1800);
  await page.evaluate(() => window.scrollTo(0, 900)); await page.waitForTimeout(300);
  const y1 = await page.evaluate(() => window.scrollY);
  await page.selectOption('#season-sel', 'all:masculina'); await page.waitForTimeout(1800);
  check('Cambiar de temporada: sigue en la misma pantalla', (await page.textContent('#page-title')).includes('temporada'),
    await page.textContent('#page-title'));
  const y = await page.evaluate(() => window.scrollY);
  check('Cambiar de temporada: sigue a la misma altura', y1 > 800 && Math.abs(y - y1) < 60, 'antes=' + y1 + ' después=' + y);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('[data-metric="elo"]'); await page.waitForTimeout(300);
  await page.selectOption('#season-sel', 'all:masculina'); await page.waitForTimeout(1800);
  check('Cambiar de temporada: conserva la métrica elegida', await page.getAttribute('[data-metric="elo"]', 'class').then(c => /on/.test(c || '')));
  await page.click('#comp-btn'); await page.click('#comp-menu [data-kind="mixta"]'); await page.waitForTimeout(1800);
  check('Cambiar de competición: sigue en la misma pantalla', (await page.textContent('#page-title')).includes('temporada'));
  check('Cambiar de competición: no salta ningún aviso', await page.locator('.modal').count() === 0);
  await page.click('#comp-btn'); await page.click('#comp-menu [data-kind="masculina"]'); await page.waitForTimeout(1800);
  await page.evaluate(() => window.PadelApp.go('liga')); await page.waitForTimeout(800);
  await page.click('#pair-btn'); await page.waitForTimeout(300);
  await page.click('.pp-item >> nth=0'); await page.waitForTimeout(1200);
  check('Elegir pareja: sigue en La liga', (await page.textContent('#page-title')) === 'La liga');

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
