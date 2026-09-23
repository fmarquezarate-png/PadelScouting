/* ============================================================
   qa-app.js · la app completa contra el dashboard original
   Cada función que tenía "Análisis Liga de Pádel" del primer
   semestre tiene aquí al menos una comprobación. Si algo se pierde
   en un cambio futuro, esta suite lo dice.
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
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  let calls = 0;
  await page.route('**/rest/v1/rpc/get_league_snapshot', r => {
    calls++;
    r.fulfill({ status: 200, contentType: 'application/json', body: SNAP });
  });
  const go = async v => { await page.evaluate(v => window.PadelApp.go(v), v); await page.waitForTimeout(700); };
  const text = () => page.textContent('#view');

  await page.goto(BASE); await page.waitForTimeout(1500);

  /* ---------------- INICIO ---------------- */
  check('Arranca en la pista', await page.textContent('#page-title') === 'La pista');
  check('Sin barra de abajo', await page.locator('.bottom-nav').count() === 0);
  check('Barra de arriba: engranaje, casa, menú y perfil',
    await page.locator('.topbar [data-shell="config"]').count() === 1 &&
    await page.locator('.topbar [data-shell="home"].tb-icon').count() === 1 &&
    await page.locator('#menu-btn').count() === 1 && await page.locator('#avatar-btn').count() === 1);
  check('Sin sesión el avatar invita a entrar', (await page.getAttribute('#avatar-btn', 'aria-label')) === 'Entrar');
  let t = await text();
  check('Portada: puesto actual #50', t.includes('#50'));
  check('Portada: nombres sin la inicial recortada', t.includes('Cristian') && !/Cristian C\b/.test(t));
  check('Portada: grupo y balance', t.includes('G13') && t.includes('12–5'));
  check('Portada: cuenta cuánto habéis subido', t.includes('17 puestos'));
  check('Portada: solo la pista, sin tarjetas repetidas', await page.locator('.home-card').count() === 0);
  check('La pista tiene 7 zonas', await page.locator('.court .zone').count() === 7,
    await page.locator('.court .zone').count());
  check('La pista es la foto realista', await page.evaluate(() => {
    const img = document.querySelector('.court-photo img'); return !!(img && img.complete && img.naturalWidth > 0);
  }));
  check('El rival espera en la puerta', await page.locator('.court .zone.door[data-view="rival"]').count() === 1);
  check('Las zonas son accesibles con teclado',
    await page.locator('.court .zone[tabindex="0"][role="button"]').count() === 7);
  const labels = await page.$$eval('.court .zt', els => els.map(e => e.getBoundingClientRect()));
  let overlap = 0;
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
    const a = labels[i], b = labels[j];
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap++;
  }
  check('Los rótulos de la pista no se pisan', overlap === 0, overlap + ' solapes');

  await page.click('.court .zone[data-view="temporada"]'); await page.waitForTimeout(1300);
  check('Tocar el fondo propio abre la temporada', await page.textContent('#page-title') === 'Nuestra temporada');
  await page.click('.topbar .tb-icon[data-shell="home"]'); await page.waitForTimeout(900);
  check('La casa vuelve a la pista', await page.textContent('#page-title') === 'La pista');
  await page.focus('.court .zone[data-view="liga"]');
  await page.keyboard.press('Enter'); await page.waitForTimeout(1300);
  check('Enter en una zona también navega', await page.textContent('#page-title') === 'La liga');

  /* el menú ☰ */
  await page.click('#menu-btn'); await page.waitForTimeout(350);
  check('☰ abre el panel', await page.locator('#drawer').isVisible() &&
    (await page.getAttribute('#menu-btn', 'aria-expanded')) === 'true');
  check('El panel tiene todas las secciones', await page.locator('[data-drawer-go]').count() === 10);
  check('Marca dónde estás', (await page.getAttribute('[data-drawer-go="liga"]', 'aria-current')) === 'page');
  await page.keyboard.press('Escape'); await page.waitForTimeout(350);
  check('Escape cierra el panel', await page.locator('#drawer').isHidden());
  await page.click('#menu-btn'); await page.waitForTimeout(350);
  await page.click('#scrim', { position: { x: 10, y: 400 } }); await page.waitForTimeout(350);
  check('Tocar fuera cierra el panel', await page.locator('#drawer').isHidden());
  await page.click('#menu-btn'); await page.waitForTimeout(350);
  await page.click('[data-drawer-go="cronica"]'); await page.waitForTimeout(900);
  check('El panel navega', await page.textContent('#page-title') === 'Crónica' && await page.locator('#drawer').isHidden());
  await page.click('.topbar [data-shell="config"]'); await page.waitForTimeout(900);
  check('El engranaje abre Configuración', await page.textContent('#page-title') === 'Configuración');
  await page.click('#avatar-btn'); await page.waitForTimeout(600);
  check('El avatar abre Mi perfil (sin sesión, el acceso)',
    await page.textContent('#page-title') === 'Mi perfil' && await page.locator('#au-email').count() === 1);
  check('Una sola descarga de la liga en toda la sesión', calls === 1, 'llamadas=' + calls);

  /* ---------------- 01 NÚMEROS ---------------- */
  await go('temporada'); await page.waitForTimeout(600);
  t = await text();
  check('01 · 12 indicadores', await page.locator('.tiles .tile').count() === 12,
    await page.locator('.tiles .tile').count());
  for (const [label, v] of [['balance', '12–5'], ['puesto', '67 → 50'], ['grupos', 'G17 → G13'],
    ['sets', '25–15'], ['juegos', '174–149'], ['super tie-breaks', '5–1'], ['primer set', '8/8']]) {
    check('01 · ' + label + ' ' + v, t.includes(v));
  }
  const tileVal = async label => page.evaluate(l => {
    const tile = [...document.querySelectorAll('.tiles .tile')].find(x => x.querySelector('.k').textContent.includes(l));
    return tile ? tile.querySelector('.n').textContent.trim() : null;
  }, label);
  check('01 · remontadas: 4', await tileVal('Remontadas') === '4', await tileVal('Remontadas'));
  check('01 · nivel final 1360', await tileVal('Nivel final') === '1360', await tileVal('Nivel final'));

  /* ---------------- 02 ESCALERA ---------------- */
  check('02 · 5 métricas', await page.locator('#metrics button').count() === 5);
  check('02 · un punto por partido', await page.locator('#chart circle[r]').count() >= 17);
  check('02 · el mes clutch se calcula solo', (await page.textContent('#chart')).includes('ABRIL · 4–0, 4 EN SUPER TB'),
    (await page.textContent('#chart')).match(/[A-Z]+ · [^A-Z]*SUPER TB/)?.[0]);
  const pos0 = await page.textContent('#scrubPos');
  await page.fill('#scrub', '5'); await page.dispatchEvent('#scrub', 'input'); await page.waitForTimeout(200);
  const pos1 = await page.textContent('#scrubPos');
  check('02 · la barra mueve el partido', pos0 !== pos1 && pos1.startsWith('5'), pos1);
  await page.click('#play'); await page.waitForTimeout(1900);
  const pos2 = await page.textContent('#scrubPos');
  check('02 · el play avanza la temporada', pos2 !== pos1, pos1 + ' → ' + pos2);
  await page.click('#play');
  const axis = () => page.evaluate(() => [...document.querySelectorAll('#chart text')].map(x => x.textContent).join(' '));
  const axPos = await axis();
  await page.click('#metrics [data-metric="elo"]'); await page.waitForTimeout(300);
  const axElo = await axis();
  check('02 · cambiar a nivel redibuja el eje', axPos.includes('#') && /\b1[2-5]\d\d\b/.test(axElo) && !axElo.includes('#'),
    axElo.slice(0, 40));
  await page.click('#metrics [data-metric="club"]'); await page.waitForTimeout(400);
  const chartTxt = await page.textContent('#chart');
  check('02 · nivel del club: Francisco y Cristian', chartTxt.includes('Francisco') && chartTxt.includes('Cristian'));
  check('02 · los partidos de mixto van huecos',
    await page.locator('#chart circle[fill="#0E1109"]').count() >= 7,
    await page.locator('#chart circle[fill="#0E1109"]').count());

  /* ---------------- 03 MES A MES + ACANTILADO ---------------- */
  check('03 · 5 tarjetas de mes', await page.locator('.mgrid .mcard').count() === 5);
  check('03 · abril 4–0 destacado', (await page.textContent('.mgrid .mcard.best')).includes('4–0'));
  check('03 · acantilado: 17 barras', await page.locator('#cliff button').count() === 17);
  const b0 = await page.textContent('#bubble');
  await page.click('#cliff button >> nth=0'); await page.waitForTimeout(200);
  const b1 = await page.textContent('#bubble');
  check('03 · tocar una barra cambia el detalle', b0 !== b1);
  check('03 · el más apretado se abre solo (10–9)', b0.includes('10') && b0.includes('9'));

  /* ---------------- 04 PARTIDOS ---------------- */
  const rowsN = async () => page.locator('#rows tr').count();
  check('04 · 17 partidos', await rowsN() === 17);
  for (const [f, n] of [['w', 12], ['l', 5], ['tb', 6], ['cb', 4], ['all', 17]]) {
    await page.click(`#filters [data-f="${f}"]`); await page.waitForTimeout(150);
    check('04 · filtro ' + f + ' = ' + n, await rowsN() === n, await rowsN());
  }
  check('04 · el nivel muestra lo que movió', /[+-]\d+\.\d/.test(await page.textContent('#rows')));

  /* ---------------- 05 RIVALES ---------------- */
  check('05 · 14 rivales distintos', await page.locator('#rivs .riv').count() === 14,
    await page.locator('#rivs .riv').count());
  const firstLad = await page.textContent('#rivs .riv >> nth=0');
  await page.click('#rsort [data-s="times"]'); await page.waitForTimeout(200);
  const firstTimes = await page.textContent('#rivs .riv >> nth=0');
  check('05 · ordenar por veces jugado reordena', firstLad !== firstTimes);
  await page.click('#rivs .riv >> nth=0'); await page.waitForTimeout(200);
  check('05 · tocar abre el detalle', await page.locator('#rivs .riv.open').count() === 1);

  /* ---------------- 06 TECHO ---------------- */
  const split = await page.textContent('.split');
  check('06 · contra los de arriba 0–5', split.includes('0–5'));
  check('06 · contra los de abajo 12–0', split.includes('12–0'));
  check('06 · lista los escalones de cada derrota', await page.locator('.gaps li').count() === 5);

  /* Rival desde un partido de la tabla */
  await page.click('#rows [data-rival] >> nth=0'); await page.waitForTimeout(900);
  check('Un rival de la tabla abre su informe', await page.textContent('#page-title') === 'El rival');
  t = await text();
  check('Rival: proyección', t.includes('probabilidad de que ganemos'));
  const nums = await page.evaluate(() => {
    const m = window.PadelLiga.state.model;
    const p = window.Liga.project(m, m.myTeamId, window.PadelLiga.state.rivalId, { scale: m.scale });
    return { sum: p.setOutcomes.reduce((s, o) => s + o.p, 0),
             diff: Math.abs(p.setOutcomes[0].p + p.setOutcomes[1].p - p.winProbability) };
  });
  check('Rival: las opciones de sets suman 100%', Math.abs(nums.sum - 1) < 1e-9);
  check('Rival: ganar = 2-0 + 2-1', nums.diff < 1e-9);

  /* ---------------- 07 CLASIFICACIÓN ---------------- */
  await go('liga');
  const tblN = () => page.locator('#tblRows tr').count();
  check('07 · 81 parejas', await tblN() === 81, await tblN());
  check('07 · nuestra fila marcada', (await page.textContent('#tblRows tr.mine')).includes('Francisco'));
  await page.click('th.srt[data-k="elo"]'); await page.waitForTimeout(200);
  check('07 · ordenar por nivel', (await page.textContent('#tblRows tr >> nth=0')).includes('Alejandro'),
    (await page.textContent('#tblRows tr >> nth=0')).trim().slice(0, 40));
  await page.fill('#tblSearch', 'ferran'); await page.waitForTimeout(200);
  check('07 · buscar filtra', (await tblN()) > 0 && (await tblN()) < 10, await tblN());
  await page.fill('#tblSearch', ''); await page.waitForTimeout(200);
  await page.click('#btnOnlyMine'); await page.waitForTimeout(200);
  check('07 · solo nuestros rivales (14 + nosotros)', await tblN() === 15, await tblN());
  await page.click('#btnOnlyMine');

  /* ---------------- 08 EXPLORADOR ---------------- */
  check('08 · lista todas las parejas', await page.locator('#expItems button').count() === 81);
  check('08 · arranca con vosotros', (await page.textContent('#expDetail')).includes('sois vosotros'));
  await page.fill('#expSearch', 'Felipe'); await page.waitForTimeout(200);
  await page.click('#expItems button >> nth=0'); await page.waitForTimeout(300);
  const det = await page.textContent('#expDetail');
  check('08 · muestra la temporada de cualquiera', det.includes('Felipe') && /G\d+/.test(det));
  await page.click('#expDetail [data-rival]'); await page.waitForTimeout(900);
  check('08 · analizar como rival desde el explorador', await page.textContent('#page-title') === 'El rival');

  /* ---------------- 09-12 CRÓNICA ---------------- */
  await go('cronica'); await page.waitForTimeout(500);
  t = await text();
  check('09 · tres actos', await page.locator('.acts .act').count() === 3);
  check('10 · el duelo 10–9', t.includes('Ernesto') && t.includes('10–9'));
  check('11 · firmas de los dos', t.includes('Bajada de pared') && t.includes('Víbora'));
  check('12 · los dos niveles del club', t.includes('2,51') && t.includes('1,54'));
  check('Crónica avisa de que es del primer semestre', t.includes('primer semestre'));

  /* ---------------- CARGA ---------------- */
  await go('config');
  check('La carga de datos vive en Configuración', await page.locator('[data-action="open-loader"]').count() === 1);
  await go('liga');
  check('La liga enlaza con la carga', await page.locator('.lg [data-goto="config"]').count() === 1);

  /* ---------------- el resto sigue vivo ---------------- */
  for (const [v, title] of [['registro', 'Registro rápido'], ['historial', 'Historial'], ['analisis', 'Análisis']]) {
    await go(v);
    check('Sigue funcionando: ' + title, await page.textContent('#page-title') === title);
  }

  /* ---------------- responsive ---------------- */
  for (const w of [360, 768, 1360]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const v of ['inicio', 'temporada', 'liga']) {
      await go(v);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check('Sin scroll horizontal · ' + v + ' a ' + w + 'px', over <= 1, over > 1 ? 'sobra ' + over + 'px' : null);
    }
  }
  /* ---------------- la foto: móvil estrecho y reserva sin foto ---------------- */
  {
    const sm = await browser.newPage({ viewport: { width: 360, height: 640 } });
    await sm.route('**/rest/v1/rpc/get_league_snapshot', r => r.fulfill({ status: 200, contentType: 'application/json', body: SNAP }));
    await sm.goto(BASE); await sm.waitForTimeout(1200);
    const outside = await sm.$$eval('.court .zt, .court .zs', els => els.filter(e => {
      const b = e.getBoundingClientRect(); return b.width && (b.left < 0 || b.right > window.innerWidth);
    }).length);
    check('Móvil estrecho: ningún rótulo de la pista se sale de la pantalla', outside === 0, outside + ' fuera');
    const door = await sm.evaluate(() => document.querySelector('.zone.door').getBoundingClientRect().bottom);
    check('Móvil estrecho: «El rival» cabe en la pantalla', door <= 640 + 1, 'bottom=' + door);
    await sm.close();
    const nf = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await nf.route('**/rest/v1/rpc/get_league_snapshot', r => r.fulfill({ status: 200, contentType: 'application/json', body: SNAP }));
    await nf.route('**/assets/pista-*.webp', r => r.abort());
    await nf.goto(BASE); await nf.waitForTimeout(1200);
    check('Sin la foto queda la pista dibujada', await nf.locator('.court-3d .c-surf').count() === 1 &&
      await nf.locator('.court .zone').count() === 7);
    await nf.close();
  }

  /* ---------------- iPhone con isla: la barra no se mete bajo la hora ---------------- */
  {
    const ip = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await ip.route('**/rest/v1/rpc/get_league_snapshot', r => r.fulfill({ status: 200, contentType: 'application/json', body: SNAP }));
    const cdp = await ip.context().newCDPSession(ip);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } });
    await ip.goto(BASE); await ip.waitForTimeout(900);
    const top = await ip.evaluate(() => document.querySelector('.tb-brand').getBoundingClientRect().top);
    check('Zona segura: la barra de arriba empieza bajo la hora del iPhone', top >= 59, 'top=' + top);
    await ip.close();
  }

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log('\n===== VERIFICADO =====');
  ok.forEach(o => console.log('  ok  ' + o));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(b => console.log('  XX  ' + b)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})();
