const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://127.0.0.1:8111';
const SNAP = fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8');
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e ? ' → ' + e : ''));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

  let calls = 0;
  await page.route('**/rest/v1/rpc/get_league_snapshot', route => {
    calls++;
    route.fulfill({ status: 200, contentType: 'application/json', body: SNAP });
  });

  await page.goto(BASE);
  await page.waitForTimeout(700);

  // --- Liga ---
  check('Arranca en La liga', await page.textContent('#page-title') === 'La liga');
  check('Llama a Supabase una sola vez', calls === 1, 'llamadas=' + calls);
  const liga = await page.textContent('#view');
  check('Muestra nuestro balance real 12–5', liga.includes('12–5'));
  check('Muestra el puesto final #50', liga.includes('#50'), liga.match(/#\d+/g)?.slice(0,3).join(' '));
  check('Muestra el grupo final G13', liga.includes('G13'));
  check('Muestra % de juegos', /5[0-9]%/.test(liga) || /juegos/i.test(liga));
  check('Dibuja la escalera', await page.locator('svg.ladder circle').count() === 5,
    'puntos=' + await page.locator('svg.ladder circle').count());
  check('Lista nuestros 17 partidos', await page.locator('.match-line').count() === 17,
    'lineas=' + await page.locator('.match-line').count());
  check('Publica el acierto del motor', /acierta quién gana en el 6[0-9],\d%|61,3%|61\.3%/.test(liga) || liga.includes('61'));
  check('Avisa del sesgo de orden de la tabla', liga.includes('listado primero'));

  // caché: recargar no vuelve a pedir
  await page.reload(); await page.waitForTimeout(600);
  check('Recargar usa la caché, no vuelve a descargar', calls === 1, 'llamadas=' + calls);
  check('Indica que los datos son locales', (await page.textContent('#view')).includes('guardados en el móvil'));

  // --- Rival desde un partido ---
  await page.click('.match-line >> nth=0'); await page.waitForTimeout(500);
  check('Tocar un partido abre a ese rival', await page.textContent('#page-title') === 'El rival');
  let rep = await page.textContent('#view');
  check('El informe trae la proyección', rep.includes('probabilidad de que ganemos'));
  check('Dice cuántas simulaciones', /\d{3,} simulaciones/.test(rep));
  check('Responde si ya hemos jugado', rep.includes('¿Ya hemos jugado?'));
  check('Compara ellos vs nosotros', rep.includes('Ellos vs nosotros'));
  check('Muestra su trayectoria', rep.includes('Cómo vienen'));
  check('Da lectura accionable', await page.locator('.brief-bullet').count() > 0);

  // consistencia: 2-0 + 2-1 = probabilidad de ganar
  const nums = await page.evaluate(() => {
    const m = window.PadelLiga.state.model;
    const p = window.Liga.project(m, m.myTeamId, window.PadelLiga.state.rivalId, { scale: m.scale });
    const win = p.setOutcomes[0].p + p.setOutcomes[1].p;
    const sum = p.setOutcomes.reduce((s, o) => s + o.p, 0);
    return { win, sum, wp: p.winProbability, diff: Math.abs(win - p.winProbability) };
  });
  check('Las 4 opciones de sets suman 100%', Math.abs(nums.sum - 1) < 1e-9, nums.sum.toFixed(6));
  check('Ganar = 2-0 + 2-1, sin cálculo paralelo', nums.diff < 1e-9);

  // mismo partido, mismo número (semilla fija)
  const twice = await page.evaluate(() => {
    const m = window.PadelLiga.state.model, id = window.PadelLiga.state.rivalId;
    const a = window.Liga.project(m, m.myTeamId, id, { scale: m.scale }).winProbability;
    const b = window.Liga.project(m, m.myTeamId, id, { scale: m.scale }).winProbability;
    return a === b;
  });
  check('Dos consultas seguidas dan el mismo número', twice);

  // --- Buscador de rivales ---
  await page.click('[data-action="clear-rival"]'); await page.waitForTimeout(400);
  check('Vuelve al listado', await page.locator('.rival-line').count() > 0,
    'lineas=' + await page.locator('.rival-line').count());
  check('No se ofrece a sí mismo como rival',
    !(await page.textContent('#view')).includes('Francisco /Cristian C'));
  await page.fill('#rival-search', 'ferran'); await page.waitForTimeout(400);
  const found = await page.locator('.rival-line').count();
  check('El buscador filtra', found > 0 && found < 40, 'resultados=' + found);
  await page.click('.rival-line >> nth=0'); await page.waitForTimeout(500);
  rep = await page.textContent('#view');
  check('Abre el rival buscado', rep.includes('Ferran'));

  // --- Head to head conocido: Yago (id 64), jugamos 2 y ganamos 2 ---
  await page.evaluate(() => { window.PadelLiga.state.rivalId = 64; window.PadelApp.go('rival'); });
  await page.waitForTimeout(500);
  rep = await page.textContent('#view');
  check('Head-to-head correcto contra Yago (2–0)', rep.includes('2–0'), rep.match(/\d–\d/g)?.slice(0,3).join(' '));

  // --- El resto de pantallas siguen vivas ---
  for (const [nav, title] of [['registro','Registro rápido'],['historial','Historial'],['analisis','Análisis']]) {
    await page.click(`[data-nav="${nav}"]`); await page.waitForTimeout(400);
    check('Sigue funcionando: ' + title, await page.textContent('#page-title') === title);
  }
  check('El briefing por arquetipo vive dentro de Análisis',
    (await page.textContent('#view')).includes('Briefing por arquetipo'));
  await page.click('[data-chips="brief"] .chip[data-value="B"]'); await page.waitForTimeout(300);
  check('El briefing sigue respondiendo', await page.locator('.brief-bullet').count() === 3,
    'bullets=' + await page.locator('.brief-bullet').count());

  // --- Sin red y sin caché ---
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p2.route('**/rest/v1/rpc/get_league_snapshot', r => r.abort());
  await p2.goto(BASE); await p2.waitForTimeout(800);
  check('Sin red y sin caché lo dice claro', (await p2.textContent('#view')).includes('No he podido cargar'));
  await p2.close();

  // --- responsive ---
  for (const w of [360, 1280]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.click('[data-nav="rival"]'); await page.waitForTimeout(400);
    check('Sin scroll horizontal a ' + w + 'px',
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log('\n===== VERIFICADO =====');
  ok.forEach(o => console.log('  ok  ' + o));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(b => console.log('  XX  ' + b)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})();
