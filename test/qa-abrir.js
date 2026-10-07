/* Al abrir la app: siempre el semestre más reciente de tu competición
   (alguien nuevo no cae en un semestre pasado; un semestre antiguo no se queda fijo). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SNAP = fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8');
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e != null ? ' → ' + e : ''));
const SEASONS = [
  { slug: '2026-s1', name: 'Temporada 2026 · primer semestre', kind: 'masculina', matches: 561 },
  { slug: '2026-s1-mixta', name: 'Temporada 2026 · primer semestre', kind: 'mixta', matches: 100 },
  { slug: '2026-s2', name: 'Temporada 2026 · segundo semestre', kind: 'masculina', matches: 90 },
  { slug: '2026-s2-mixta', name: 'Temporada 2026 · segundo semestre', kind: 'mixta', matches: 20 }];

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const errors = [];
  async function open(stored) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e)));
    if (stored) await p.addInitScript(s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.setItem('padel-scouting.season.v1', s); } }, stored);
    await p.route('**/rest/v1/rpc/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
    await p.route('**/rest/v1/rpc/list_seasons', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEASONS) }));
    await p.route('**/rest/v1/rpc/get_league_snapshot', r => r.fulfill({ status: 200, contentType: 'application/json', body: SNAP }));
    await p.goto(BASE); await p.waitForTimeout(2000);
    return { p, ctx, now: () => p.evaluate(() => window.PadelDB.currentSeason()) };
  }
  let o = await open(null);
  check('Alguien nuevo abre en el semestre actual (masculino)', await o.now() === '2026-s2', await o.now());
  await o.ctx.close();
  o = await open('2026-s1');
  check('Quien se quedó en el S1 masculino vuelve al S2 al abrir', await o.now() === '2026-s2', await o.now());
  await o.p.evaluate(() => window.PadelApp.switchTo('2026-s1', true)); await o.p.waitForTimeout(1200);
  await o.p.evaluate(() => window.PadelApp.go('liga')); await o.p.waitForTimeout(700);
  check('Dentro de la visita, cambiar al S1 a mano se respeta', await o.now() === '2026-s1', await o.now());
  await o.p.reload(); await o.p.waitForTimeout(2000);
  check('…y al volver a abrir, otra vez el semestre actual', await o.now() === '2026-s2', await o.now());
  await o.ctx.close();
  o = await open('2026-s1-mixta');
  check('En el mixto también: S1 mixto → S2 mixto (no cambia de competición)', await o.now() === '2026-s2-mixta', await o.now());
  await o.ctx.close();
  o = await open('2026-s2-mixta');
  check('Si ya estás en el actual, no recarga nada', await o.now() === '2026-s2-mixta');
  await o.ctx.close();

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
