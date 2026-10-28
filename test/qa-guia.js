/* Que la app se entienda: mismos nombres en la pista, el menú y el título; una frase
   bajo cada título; «¿Qué hago ahora?» en la pista; recorrido guiado de 5 paradas. */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const EXE = require('./chrome-path');
const SNAP = JSON.parse(fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8'));
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e != null ? ' → ' + e : ''));
const J = (r, o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
const NAMES = { estemes: 'Mis partidos del mes', liga: 'Clasificación', temporada: 'Nuestra temporada', cronica: 'Crónica',
  registro: 'Notas de un partido', historial: 'Mis notas', analisis: 'Preparar partido', rival: 'Estudiar un rival' };
const ME = SNAP.teams.find(t => t[4]);

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const errors = [];
  async function open(opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: opts.w || 390, height: opts.w ? 1000 : 844 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e)));
    await p.addInitScript(o => {
      if (o.tour) window.__PADEL_TOUR__ = true;
      if (o.now) window.__PADEL_NOW__ = o.now;
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      if (o.session) localStorage.setItem('padel-scouting.session.v1', JSON.stringify({
        access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: 'x@x.com' } }));
    }, opts);
    await p.route('**/rest/v1/rpc/**', r => J(r, null));
    await p.route('**/rest/v1/rpc/get_league_snapshot', r => J(r, SNAP));
    await p.route('**/rest/v1/rpc/get_my_profile', r => J(r, opts.session ? { label: ME[2], category: 'masculina', playsMixed: false, defaultKind: 'masculina' } : null));
    if (opts.round) await p.route('**/rest/v1/rpc/get_my_round', r => J(r, opts.round));
    else await p.route('**/rest/v1/rpc/get_my_round', r => r.abort());
    await p.goto(BASE); await p.waitForTimeout(opts.wait || 1800);
    return { p, ctx };
  }

  /* ---------- nombres: pista = menú = título ---------- */
  let { p, ctx } = await open();
  const court = await p.$$eval('.court .zone', zs => zs.map(z => [z.getAttribute('data-zone'), z.getAttribute('aria-label').split(' · ')[0]]));
  const courtOk = court.every(([id, n]) => !NAMES[id] || NAMES[id] === n);
  check('La pista usa los nombres nuevos (los 8)', courtOk && court.filter(([id]) => NAMES[id]).length === 8, JSON.stringify(court));
  const drawer = await p.$$eval('[data-drawer-go]', bs => bs.map(b => [b.getAttribute('data-drawer-go'), b.textContent.trim()]));
  check('El menú ☰ usa los mismos nombres', Object.keys(NAMES).every(k => drawer.some(([id, t]) => id === k && t === NAMES[k])), JSON.stringify(drawer));
  for (const k of ['liga', 'temporada', 'cronica', 'rival']) {
    await p.evaluate(v => window.PadelApp.go(v), k); await p.waitForTimeout(250);
    const t = await p.textContent('#page-title'), intro = await p.textContent('#view-intro');
    check('Título de ' + k + ' = «' + NAMES[k] + '» y con su frase debajo', t === NAMES[k] && intro.length > 30, t + ' | ' + intro);
  }
  await p.evaluate(() => window.PadelApp.go('inicio')); await p.waitForTimeout(300);
  check('En la pista no hay frase (la pista se explica sola con «¿Qué hago ahora?»)', await p.isHidden('#view-intro'));
  check('El botón de la red dice «Mis partidos del mes»', (await p.textContent('.net-btn')).includes('MIS PARTIDOS DEL MES'));
  const sizes = await p.evaluate(() => [document.querySelector('.net-btn .nb-bg').getBoundingClientRect().height,
    document.querySelector('.zone[data-zone="historial"] .zt').getBoundingClientRect().height]);
  check('El botón de la red es más alto que un rótulo de zona (el principal)', sizes[0] > sizes[1] * 1.5, sizes.join(' vs '));
  check('El botón de la red tiene halo', await p.$('.net-btn .nb-ring') !== null);

  /* ---------- ¿Qué hago ahora? ---------- */
  let t = await p.textContent('#nextStep');
  check('Sin cuenta: «¿Qué hago ahora?» invita a crear cuenta', t.includes('¿Qué hago ahora?') && t.includes('Crea tu cuenta'), t);
  await p.click('#nextStep'); await p.waitForTimeout(300);
  check('…y la franja lleva a Mi perfil', (await p.textContent('#page-title')) === 'Mi perfil');
  await ctx.close();

  const fx = (id, st, at) => ({ id, rivalTeamId: SNAP.teams[id][0], rivalLabel: SNAP.teams[id][1], status: st, scheduledAt: at, sets: null });
  const round = (fixtures) => ({ id: 1, label: 'Octubre', season: '2026-s1', monthStart: '2026-10-01', group: 3, myTeamId: ME[0], status: 'en_curso', fixtures });
  ({ p, ctx } = await open({ session: true, now: '2026-10-20T12:00:00Z', round: round([fx(1, 'pendiente', '2026-10-18T18:00:00Z'), fx(2, 'pendiente', null)]), wait: 2500 }));
  t = await p.textContent('#nextStep').catch(() => '');
  check('Partido ya jugado sin resultado: «Apunta el resultado» con el rival', t.includes('Apunta el resultado') && t.includes(SNAP.teams[1][1].split('/')[0].trim().split(' ')[0]), t);
  /* Al abrir, la app ya pregunta sola por ese resultado: se pospone y se vuelve a pedir desde la franja. */
  await p.evaluate(() => { document.getElementById('modal-root').innerHTML = ''; document.body.classList.remove('has-modal'); });
  await p.click('#nextStep'); await p.waitForTimeout(400);
  check('…y abre el marcador de ese partido', (await p.textContent('#modal-root')).includes('¿Cómo fue contra'));
  await ctx.close();
  ({ p, ctx } = await open({ session: true, now: '2026-10-20T12:00:00Z', round: round([fx(1, 'jugado', '2026-10-18T18:00:00Z'), fx(2, 'pendiente', null)]), wait: 2500 }));
  t = await p.textContent('#nextStep').catch(() => '');
  check('Partido sin fecha: «Pon fecha a tus partidos»', t.includes('Pon fecha'), t);
  await ctx.close();
  ({ p, ctx } = await open({ session: true, w: 1280, now: '2026-10-20T12:00:00Z', round: round([fx(1, 'jugado', '2026-10-18T18:00:00Z'), fx(2, 'pendiente', '2026-10-24T17:00:00Z')]), wait: 2500 }));
  t = await p.textContent('#nextStep').catch(() => '');
  check('Todo con fecha: próximo partido y «Estudiar a…» (ordenador: texto largo y botón)', t.includes('Próximo partido') && t.includes('Estudiar a'), t);
  await p.evaluate(() => { document.getElementById('modal-root').innerHTML = ''; document.body.classList.remove('has-modal'); });
  await p.click('#nextStep .ns-btn'); await p.waitForTimeout(500);
  check('…y abre Estudiar un rival con esa pareja', (await p.textContent('#page-title')) === 'Estudiar un rival' &&
    (await p.evaluate(() => window.PadelLiga.state.rivalId)) === SNAP.teams[2][0]);
  await ctx.close();

  /* ---------- recorrido guiado ---------- */
  ({ p, ctx } = await open({ tour: true, wait: 400 }));
  await p.waitForSelector('#tour', { timeout: 8000 }).catch(() => {});
  check('La primera vez, sale el recorrido sobre la pista', !!(await p.$('#tour')));
  const titles = [];
  for (let i = 0; i < 5; i++) {
    titles.push(await p.textContent('#tour h3'));
    const inside = await p.evaluate(() => { const h = document.querySelector('.tour-hole').getBoundingClientRect(); return h.width > 20 && h.height > 20; });
    if (!inside) titles.push('(sin hueco)');
    if (i < 4) { await p.click('[data-tour="next"]'); await p.waitForTimeout(150); }
  }
  check('5 paradas: red, fondo, tu lado, puerta, arriba', titles.length === 5 && titles[0].includes('Mis partidos del mes') && titles[1].includes('la liga') &&
    titles[2].includes('libreta') && titles[3].includes('Estudiar un rival') && titles[4].includes('menú'), titles.join(' | '));
  await p.click('[data-tour="end"]'); await p.waitForTimeout(200);
  check('«¡A jugar!» lo cierra y lo recuerda', !(await p.$('#tour')) && await p.evaluate(() => localStorage.getItem('padel-scouting.tour.v1')) === 'done');
  await p.reload(); await p.waitForTimeout(3000);
  check('No vuelve a salir solo', !(await p.$('#tour')));
  await p.click('#menu-btn'); await p.waitForTimeout(300);
  await p.click('[data-shell="recorrido"]'); await p.waitForSelector('#tour', { timeout: 5000 }).catch(() => {});
  check('Menú ☰ → «¿Cómo funciona?» lo repite', !!(await p.$('#tour')));
  await p.click('[data-tour="skip"]'); await p.waitForTimeout(200);
  check('«Saltar» lo cierra', !(await p.$('#tour')));
  await ctx.close();
  ({ p, ctx } = await open({ tour: true, wait: 400 }));
  await p.waitForSelector('#tour', { timeout: 8000 }).catch(() => {});
  await p.evaluate(() => window.PadelApp.go('liga')); await p.waitForTimeout(300);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  check('Escape cierra el recorrido', !(await p.$('#tour')));
  await ctx.close();

  /* ---------- Confirmado / Provisional ---------- */
  {
    const f1 = Object.assign(fx(1, 'jugado', '2026-10-18T18:00:00Z'), { sets: [[6, 3], [6, 4]], confirmed: true });
    const f2 = Object.assign(fx(2, 'jugado', '2026-10-19T18:00:00Z'), { sets: [[3, 6], [4, 6]], confirmed: false });
    ({ p, ctx } = await open({ session: true, now: '2026-10-20T12:00:00Z', round: round([f1, f2, fx(3, 'pendiente', '2026-10-24T17:00:00Z')]), wait: 2500 }));
    await p.evaluate(() => { document.getElementById('modal-root').innerHTML = ''; document.body.classList.remove('has-modal'); window.PadelApp.go('estemes'); });
    await p.waitForTimeout(900);
    const c1 = await p.textContent('[data-fx="1"]').catch(() => ''), c2 = await p.textContent('[data-fx="2"]').catch(() => '');
    check('Resultado de la liga: «Confirmado»', /Confirmado/i.test(c1) && !/Provisional/i.test(c1), c1.slice(0, 120));
    check('Resultado apuntado a mano: «Provisional»', /Provisional/i.test(c2) && !/Confirmado/i.test(c2), c2.slice(0, 120));
    await ctx.close();
  }

  /* ---------- la pista: la liga delante ---------- */
  ({ p, ctx } = await open({ wait: 1800 }));
  const ys = await p.evaluate(() => ['liga', 'temporada', 'cronica', 'registro', 'historial', 'analisis'].map(z =>
    document.querySelector('.zone[data-zone="' + z + '"] .zb').getBoundingClientRect()));
  check('Clasificación, Nuestra temporada y Crónica van delante (más abajo y más grandes que el scouting)',
    ys.slice(0, 3).every(a => ys.slice(3).every(b => a.top > b.top && a.width > b.width)), ys.map(r => Math.round(r.top) + '/' + Math.round(r.width)).join(' '));

  /* ---------- tutorial: desde «?» y desde Configuración ---------- */
  await p.evaluate(() => localStorage.setItem('padel-scouting.tour.v1', 'done'));
  await p.click('#avatar-btn'); await p.waitForTimeout(300);
  const help = await p.textContent('#modal-root');
  check('Sin sesión, «?» ofrece «¿Cómo funciona?» y «Entrar o crear cuenta»', help.includes('¿Cómo funciona?') && help.includes('Entrar o crear cuenta'), help);
  await p.click('[data-shell="help-tour"]'); await p.waitForSelector('#tour', { timeout: 5000 }).catch(() => {});
  check('…«¿Cómo funciona?» abre el tutorial', !!(await p.$('#tour')));
  await p.click('[data-tour="skip"]'); await p.waitForTimeout(200);
  await p.click('#avatar-btn'); await p.waitForTimeout(300);
  await p.click('[data-shell="help-login"]'); await p.waitForTimeout(300);
  check('…«Entrar o crear cuenta» lleva a Mi perfil', (await p.textContent('#page-title')) === 'Mi perfil');
  await p.evaluate(() => window.PadelApp.go('config')); await p.waitForTimeout(500);
  await p.click('#view [data-shell="help-tour"]'); await p.waitForSelector('#tour', { timeout: 5000 }).catch(() => {});
  check('Configuración → «Ver el tutorial otra vez» lo abre (sobre la pista)', !!(await p.$('#tour')) && (await p.textContent('#page-title')) === 'La pista');
  await ctx.close();

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
