/* Nivel del club: lector del histórico, escalera igual en masculino y mixto, importar tuyo y de tu pareja. */
const { chromium } = require('playwright');
const fs = require('fs');
const C = require('../js/club.js');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e != null ? ' → ' + e : ''));
const J = (r, o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });

const PASTE = 'Histórico del nivel de juego\nRanking: 280\nFecha\tResultado\tObservaciones\tNivel\n' +
  '12/03/2026 21:03:58\tGanado\t\t0,18\n' +
  '16/04/2026 21:02:57\tGanado\tRestaurar por corrección de resultados de la reserva 228156\t0,72\n' +
  '16/04/2026 21:02:57\tGanado\t\t0,86\n16/04/2026 21:02:57\tGanado\t\t0,99\n' +
  '18/01/2026 20:00:00\tPerdido\t\t0,10\n14/02/2026 20:00:00\tGanado\t\t0,20\n23/09/2026 19:41:59\tGanado\t\t2,90';

/* ---------- lector (sin navegador) ---------- */
const p = C.parse(PASTE);
check('Lee el ranking', p.ranking === 280, p.ranking);
check('Quita «Restaurar por corrección»', p.dropped === 1 && !p.rows.some(r => r.level === 0.72));
check('Quita la fila repetida (misma fecha y hora)', p.duplicates === 1 && p.rows.filter(r => r.at.startsWith('2026-04-16')).length === 1);
check('Ordena por fecha y lee la coma decimal', p.rows[0].at.startsWith('2026-01-18') && p.rows[p.rows.length - 1].level === 2.9);
const r1 = C.seasonRange({ season: { slug: '2026-s1' }, months: [{ label: 'Febrero' }, { label: 'Julio' }] });
check('Rango del S1 masculino: feb–jul', r1.from === '2026-02-01' && r1.to === '2026-08-01', JSON.stringify(r1));
const r2 = C.seasonRange({ season: { slug: '2026-s1-mixta' }, months: [{ label: 'Enero' }, { label: 'Julio-Agosto' }, { label: 'Septiembre' }] });
check('Rango del mixto: ene–sep', r2.from === '2026-01-01' && r2.to === '2026-10-01', JSON.stringify(r2));
check('Todo el recorrido: sin filtro', C.seasonRange({ season: { slug: 'all:masculina' }, months: [{ label: 'Febrero' }] }) === null);

