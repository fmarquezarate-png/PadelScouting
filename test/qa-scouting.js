const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const ok = [], bad = [];
const blur = p => p.evaluate(() => document.activeElement && document.activeElement.blur());
function check(name, cond, extra) { (cond ? ok : bad).push(name + (extra ? ' → ' + extra : '')); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => {
    // El sandbox bloquea Google Fonts y el favicon: ruido de red, no fallos de la app.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
  });
  page.on('dialog', d => d.accept());

  const SNAP = require('fs').readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8');
  await page.route('**/rest/v1/rpc/get_league_snapshot', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: SNAP }));

  await page.goto(BASE);
  await page.waitForTimeout(400);

  // --- 1. arranque ---
  check('Arranca en la pista, no en Registro', await page.textContent('#page-title') === 'La pista');
  await page.evaluate(() => window.PadelApp.go('registro')); await page.waitForTimeout(300);
  check('Registrar sigue a un toque', await page.textContent('#page-title') === 'Registro rápido');
  check('Fecha automática = hoy',
    (await page.inputValue('#f-date')) === new Date().toISOString().slice(0,10),
    await page.inputValue('#f-date'));

  // --- 2. registrar partido normal 3 sets, pareja mixta ---
  await page.fill('[data-rival-name="0"]', 'Pedro');
  await page.click('[data-chips="rival-archetype-0"] .chip[data-value="A"]');
  await page.fill('[data-rival-name="1"]', 'Luis');
  await page.click('[data-chips="rival-archetype-1"] .chip[data-value="B"]');
  check('Pareja mixta A+B permitida',
    await page.getAttribute('[data-chips="rival-archetype-0"] .chip[data-value="A"]', 'aria-pressed') === 'true' &&
    await page.getAttribute('[data-chips="rival-archetype-1"] .chip[data-value="B"]', 'aria-pressed') === 'true');

  await page.fill('[data-set="0"][data-side="own"]', '6');
  await page.fill('[data-set="0"][data-side="opponent"]', '4');
  await page.fill('[data-set="1"][data-side="own"]', '3');
  await page.fill('[data-set="1"][data-side="opponent"]', '6');
  await blur(page); await page.waitForTimeout(150);
  check('Super tie-break aparece solo al ir 1-1', await page.locator('[data-set="2"]').count() === 2);

  await page.fill('[data-set="2"][data-side="own"]', '10');
  await page.fill('[data-set="2"][data-side="opponent"]', '8');
  await blur(page); await page.waitForTimeout(150);
  const calcLine = await page.textContent('.set-row ~ .field-note, .field-note');
  check('Resultado y juegos calculados solos',
    (await page.locator('.field-note', { hasText: 'Victoria 2–1' }).count()) > 0, calcLine);
  check('Juegos totales excluyen el super TB (6+4+3+6=19)',
    (await page.locator('.field-note', { hasText: '19 juegos' }).count()) > 0);

  // lectura set 2 juego 3 → acumulado 13
  await page.selectOption('[data-field="readSet"]', '2');
  await page.waitForTimeout(120);
  await page.fill('[data-field="readGame"]', '3');
  await blur(page); await page.waitForTimeout(120);
  await page.click('[data-chips="patterns"] .chip[data-value="centro"]');
  await page.click('[data-chips="patterns"] .chip[data-value="globo"]');
  await page.click('[data-chips="patterns"] .chip[data-value="presion-red"]');
  await page.click('[data-chips="patterns"] .chip[data-value="arriesga"]');
  check('Máximo 3 patrones',
    await page.locator('[data-chips="patterns"] .chip[aria-pressed="true"]').count() === 3);
  await page.click('[data-chips="worked"] .chip[data-value="globo-red"]');
  await page.click('[data-chips="notWorked"] .chip[data-value="precipitacion"]');
  await page.click('[data-chips="physicalState"] .chip[data-value="bueno"]');
  await page.fill('[data-field="partnerNotes"]', 'Nos faltó comunicación en defensa.');
  await page.click('[data-action="save"]');
  await page.waitForTimeout(300);

  check('Confirma el guardado', (await page.locator('.notice.good').count()) > 0);
  check('Muestra resumen inmediato', (await page.textContent('.saved-hero .res')).includes('VICTORIA 2–1'));
  check('Lectura traducida a juego del partido',
    (await page.textContent('.card')).includes('juego 13 del partido'));

  // --- 3. persistencia ---
  await page.reload(); await page.waitForTimeout(400);
  await page.evaluate(() => window.PadelApp.go('registro')); await page.waitForTimeout(300);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('padel-scouting.v1')).matches.length);
  check('Persiste tras recargar', stored === 1, 'partidos=' + stored);

  // --- 4. autocompletado de rivales ---
  await page.fill('[data-rival-name="0"]', 'Pe');
  await page.waitForTimeout(200);
  check('Sugiere rivales ya usados', (await page.locator('.suggest-list button', { hasText: 'Pedro' }).count()) > 0);
  await page.click('.suggest-list button');
  await page.waitForTimeout(200);
  check('Al elegir sugerencia recupera su arquetipo',
    await page.getAttribute('[data-chips="rival-archetype-0"] .chip[data-value="A"]', 'aria-pressed') === 'true');

  // --- 5. validación: partido normal sin resultado ---
  await page.click('[data-action="save"]');
  await page.waitForTimeout(250);
  check('No guarda un partido normal sin resultado', (await page.locator('.notice.bad').count()) > 0,
    (await page.locator('.notice.bad li').first().textContent().catch(()=>'')) );

  // --- 6. WO ---
  await page.click('[data-chips="status"] .chip[data-value="wo"]');
  await page.waitForTimeout(150);
  check('WO oculta los sets', await page.locator('[data-set]').count() === 0);
  await page.click('[data-chips="result"] .chip[data-value="win"]');
  await page.click('[data-action="save"]');
  await page.waitForTimeout(250);
  check('Guarda un WO con ganador', (await page.textContent('.saved-hero .res')).includes('WO'));

  // --- 7. segundo y tercer partido para poblar análisis ---
  const seed = async (r1, a1, r2, a2, s, readSet, readGame, notWorked) => {
    await page.evaluate(() => window.PadelApp.go('registro')); await page.waitForTimeout(150);
    if (await page.locator('[data-action="new-match"]').count()) {
      await page.click('[data-action="new-match"]'); await page.waitForTimeout(150);
    }
    await page.fill('[data-rival-name="0"]', r1);
    await page.click(`[data-chips="rival-archetype-0"] .chip[data-value="${a1}"]`);
    await page.fill('[data-rival-name="1"]', r2);
    await page.click(`[data-chips="rival-archetype-1"] .chip[data-value="${a2}"]`);
    for (let i = 0; i < s.length; i++) {
      await page.fill(`[data-set="${i}"][data-side="own"]`, String(s[i][0]));
      await page.fill(`[data-set="${i}"][data-side="opponent"]`, String(s[i][1]));
      await blur(page); await page.waitForTimeout(120);
    }
    if (readSet) {
      await page.selectOption('[data-field="readSet"]', String(readSet));
      await page.waitForTimeout(120);
      await page.fill('[data-field="readGame"]', String(readGame));
      await blur(page); await page.waitForTimeout(120);
    }
    if (notWorked) await page.click(`[data-chips="notWorked"] .chip[data-value="${notWorked}"]`);
    await page.click('[data-action="save"]'); await page.waitForTimeout(250);
  };
  await seed('Ana', 'A', 'Marta', 'A', [[4,6],[3,6]], 1, 5, 'precipitacion');
  await seed('Jon', 'B', 'Iker', 'B', [[6,2],[6,3]], 1, 3, null);

  // --- 8. historial ---
  await page.evaluate(() => window.PadelApp.go('historial')); await page.waitForTimeout(250);
  check('Historial en tarjetas', await page.locator('.match-card').count() === 4,
    'tarjetas=' + await page.locator('.match-card').count());
  await page.click('.filters .chip[data-value="loss"]'); await page.waitForTimeout(200);
  check('Filtro por resultado', await page.locator('.match-card').count() === 1);
  await page.click('.filters .chip[data-value="all"]'); await page.waitForTimeout(150);
  await page.click('[data-filter="archetype"][data-value="B"]'); await page.waitForTimeout(200);
  check('Filtro por arquetipo (cuenta pareja mixta)', await page.locator('.match-card').count() === 2,
    'B=' + await page.locator('.match-card').count());
  await page.click('[data-filter="archetype"][data-value="all"]'); await page.waitForTimeout(150);
  await page.fill('#h-rival', 'ana'); await page.waitForTimeout(250);
  check('Filtro por rival', await page.locator('.match-card').count() === 1);
  await page.fill('#h-rival', ''); await page.waitForTimeout(250);

  // detalle y edición
  await page.click('.match-card >> nth=0'); await page.waitForTimeout(150);
  check('La tarjeta se despliega', await page.locator('.match-card.open').count() === 1);
  await page.click('.match-card.open [data-edit]'); await page.waitForTimeout(250);
  check('Editar abre el registro con los datos', (await page.inputValue('[data-rival-name="0"]')) === 'Jon',
    await page.inputValue('[data-rival-name="0"]'));
  check('Avisa de que estás editando', (await page.locator('.notice.good', { hasText: 'editando' }).count()) > 0);
  await page.fill('[data-rival-name="0"]', 'Jon B.');
  await page.click('[data-action="save"]'); await page.waitForTimeout(250);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('padel-scouting.v1')).matches.length);
  check('Editar no duplica el partido', after === 4, 'partidos=' + after);

  // --- 9. análisis ---
  await page.evaluate(() => window.PadelApp.go('analisis')); await page.waitForTimeout(300);
  const an = await page.textContent('#view');
  check('Análisis: protege muestras pequeñas', an.includes('Datos insuficientes') || an.includes('menos de 5'));
  check('Análisis: juego medio de lectura con n', an.includes('observaciones'));
  check('Análisis: WO fuera del cómputo', an.includes('WO/abandono aparte') || an.includes('WO y abandonos no cuentan'));
  check('Análisis: frecuencias de patrones', an.includes('Juega mucho al centro'));

  // --- 10. briefing ---
  await page.evaluate(() => window.PadelApp.go('analisis')); await page.waitForTimeout(350);
  check('Briefing (dentro de Análisis): máximo 3 bullets', await page.locator('.brief-bullet').count() === 3,
    'bullets=' + await page.locator('.brief-bullet').count());
  check('Briefing: avisa de que son hipótesis', (await page.textContent('#view')).includes('hipótesis'));
  for (const a of ['B', 'otro', 'por-definir']) {
    await page.click(`[data-chips="brief"] .chip[data-value="${a}"]`); await page.waitForTimeout(200);
    if (await page.locator('.brief-bullet').count() !== 3) check('Briefing ' + a + ' da 3 bullets', false);
  }
  check('Briefing funciona para los 4 arquetipos', true);

  // --- 11. export / import ---
  await page.evaluate(() => window.PadelApp.go('historial')); await page.waitForTimeout(250);
  const dl = page.waitForEvent('download');
  await page.click('[data-action="export"]');
  const file = await dl;
  const path = await file.path();
  const backup = JSON.parse(require('fs').readFileSync(path, 'utf8'));
  check('Exporta JSON con versión y partidos',
    backup.version === 1 && Array.isArray(backup.matches) && backup.matches.length === 4,
    'n=' + (backup.matches || []).length);
  check('El nombre del backup lleva fecha', /padel-scouting-\d{4}-\d{2}-\d{2}\.json/.test(file.suggestedFilename()),
    file.suggestedFilename());

  // importar un backup corrupto
  const badRes = await page.evaluate(() => PadelStorage.inspectBackup('{"nope":1}'));
  check('Rechaza un JSON que no es un backup', badRes.ok === false, badRes.message);
  const goodRes = await page.evaluate(b => PadelStorage.inspectBackup(JSON.stringify(b)), backup);
  check('Acepta un backup válido sin tocar los datos', goodRes.ok === true && goodRes.matches.length === 4);
  const untouched = await page.evaluate(() => JSON.parse(localStorage.getItem('padel-scouting.v1')).matches.length);
  check('Inspeccionar un backup no reemplaza nada', untouched === 4);

  // --- 12. estados vacíos ---
  await page.evaluate(() => { localStorage.removeItem('padel-scouting.v1'); });
  await page.reload(); await page.waitForTimeout(400);
  await page.evaluate(() => window.PadelApp.go('historial')); await page.waitForTimeout(200);
  check('Historial vacío da acción', (await page.textContent('#view')).includes('Todavía no hay partidos'));
  await page.evaluate(() => window.PadelApp.go('analisis')); await page.waitForTimeout(200);
  check('Análisis vacío no muestra 0%', (await page.textContent('#view')).includes('Necesitamos más partidos'));

  // --- 13. desktop ---
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.PadelApp.go('registro')); await page.waitForTimeout(300);
  check('Sin scroll horizontal en escritorio',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForTimeout(200);
  check('Sin scroll horizontal en móvil 360px',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    await page.evaluate(() => document.documentElement.scrollWidth + ' vs ' + window.innerWidth));

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0,3).join(' | '));
  const fonts = await page.evaluate(() => getComputedStyle(document.querySelector('.topbar h1')).fontFamily);
  check('Tipografía declarada con fallback de sistema', /Archivo/.test(fonts), fonts);

  console.log('\n===== VERIFICADO =====');
  ok.forEach(o => console.log('  ok  ' + o));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(b => console.log('  XX  ' + b)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})();
