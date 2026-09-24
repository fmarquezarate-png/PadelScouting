/* Alta de cuenta: vuelve a la web (no a localhost), la vuelta del correo te deja dentro,
   y un enlace caducado explica qué hacer y deja pedir otro correo. */
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
  const mk = async () => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    p.on('pageerror', e => errors.push(String(e)));
    await p.route('**/rest/v1/rpc/get_league_snapshot', r => r.fulfill({ status: 200, contentType: 'application/json', body: SNAP }));
    await p.route('**/rest/v1/rpc/get_my_profile', r => J(r, null));
    await p.route('**/rest/v1/rpc/list_players', r => J(r, []));
    await p.route('**/rest/v1/rpc/get_my_round', r => r.abort());
    return p;
  };

  /* ---------- crear cuenta ---------- */
  const p = await mk();
  let signupUrl = null, resent = null;
  await p.route('**/auth/v1/signup**', r => { signupUrl = r.request().url(); J(r, { id: 'u1', email: 'nuevo@x.com' }); });
  await p.route('**/auth/v1/resend**', r => { resent = { url: r.request().url(), body: JSON.parse(r.request().postData()) }; J(r, {}); });
  await p.goto(BASE); await p.waitForTimeout(1200);
  await p.evaluate(() => window.PadelApp.go('perfil')); await p.waitForTimeout(500);
  await p.click('[data-action="auth-mode"]'); await p.waitForTimeout(200);
  await p.fill('#au-email', 'nuevo@x.com'); await p.fill('#au-pass', 'secreta123');
  await p.click('[data-action="auth-go"]'); await p.waitForTimeout(700);
  const back = signupUrl ? decodeURIComponent((signupUrl.split('redirect_to=')[1] || '')) : '';
  check('El alta pide volver a esta web, no a localhost:3000', back.startsWith(BASE) && !back.includes(':3000'), back);
  const t = await p.textContent('#view');
  check('Tras crear la cuenta explica qué hacer con el correo', t.includes('Confirmar mi cuenta') && t.includes('spam'));
  await p.click('[data-action="auth-resend"]'); await p.waitForTimeout(500);
  check('«Enviarme otro correo» lo reenvía al mismo email', resent && resent.body.email === 'nuevo@x.com' && resent.body.type === 'signup');
  await p.close();

  /* ---------- vuelta del correo: bien ---------- */
  const q = await mk();
  await q.route('**/auth/v1/user', r => J(r, { id: 'u1', email: 'nuevo@x.com' }));
  await q.goto(BASE + '/#access_token=AAA&expires_in=3600&refresh_token=RRR&token_type=bearer&type=signup');
  await q.waitForTimeout(1500);
  const sess = await q.evaluate(() => JSON.parse(localStorage.getItem('padel-scouting.session.v1') || 'null'));
  check('Vuelta del correo: queda la sesión abierta', sess && sess.access_token === 'AAA' && sess.user.email === 'nuevo@x.com');
  check('Vuelta del correo: lo dice claro', (await q.textContent('#toast')).includes('Cuenta confirmada'));
  check('Vuelta del correo: limpia la dirección (sin tokens a la vista)', !(await q.evaluate(() => location.href)).includes('access_token'));
  check('Vuelta del correo: la página no se rompe', (await q.textContent('#view')).length > 100);
  await q.close();

  /* ---------- vuelta del correo: enlace caducado ---------- */
  const e = await mk();
  let resent2 = null;
  await e.route('**/auth/v1/resend**', r => { resent2 = JSON.parse(r.request().postData()); J(r, {}); });
  await e.goto(BASE + '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await e.waitForTimeout(1500);
  const mt = await e.textContent('#modal-root');
  check('Enlace caducado: lo explica y tranquiliza (la cuenta existe)', mt.includes('ha caducado') && mt.includes('tu cuenta está creada'));
  await e.fill('#lp-email', 'nuevo@x.com'); await e.click('[data-lp="resend"]'); await e.waitForTimeout(500);
  check('Enlace caducado: deja pedir otro correo', resent2 && resent2.email === 'nuevo@x.com');
  check('Enlace caducado: limpia la dirección', !(await e.evaluate(() => location.href)).includes('error'));
  await e.close();

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
