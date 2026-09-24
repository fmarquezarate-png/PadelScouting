/* ============================================================
   qa-rival.js · el rival, el motor y la caché
   ============================================================ */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const SNAP = fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8');
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e != null ? ' → ' + e : ''));

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  /* Entras como Francisco (lo que hace Mi perfil). Sin esto la app no enseña ninguna pareja. */
  await page.addInitScript(() => { if (!localStorage.getItem('padel-scouting.me.v1')) localStorage.setItem('padel-scouting.me.v1', JSON.stringify({ label: 'Francisco' })); });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  let calls = 0;
  await page.route('**/rest/v1/rpc/get_league_snapshot', r => {
    calls++; r.fulfill({ status: 200, contentType: 'application/json', body: SNAP });
  });
  const go = async v => { await page.evaluate(v => window.PadelApp.go(v), v); await page.waitForTimeout(700); };

  await page.goto(BASE); await page.waitForTimeout(900);
  check('Una sola llamada a la base', calls === 1, 'llamadas=' + calls);

  await page.reload(); await page.waitForTimeout(800);
  check('Recargar usa la caché, no vuelve a descargar', calls === 1, 'llamadas=' + calls);
  await go('temporada');
  check('Avisa de que los datos son locales', (await page.textContent('#view')).includes('guardados en el móvil'));
  check('Publica el acierto del motor', (await page.textContent('#view')).includes('61,3%'));
  check('Avisa del sesgo de orden de la tabla', (await page.textContent('#view')).includes('listado primero'));

  await go('rival');
  check('El rival lista todas las parejas (no solo 40)', await page.locator('.rival-line').count() === 80,
    'n=' + await page.locator('.rival-line').count());

  check('El rival arranca con el listado', await page.locator('.rival-line').count() > 0);
  check('No se ofrece a sí mismo como rival', !(await page.textContent('#view')).includes('Francisco /Cristian C'));
  await page.fill('#rival-search', 'ferran'); await page.waitForTimeout(400);
  const found = await page.locator('.rival-line').count();
  check('El buscador filtra', found > 0 && found < 40, 'resultados=' + found);
  await page.click('.rival-line >> nth=0'); await page.waitForTimeout(500);
  const rep = await page.textContent('#view');
  check('Informe: proyección', rep.includes('probabilidad de que ganemos'));
  check('Informe: simulaciones', /\d{3,} simulaciones/.test(rep));
  check('Informe: ¿ya hemos jugado?', rep.includes('¿Ya hemos jugado?'));
  check('Informe: ellos vs nosotros', rep.includes('Ellos vs nosotros'));
  check('Informe: cómo vienen', rep.includes('Cómo vienen'));
  check('Informe: lectura', await page.locator('.brief-bullet').count() > 0);

  const twice = await page.evaluate(() => {
    const m = window.PadelLiga.state.model, id = window.PadelLiga.state.rivalId;
    const a = window.Liga.project(m, m.myTeamId, id, { scale: m.scale }).winProbability;
    const b = window.Liga.project(m, m.myTeamId, id, { scale: m.scale }).winProbability;
    return a === b;
  });
  check('Dos consultas seguidas dan el mismo número', twice);

  await page.evaluate(() => { window.PadelLiga.state.rivalId = 64; window.PadelApp.go('rival'); });
  await page.waitForTimeout(500);
  check('Historial directo contra Yago: 2–0', (await page.textContent('#view')).includes('2–0'));

  await page.evaluate(() => { window.PadelLiga.state.rivalId = 71; window.PadelApp.go('rival'); });
  await page.waitForTimeout(500);
  check('Los mismos jugadores con otra pareja', (await page.textContent('#view')).includes('Aleix Samb'));

  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p2.route('**/rest/v1/rpc/get_league_snapshot', r => r.abort());
  await p2.goto(BASE); await p2.waitForTimeout(900);
  check('Sin red y sin caché lo dice claro', (await p2.textContent('#view')).includes('No he podido cargar'));
  await p2.close();

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('\n===== VERIFICADO =====');
  ok.forEach(o => console.log('  ok  ' + o));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(b => console.log('  XX  ' + b)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})();