(async () => {
  const A = JSON.parse(fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8')); A.season.kind = 'masculina';
  const X = { season: { slug: '2026-s1-mixta', name: 'Mixta', kind: 'mixta' }, months: [[1, 'Enero'], [2, 'Febrero']],
    teams: [[500, 'Ana/Pep', 'Ana', 'Pep', false], [501, 'Francisco/Laura', 'Francisco', 'Laura', true]],
    standings: [[1, 1, 500, 1], [1, 1, 501, 2], [2, 1, 501, 1], [2, 1, 500, 2]],
    matches: [[1, 1, 500, 501, [[6, 1], [6, 1]], null], [2, 1, 500, 501, [[1, 6], [1, 6]], null]], archetypes: {} };
  const SN = { '2026-s1': A, '2026-s1-mixta': X };
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const db = {}; const imports = [];
  await page.route('**/rest/v1/rpc/get_league_snapshot', r => J(r, SN[JSON.parse(r.request().postData()).season_slug]));
  await page.route('**/rest/v1/rpc/list_seasons', r => J(r, [{ slug: '2026-s1', name: 'S1', kind: 'masculina' }, { slug: '2026-s1-mixta', name: 'Mixta', kind: 'mixta' }]));
  await page.route('**/rest/v1/rpc/get_my_profile', r => J(r, { label: 'Francisco', category: 'masculina', playsMixed: true, defaultKind: 'masculina' }));
  await page.route('**/rest/v1/rpc/get_my_round', r => J(r, null));
  await page.route('**/rest/v1/rpc/list_my_records', r => J(r, []));
  await page.route('**/rest/v1/rpc/get_my_club_levels', r => J(r, db));
  await page.route('**/rest/v1/rpc/import_club_levels', r => {
    const a = JSON.parse(r.request().postData()); imports.push(a);
    db[a.p_who] = { ranking: a.p_ranking, name: a.p_name, rows: a.p_rows };
    J(r, { added: a.p_rows.length, updated: 0, total: a.p_rows.length });
  });
  await page.addInitScript(() => localStorage.setItem('padel-scouting.session.v1', JSON.stringify({
    access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: 'x' } })));
  const clearModal = () => page.evaluate(() => { document.getElementById('modal-root').innerHTML = ''; document.body.classList.remove('has-modal'); });

  await page.goto(BASE); await page.waitForTimeout(2500); await clearModal();
  await page.evaluate(() => window.PadelApp.go('temporada'));
  await page.waitForSelector('[data-metric="club"]'); await page.waitForTimeout(800);
  check('Sin importar: la línea del club viene del histórico de la app', !(await page.isDisabled('[data-metric="club"]')));
  check('Sin marca de mixto en la leyenda', !(await page.textContent('#view')).includes('Mixto (solo'));
  check('Botón «Importar histórico de juego»', await page.locator('[data-action="club-import"]').count() === 1);

  await page.click('[data-action="club-import"]'); await page.waitForTimeout(200);
  await page.fill('#ci-text', PASTE); await page.waitForTimeout(300);
  check('Vista previa: partidos, ranking y descartes', /5 partidos.*ranking 280.*restaurar/s.test(await page.textContent('.modal .note')),
    await page.textContent('.modal .note'));
  await page.click('[data-ci="save"]'); await page.waitForTimeout(500);
  check('Guarda lo tuyo en tu cuenta', imports[0] && imports[0].p_who === 'me' && imports[0].p_ranking === 280 && imports[0].p_rows.length === 5);
  await page.click('[data-ci="again"]'); await page.waitForTimeout(150);
  await page.click('[data-ci-who="partner"]'); await page.waitForTimeout(150);
  check('Pareja: propone el nombre de tu pareja de esta competición', (await page.inputValue('#ci-name')) === 'Cristian');
  await page.fill('#ci-text', 'Ranking: 350\n12/03/2026 21:03:58\tGanado\t\t0,18\n21/03/2026 20:00:00\tPerdido\t\t0,16');
  await page.waitForTimeout(250);
  await page.click('[data-ci="save"]'); await page.waitForTimeout(500);
  check('La pareja se guarda por competición', imports[1] && imports[1].p_who === 'partner:masculina' && imports[1].p_name === 'Cristian');
  await page.click('[data-ci="close"]'); await page.waitForTimeout(1200);
  const cd = await page.evaluate(() => window.PadelTemporada.club());
  check('Masculino S1: solo feb–jul', cd.fran.length === 3 && cd.fran.every(x => x.at >= '2026-02' && x.at < '2026-08'), cd.fran.map(x => x.fecha).join(','));
  check('Masculino: tu línea y la de tu pareja', cd.cris.length === 2 && cd.partnerName === 'Cristian');
  check('Enseña los rankings', (await page.textContent('#clubRow')).includes('280') && (await page.textContent('#clubRow')).includes('350'));

  await page.click('#comp-btn'); await page.click('#comp-menu [data-kind="mixta"]'); await page.waitForTimeout(1800); await clearModal();
  await page.evaluate(() => window.PadelApp.go('temporada')); await page.waitForSelector('[data-metric="club"]'); await page.waitForTimeout(600);
  const cm = await page.evaluate(() => window.PadelTemporada.club());
  check('Mixto: tu misma línea del club (sin distinguir liga)', cm.fran.length === 2 && cm.fran[0].nivel === 0.1, cm.fran.map(x => x.fecha).join(','));
  check('Mixto: tu pareja de mixto, no la de masculino', cm.cris.length === 0 && cm.partnerName === 'Laura');
  check('Mixto: la métrica del club también está', !(await page.isDisabled('[data-metric="club"]')));

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
