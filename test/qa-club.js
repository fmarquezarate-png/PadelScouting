/* Nivel del club: lector del histórico, escalera igual en masculino y mixto, importar tuyo y de tu pareja. */
const { chromium } = require('playwright');
const fs = require('fs');
const C = require('../js/club.js');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const EXE = require('./chrome-path');
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
/* El histórico real de Fran (19/11/2026): 5 correcciones del club. */
const REAL = C.parse(fs.readFileSync(__dirname + '/fixtures/club-historico-correcciones.txt', 'utf8'));
const lv = d => (REAL.rows.filter(r => r.at.startsWith(d)).map(r => r.level));
check('Real: 39 partidos (49 líneas − 5 «restaurar» − 5 apuntes erróneos)', REAL.rows.length === 39 && REAL.corrections === 5 && REAL.removed === 5,
  REAL.rows.length + ' / ' + REAL.corrections + ' / ' + REAL.removed);
check('Real: el 21/10 queda una derrota a 2,99 con la fecha del partido (no el 3,15 erróneo)', JSON.stringify(lv('2026-10-21')) === '[2.99]' && !lv('2026-10-22').length,
  JSON.stringify(lv('2026-10-21')) + ' ' + JSON.stringify(lv('2026-10-22')));
check('Real: sin puntos repetidos el 16/04, 29/06 y 17/11', lv('2026-04-16').join() === '0.72,0.86' && lv('2026-06-29').join() === '2.13' && lv('2026-11-17').join() === '3.09',
  [lv('2026-04-16'), lv('2026-06-29'), lv('2026-11-17')].join(' | '));
check('Real: sabe hasta dónde llega el texto (para ocultar lo erróneo guardado antes)', REAL.span && REAL.span.to === '2026-11-17T14:56:16Z');
check('Real: hora de una cifra (8:49) bien leída', lv('2026-11-17').length === 1 && REAL.rows.some(r => r.at === '2026-11-17T08:49:09Z'));
check('Real: sin «Ranking:» en el texto, el ranking queda vacío (se escribe a mano)', REAL.ranking === null);
const REV = C.parse(fs.readFileSync(__dirname + '/fixtures/club-historico-correcciones.txt', 'utf8').split('\n').reverse().join('\n'));
check('Pegado al revés (lo más nuevo arriba): da lo mismo', REV.rows.length === 39 && REV.rows.map(r => r.level).join() === REAL.rows.map(r => r.level).join());
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
  const db = {}; const imports = []; let oldDb = false;
  await page.route('**/rest/v1/rpc/get_league_snapshot', r => J(r, SN[JSON.parse(r.request().postData()).season_slug]));
  await page.route('**/rest/v1/rpc/list_seasons', r => J(r, [{ slug: '2026-s1', name: 'S1', kind: 'masculina' }, { slug: '2026-s1-mixta', name: 'Mixta', kind: 'mixta' }]));
  await page.route('**/rest/v1/rpc/get_my_profile', r => J(r, { label: 'Francisco', category: 'masculina', playsMixed: true, defaultKind: 'masculina' }));
  await page.route('**/rest/v1/rpc/get_my_round', r => r.abort());
  await page.route('**/rest/v1/rpc/list_my_records', r => J(r, []));
  await page.route('**/rest/v1/rpc/get_my_club_levels', r => J(r, db));
  await page.route('**/rest/v1/rpc/import_club_levels', r => {
    const a = JSON.parse(r.request().postData()); imports.push(a);
    /* Base sin la migración 19b: la versión con p_to aún no existe → la app reintenta sin él. */
    if (a.p_to && oldDb) return r.fulfill({ status: 404, contentType: 'application/json',
      body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.import_club_levels(p_name, p_ranking, p_rows, p_to, p_who) in the schema cache' }) });
    /* Como la base: el nombre lo pone el jugador (la pareja de masculino es Cristian). */
    db[a.p_who] = { ranking: a.p_ranking, name: a.p_who === 'me' ? null : 'Cristian', rows: a.p_rows };
    J(r, { added: a.p_rows.length, updated: 0, total: a.p_rows.length });
  });
  /* Reloj fijo: el aviso de «nuevo mes» no depende del día en que se pase la prueba. */
  await page.addInitScript(() => { window.__PADEL_NOW__ = '2026-09-20T12:00:00Z'; });
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
  check('Vista previa: partidos y correcciones del club', /5 partidos.*corrección del club aplicada/s.test(await page.textContent('.modal .note')),
    await page.textContent('.modal .note'));
  check('Vista previa: el ranking leído queda en su casilla (editable)', (await page.inputValue('#ci-rank')) === '280');
  await page.click('[data-ci="save"]'); await page.waitForTimeout(500);
  check('Guarda lo tuyo en tu cuenta', imports[0] && imports[0].p_who === 'me' && imports[0].p_ranking === 280 && imports[0].p_rows.length === 5);
  await page.click('[data-ci="again"]'); await page.waitForTimeout(150);
  await page.click('[data-ci-who="partner"]'); await page.waitForTimeout(150);
  check('Pareja: sin pedir nombre (lo pone el jugador) y avisa de quién lo ve', await page.locator('#ci-name').count() === 0 &&
    (await page.textContent('.modal')).includes('Se guarda en el jugador'));
  await page.fill('#ci-text', 'Ranking: 350\n12/03/2026 21:03:58\tGanado\t\t0,18\n21/03/2026 20:00:00\tPerdido\t\t0,16');
  await page.waitForTimeout(250);
  await page.click('[data-ci="save"]'); await page.waitForTimeout(500);
  check('La pareja se guarda por competición', imports[1] && imports[1].p_who === 'partner:masculina');
  check('Manda hasta dónde llega el texto (para ocultar apuntes erróneos guardados antes)', imports[0].p_to && imports[1].p_to === '2026-03-21T20:00:00Z', imports[1].p_to);
  /* Histórico real sin «Ranking:»: se escribe a mano; y con la base sin actualizar sigue guardando. */
  oldDb = true;
  await page.click('[data-ci="again"]'); await page.waitForTimeout(150);
  await page.click('[data-ci-who="me"]'); await page.waitForTimeout(150);
  await page.fill('#ci-text', fs.readFileSync(__dirname + '/fixtures/club-historico-correcciones.txt', 'utf8')); await page.waitForTimeout(300);
  const nt = await page.textContent('.modal .note');
  check('Real: la vista previa cuenta 39 partidos y 5 correcciones', /39 partidos.*5 correcciones del club aplicadas.*5 apuntes erróneos/s.test(nt), nt);
  check('Real: casilla de ranking vacía para escribirlo', (await page.inputValue('#ci-rank')) === '');
  await page.fill('#ci-rank', '412'); await page.waitForTimeout(100);
  await page.click('[data-ci="save"]'); await page.waitForTimeout(700);
  const last = imports[imports.length - 1];
  check('Ranking escrito a mano se guarda', last && last.p_ranking === 412 && last.p_rows.length === 39, last && last.p_ranking);
  check('Base sin actualizar: reintenta sin p_to y guarda igual', imports.length === 4 && imports[2].p_to && !('p_to' in imports[3]) &&
    !(await page.textContent('.modal')).includes('schema cache'), imports.length);
  oldDb = false;
  /* Lo de abajo comprueba la gráfica con el primer histórico: se deja como estaba. */
  db.me = { ranking: imports[0].p_ranking, name: null, rows: imports[0].p_rows };
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
