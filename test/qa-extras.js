/* Tema claro/oscuro, foto de perfil en grande, lado y mano opcionales, 10.000 escenarios. */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SNAP = fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8');
const L = require('../js/liga.js');
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e != null ? ' → ' + e : ''));
const J = (r, o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

(async () => {
  const m = L.build(JSON.parse(SNAP));
  check('El motor simula 10.000 escenarios', L.project(m, m.order[0], m.order[1]).simulations === 10000);

  const browser = await chromium.launch({ executablePath: EXE });
  const errors = [];
  /* ---------- tema ---------- */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  let profile = { label: 'Francisco', category: 'masculina', playsMixed: true, defaultKind: 'masculina', avatar: PHOTO, side: null, hand: null };
  const patches = [];
  await page.route('**/rest/v1/rpc/get_league_snapshot', r => r.fulfill({ status: 200, contentType: 'application/json', body: SNAP }));
  await page.route('**/rest/v1/rpc/get_my_profile', r => J(r, profile));
  await page.route('**/rest/v1/rpc/update_my_profile', r => {
    const p = JSON.parse(r.request().postData()).patch; patches.push(p);
    Object.keys(p).forEach(k => { profile[k] = p[k] === '' ? null : p[k]; }); J(r, profile);
  });
  await page.route('**/rest/v1/rpc/get_my_round', r => r.abort());
  await page.route('**/rest/v1/rpc/list_my_records', r => J(r, []));
  await page.addInitScript(() => localStorage.setItem('padel-scouting.session.v1', JSON.stringify({
    access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: 'fmarquezarate@gmail.com' } })));
  await page.goto(BASE); await page.waitForTimeout(1500);
  check('Tema: con el móvil en claro, la app sale clara', await page.evaluate(() => document.documentElement.dataset.theme) === 'light');
  await page.waitForSelector('.court-photo img', { timeout: 5000 }).catch(() => {});
  check('Tema claro: la pista de inicio es la foto de día', /-dia\.webp$/.test(await page.getAttribute('.court-photo img', 'src') || ''),
    await page.getAttribute('.court-photo img', 'src'));
  await page.evaluate(() => window.PadelTheme.set('dark')); await page.waitForTimeout(700);
  check('Tema oscuro: la pista pasa a la de noche sin salir de la portada',
    !/-dia/.test(await page.getAttribute('.court-photo img', 'src') || '') && await page.evaluate(() => window.PadelApp.state.view) === 'inicio');
  await page.evaluate(() => window.PadelTheme.set('auto')); await page.waitForTimeout(500);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('Tema claro: fondo claro', bg === 'rgb(243, 241, 234)', bg);
  await page.evaluate(() => window.PadelApp.go('config')); await page.waitForTimeout(600);
  await page.click('[data-theme-set="dark"]'); await page.waitForTimeout(300);
  check('Tema: se puede fijar oscuro', await page.evaluate(() => document.documentElement.dataset.theme) === 'dark');
  await page.reload(); await page.waitForTimeout(900);
  check('Tema: se recuerda al volver', await page.evaluate(() => document.documentElement.dataset.theme) === 'dark');
  await page.evaluate(() => window.PadelApp.go('config')); await page.waitForTimeout(600);
  await page.click('[data-theme-set="auto"]'); await page.waitForTimeout(300);
  check('Tema: «como el móvil» vuelve a claro', await page.evaluate(() => document.documentElement.dataset.theme) === 'light');

  /* ---------- foto ---------- */
  await page.evaluate(() => { document.getElementById('modal-root').innerHTML = ''; window.PadelApp.go('perfil'); }); await page.waitForTimeout(800);
  await page.click('[data-pf="zoom"]'); await page.waitForTimeout(300);
  check('Foto: al tocarla se ve en grande', await page.locator('.photo-zoom img').count() === 1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check('Foto: Escape la cierra', await page.locator('.photo-zoom').count() === 0);

  /* ---------- lado y mano (opcionales) ---------- */
  check('Perfil: lado y mano sin rellenar', (await page.textContent('#view')).includes('Lado') && (await page.textContent('#view')).includes('Mano'));
  await page.click('[data-pf="edit"]'); await page.waitForTimeout(500);
  check('Bienvenida: lado y mano son opcionales (se puede guardar sin ellos)', !(await page.isDisabled('[data-wz="save"]')));
  await page.click('[data-wz-side="izquierda"]'); await page.click('[data-wz-hand="zurdo"]'); await page.waitForTimeout(200);
  await page.click('[data-wz-hand="zurdo"]'); await page.waitForTimeout(200);
  check('Tocar otra vez quita la elección', await page.getAttribute('[data-wz-hand="zurdo"]', 'aria-pressed') === 'false');
  await page.click('[data-wz-hand="diestro"]'); await page.click('[data-wz="save"]'); await page.waitForTimeout(1200);
  const last = patches[patches.length - 1] || {};
  check('Guarda lado y mano', last.side === 'izquierda' && last.hand === 'diestro', JSON.stringify(last));

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
