/* Avisos en el móvil: tarjeta en Configuración (activar, prueba, desactivar, tipos),
   iPhone sin instalar, vuelta a guardar el aparato al abrir y la app abierta desde un aviso (#pantalla).
   El servicio de avisos del navegador se simula: en el entorno de pruebas no hay uno real. */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SNAP = fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8');
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e != null ? ' → ' + e : ''));
const J = (r, o, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(o) });

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const errors = [];
  const calls = { save: [], del: [], test: 0, patch: [] };
  const mk = async (opts) => {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: opts.ua });
    await ctx.grantPermissions(['notifications'], { origin: BASE });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e)));
    if (opts.session !== false) await p.addInitScript(() => {
      if (location.protocol === 'about:') return;
      if (!localStorage.getItem('padel-scouting.session.v1')) localStorage.setItem('padel-scouting.session.v1', JSON.stringify({
        access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: 'fran@x.com' } }));
    });
    /* Servicio de avisos simulado: la suscripción vive en localStorage. */
    await p.addInitScript(() => {
      if (!window.PushManager || location.protocol === 'about:') return;
      const fake = () => ({ endpoint: 'https://push.example/abc', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'P', auth: 'A' } }; },
        unsubscribe() { localStorage.removeItem('fake-sub'); return Promise.resolve(true); } });
      PushManager.prototype.getSubscription = function () { return Promise.resolve(localStorage.getItem('fake-sub') ? fake() : null); };
      PushManager.prototype.subscribe = function (o) {
        window.__subKeyLen = o && o.applicationServerKey && o.applicationServerKey.length;
        localStorage.setItem('fake-sub', '1'); return Promise.resolve(fake());
      };
    });
    await p.route('**/rest/v1/rpc/get_league_snapshot', r => r.fulfill({ status: 200, contentType: 'application/json', body: SNAP }));
    await p.route('**/rest/v1/rpc/league_version', r => J(r, 1));
    await p.route('**/rest/v1/rpc/get_my_profile', r => J(r, opts.session === false ? null :
      { label: 'Francisco', category: 'masculina', playsMixed: true, defaultKind: 'masculina', notifyReminders: true, notifyResults: true, notifyLoads: false }));
    await p.route('**/rest/v1/rpc/update_my_profile', r => { const b = JSON.parse(r.request().postData()); calls.patch.push(b.patch); J(r, { label: 'Francisco' }); });
    await p.route('**/rest/v1/rpc/list_players', r => J(r, []));
    await p.route('**/rest/v1/rpc/list_my_records', r => J(r, []));
    await p.route('**/rest/v1/rpc/get_my_round', r => r.abort());
    await p.route('**/rest/v1/rpc/vapid_public_key', r => J(r, 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'));
    /* Como la base de verdad: las funciones «void» responden 204 sin contenido. */
    const done = r => r.fulfill({ status: 204, body: '' });
    await p.route('**/rest/v1/rpc/save_push_subscription', r => { calls.save.push(JSON.parse(r.request().postData()).sub); done(r); });
    await p.route('**/rest/v1/rpc/delete_push_subscription', r => { calls.del.push(JSON.parse(r.request().postData()).p_endpoint); done(r); });
    await p.route('**/rest/v1/rpc/send_test_push', r => { calls.test++; done(r); });
    return { p, ctx };
  };
  const text = (p, s) => p.textContent(s).catch(() => '');

  /* ---------- sin sesión ---------- */
  let { p, ctx } = await mk({ session: false });
  await p.goto(BASE); await p.waitForTimeout(1000);
  await p.evaluate(() => window.PadelApp.go('config')); await p.waitForTimeout(700);
  check('Sin sesión: Avisos pide iniciar sesión', (await text(p, '#cfg-avisos')).includes('Inicia sesión para recibir avisos'));
  await ctx.close();

  /* ---------- con sesión: activar, probar, tipos, desactivar ---------- */
  ({ p, ctx } = await mk());
  await p.goto(BASE); await p.waitForTimeout(1200);
  await p.evaluate(() => window.PadelApp.go('config')); await p.waitForTimeout(900);
  let card = await text(p, '#cfg-avisos');
  check('Con sesión: dice que este aparato aún no recibe avisos', card.includes('no recibe avisos'), card.slice(0, 120));
  check('Tres tipos de aviso, cada uno por separado', (await p.$$('#av-prefs [data-pref]')).length === 3);
  check('Los tipos salen como están en tu cuenta (cargas desactivado)',
    await p.isChecked('[data-pref="notifyReminders"]') && !(await p.isChecked('[data-pref="notifyLoads"]')));
  await p.click('[data-av="on"]'); await p.waitForTimeout(1500);
  const s0 = calls.save[0] || {};
  check('Activar guarda el aparato en tu cuenta (dirección, claves y navegador)',
    s0.endpoint === 'https://push.example/abc' && s0.keys && s0.keys.p256dh === 'P' && !!s0.ua, JSON.stringify(s0).slice(0, 120));
  check('Activar usa la clave pública de la base (65 bytes)', (await p.evaluate(() => window.__subKeyLen)) === 65);
  check('Activar registra el receptor de avisos (sw.js)',
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !!r && /sw\.js$/.test((r.active || r.installing || r.waiting).scriptURL))));
  card = await text(p, '#cfg-avisos');
  check('Activar no enseña ningún error (la base responde 204 sin contenido)', !/Failed|JSON|Error/i.test(await text(p, '#toast')), await text(p, '#toast'));
  check('Tras activar: «Este aparato recibe avisos» y botón de prueba', card.includes('recibe avisos') && !!(await p.$('[data-av="test"]')));
  await p.click('[data-av="test"]'); await p.waitForTimeout(500);
  check('«Enviar aviso de prueba» lo pide a la base', calls.test === 1);
  check('…y dice que llega en unos segundos', (await text(p, '#toast')).includes('Aviso de prueba enviado'));
  await p.click('[data-pref="notifyResults"]'); await p.waitForTimeout(500);
  check('Quitar un tipo lo guarda en tu cuenta solo para ese tipo', JSON.stringify(calls.patch.slice(-1)[0]) === '{"notifyResults":false}',
    JSON.stringify(calls.patch));
  /* Al volver a abrir la app con permiso y suscripción: se vuelve a guardar el aparato. */
  const before = calls.save.length;
  await p.reload(); await p.waitForTimeout(1500);
  check('Al abrir la app con avisos activos, vuelve a guardar el aparato', calls.save.length === before + 1, calls.save.length);
  await p.evaluate(() => window.PadelApp.go('config')); await p.waitForTimeout(900);
  await p.click('[data-av="off"]'); await p.waitForTimeout(800);
  check('Desactivar borra este aparato de tu cuenta', calls.del[0] === 'https://push.example/abc');
  check('Tras desactivar vuelve a ofrecer activarlos', !!(await p.$('[data-av="on"]')));

  /* ---------- abrir desde un aviso ---------- */
  await p.goto(BASE + '/#temporada'); await p.waitForTimeout(1500);
  check('Un aviso con ./#temporada abre Nuestra temporada', (await text(p, '#page-title')) === 'Nuestra temporada');
  check('…y limpia la dirección', !(await p.evaluate(() => location.href)).includes('#'));
  await p.evaluate(() => { location.hash = 'estemes'; }); await p.waitForTimeout(900);
  check('Con la app ya abierta, un aviso a ./#estemes lleva a Este mes', (await text(p, '#page-title')) === 'Este mes');
  await p.goto('about:blank'); await p.goto(BASE + '/#loquesea'); await p.waitForTimeout(1200);
  check('Un # desconocido abre la pista normal', (await text(p, '#page-title')) === 'La pista', await text(p, '#page-title'));
  await ctx.close();

  /* ---------- iPhone sin instalar ---------- */
  ({ p, ctx } = await mk({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' }));
  await p.goto(BASE); await p.waitForTimeout(1200);
  await p.evaluate(() => window.PadelApp.go('config')); await p.waitForTimeout(900);
  card = await text(p, '#cfg-avisos');
  check('iPhone sin instalar: explica «Añadir a pantalla de inicio» y no ofrece activar',
    card.includes('Añadir a pantalla de inicio') && !(await p.$('[data-av="on"]')), card.slice(0, 160));
  await ctx.close();

  /* ---------- el receptor ---------- */
  const sw = fs.readFileSync(__dirname + '/../sw.js', 'utf8');
  check('sw.js no guarda la app en caché (sin «fetch»)', !/addEventListener\(\s*'fetch'/.test(sw));

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
