/* Volver atrás: el «atrás» del móvil y el botón «Volver» llevan a la pantalla anterior
   (a la misma altura), cierran antes una ventana abierta y, sin pantalla anterior, van a la pista. */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const SNAP = fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8');
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e != null ? ' → ' + e : ''));

(async () => {
  const browser = await chromium.launch({ executablePath: require('./chrome-path') });
  const errors = [];
  const mk = async () => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    p.on('pageerror', e => errors.push(String(e)));
    await p.route('**/rest/v1/rpc/get_league_snapshot', r => r.fulfill({ status: 200, contentType: 'application/json', body: SNAP }));
    return p;
  };
  const view = p => p.evaluate(() => window.PadelApp.state.view);
  const go = async (p, v) => { await p.evaluate(v => window.PadelApp.go(v), v); await p.waitForTimeout(600); };
  const back = async p => { await p.evaluate(() => history.back()); await p.waitForTimeout(700); };

  const p = await mk();
  await p.goto(BASE); await p.waitForTimeout(1500);
  check('En la pista no hay botón «Volver»', await p.locator('#back-btn').isHidden());
  await go(p, 'liga');
  check('En otra pantalla sale «Volver»', await p.locator('#back-btn').isVisible());
  await p.evaluate(() => window.scrollTo({ top: 600 })); await p.waitForTimeout(200);
  const y0 = await p.evaluate(() => window.scrollY);
  await go(p, 'cronica');
  await go(p, 'temporada');
  await back(p);
  check('«Atrás» del móvil: vuelve a la pantalla anterior', await view(p) === 'cronica', await view(p));
  await back(p);
  check('Otra vez «atrás»: la de antes', await view(p) === 'liga', await view(p));
  await p.waitForTimeout(600);
  const y1 = await p.evaluate(() => window.scrollY);
  check('Vuelve a la misma altura en la que estabas', y0 > 300 && Math.abs(y1 - y0) < 40, y0 + ' → ' + y1);
  await p.click('#back-btn'); await p.waitForTimeout(700);
  check('Botón «Volver»: a la pista', await view(p) === 'inicio' && await p.locator('#back-btn').isHidden());
  await p.evaluate(() => history.forward()); await p.waitForTimeout(700);
  check('«Adelante» también funciona', await view(p) === 'liga', await view(p));

  /* El rival que mirabas vuelve con «atrás» */
  const ids = await p.evaluate(() => window.PadelLiga.state.model.order.slice(0, 2));
  await p.evaluate(id => { window.PadelLiga.state.rivalId = id; window.PadelApp.go('rival'); }, ids[0]); await p.waitForTimeout(600);
  await go(p, 'liga');
  await p.evaluate(id => { window.PadelLiga.state.rivalId = id; window.PadelApp.go('rival'); }, ids[1]); await p.waitForTimeout(600);
  await back(p); await back(p);
  check('«Atrás» a «El rival» enseña la pareja que mirabas', await view(p) === 'rival' &&
    await p.evaluate(() => window.PadelLiga.state.rivalId) === ids[0]);

  /* Con una ventana abierta, «atrás» la cierra y te quedas */
  await go(p, 'cronica');
  await p.click('#pair-btn'); await p.waitForTimeout(300);
  check('(abre el selector de pareja)', await p.locator('.modal').count() === 1);
  await back(p);
  check('«Atrás» con una ventana abierta: la cierra', await p.locator('.modal').count() === 0);
  check('… y sigues en la misma pantalla', await view(p) === 'cronica', await view(p));
  await back(p);
  check('El siguiente «atrás» ya cambia de pantalla', await view(p) === 'rival', await view(p));

  /* Con el menú abierto, «atrás» lo cierra */
  await p.click('#menu-btn'); await p.waitForTimeout(400);
  await back(p);
  check('«Atrás» con el menú abierto: lo cierra', await p.evaluate(() => document.getElementById('drawer').hidden) && await view(p) === 'rival');

  /* Los filtros no dejan entradas: «atrás» no se queda en la misma pantalla */
  await go(p, 'liga');
  await p.evaluate(() => window.PadelApp.go('liga', { keep: true })); await p.waitForTimeout(400);
  await back(p);
  check('Repintar la misma pantalla no añade un «atrás» vacío', await view(p) === 'rival', await view(p));
  await p.close();

  /* Entrar desde un aviso (#cronica): «Volver» lleva a la pista */
  const q = await mk();
  await q.goto(BASE + '/#cronica'); await q.waitForTimeout(1500);
  check('(abre la pantalla del aviso)', await view(q) === 'cronica');
  await q.click('#back-btn'); await q.waitForTimeout(700);
  check('Sin pantalla anterior, «Volver» va a la pista', await view(q) === 'inicio');
  await q.close();

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
