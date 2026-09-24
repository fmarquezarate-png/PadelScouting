/* Vista pública: quien entra con el link sin ser jugador ve la liga, no a Francisco,
   y puede elegir cualquier pareja para analizarla. */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SNAP = fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8');
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e != null ? ' → ' + e : ''));

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const errors = [];
  const mk = async () => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    p.on('pageerror', e => errors.push(String(e)));
    await p.route('**/rest/v1/rpc/get_league_snapshot', r => r.fulfill({ status: 200, contentType: 'application/json', body: SNAP }));
    return p;
  };
  const go = async (p, v) => { await p.evaluate(v => window.PadelApp.go(v), v); await p.waitForTimeout(700); };
  const text = p => p.textContent('#view');

  /* ---------- visitante ---------- */
  const page = await mk();
  await page.goto(BASE); await page.waitForTimeout(1500);
  let t = await text(page);
  check('Portada: sin pareja por defecto (ni Francisco ni Cristian)', !/Francisco|Cristian/.test(t));
  check('Portada: resumen de la liga', t.includes('parejas') && t.includes('grupos'));
  check('Portada: invita a elegir una pareja', await page.locator('[data-pair="pick"]').count() >= 1);
  check('Nadie marcado como «mío» en el modelo', await page.evaluate(() => {
    const m = window.PadelLiga.state.model; return m.myTeamId === null && m.ownTeamId === null; }));

  await go(page, 'temporada');
  check('Temporada sin pareja: pide elegir una', (await text(page)).includes('Elige una pareja'));
  check('La barra enseña el botón de pareja', await page.isVisible('#pair-btn') && (await page.textContent('#pair-btn')).includes('Elige una'));
  await go(page, 'liga');
  check('La liga se ve entera sin pareja', (await text(page)).length > 500);
  await go(page, 'rival');
  check('El rival sin pareja: explica que se mira desde una', (await text(page)).includes('se mira desde una pareja'));

  /* elegir una pareja */
  await go(page, 'temporada');
  await page.click('#pair-btn'); await page.waitForTimeout(300);
  check('El selector lista las parejas por puesto', await page.locator('.pp-item').count() >= 70);
  await page.fill('#pp-q', 'yago'); await page.waitForTimeout(300);
  const n = await page.locator('.pp-item').count();
  check('El buscador filtra', n >= 1 && n < 5, 'n=' + n);
  await page.click('.pp-item >> nth=0'); await page.waitForTimeout(1200);
  t = await text(page);
  check('Temporada de la pareja elegida', t.includes('La temporada en números'));
  check('El título dice «Su temporada»', (await page.textContent('#page-title')) === 'Su temporada');
  check('El botón de pareja enseña la elegida', /yago/i.test(await page.textContent('#pair-btn')));
  check('Sin nivel del club de otra cuenta', await page.isDisabled('[data-metric="club"]'));
  await go(page, 'cronica');
  t = await text(page);
  check('Crónica de la pareja elegida', t.includes('Escrita sola con sus') && t.includes('Acto I'));
  check('Sin los golpes escritos a mano (son de tu pareja)', !t.includes('Izquierda y derecha'));
  await go(page, 'rival');
  check('El rival se mira desde la pareja elegida', await page.locator('.rival-line').count() > 20);
  await page.reload(); await page.waitForTimeout(1500);
  check('Recuerda la pareja elegida', await page.evaluate(() => {
    const m = window.PadelLiga.state.model; return !!m.myTeamId && /Yago/.test(m.teams[m.myTeamId].label); }));
  await go(page, 'estemes');
  check('Este mes sigue siendo personal: pide entrar', (await text(page)).includes('Entrar con mi cuenta'));
  await page.close();

  /* ---------- Francisco identificado ---------- */
  const fr = await mk();
  await fr.addInitScript(() => localStorage.setItem('padel-scouting.me.v1', JSON.stringify({ label: 'Francisco' })));
  await fr.goto(BASE); await fr.waitForTimeout(1500);
  check('Identificado: tu pareja por defecto', /Francisco/i.test(await text(fr)));
  await go(fr, 'temporada');
  await fr.click('#pair-btn'); await fr.waitForTimeout(300);
  check('Identificado: «Mi pareja» en el selector', await fr.locator('[data-pp="own"]').count() === 1);
  await fr.fill('#pp-q', 'ernesto'); await fr.waitForTimeout(300);
  await fr.click('.pp-item >> nth=0'); await fr.waitForTimeout(1000);
  check('Mirando a otra: el botón se marca', await fr.getAttribute('#pair-btn', 'class').then(c => c.includes('other')));
  await go(fr, 'inicio');
  check('Portada: «Volver a la mía»', await fr.locator('[data-pair="own"]').count() === 1);
  await fr.click('[data-pair="own"]'); await fr.waitForTimeout(1200);
  check('Vuelve a tu pareja', await fr.evaluate(() => { const m = window.PadelLiga.state.model; return m.myTeamId === m.ownTeamId && !!m.ownTeamId; }));
  await fr.close();

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
