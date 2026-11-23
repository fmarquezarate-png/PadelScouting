/* Seguridad de la cuenta y de la web:
   · las cabeceras de vercel.json (servidas en local por test/serve-headers.py) no bloquean nada de la app;
   · ¿Olvidaste la contraseña? → correo → contraseña nueva;
   · cambiar la contraseña en Mi perfil (pide la actual). */
const { chromium } = require('playwright');
const fs = require('fs');
const { spawn } = require('child_process');
const EXE = require('./chrome-path');
const PORT = 8112, BASE = 'http://127.0.0.1:' + PORT;
const SNAP = fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8');
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e != null ? ' → ' + e : ''));
const J = (r, o, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: typeof o === 'string' ? o : JSON.stringify(o) });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn('python3', [__dirname + '/serve-headers.py', String(PORT)], { stdio: 'ignore' });
  await sleep(900);
  const browser = await chromium.launch({ executablePath: EXE });
  const csp = [], errors = [];
  async function open(opts) {
    opts = opts || {};
    const A = { recover: [], put: [], token: [] };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text().slice(0, 160)); });
    await p.addInitScript(o => {
      document.addEventListener('securitypolicyviolation', e => (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI));
      localStorage.setItem('padel-scouting.tour.v1', 'done');
      localStorage.setItem('padel-scouting.invite.install.v1', 'never');
      if (o.session && !sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('padel-scouting.session.v1', JSON.stringify({ access_token: 't', refresh_token: 'r',
          expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1', email: 'fran@example.com' } }));
      }
    }, opts);
    await p.route('**/rest/v1/rpc/**', r => J(r, 'null'));
    await p.route('**/rest/v1/rpc/get_league_snapshot', r => J(r, SNAP));
    await p.route('**/rest/v1/rpc/get_my_round', r => r.abort());
    await p.route('**/rest/v1/rpc/list_my_records', r => J(r, []));
    await p.route('**/rest/v1/rpc/get_my_profile', r => J(r, opts.session || opts.recovery
      ? { label: 'Francisco', category: 'masculina', playsMixed: false, defaultKind: 'masculina' } : null));
    await p.route('**/auth/v1/recover**', r => { A.recover.push([r.request().url(), JSON.parse(r.request().postData())]); J(r, {}); });
    await p.route('**/auth/v1/token**', r => {
      const b = JSON.parse(r.request().postData() || '{}'); A.token.push(b);
      if (b.password && b.password !== 'vieja-123') return J(r, { error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400);
      J(r, { access_token: 't2', refresh_token: 'r2', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'u1', email: 'fran@example.com' } });
    });
    await p.route('**/auth/v1/user', r => {
      if (r.request().method() === 'PUT') {
        const b = JSON.parse(r.request().postData()); A.put.push([r.request().headers().authorization, b]);
        if (b.password === 'igual-que-antes') return J(r, { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' }, 422);
        return J(r, { id: 'u1', email: 'fran@example.com' });
      }
      J(r, { id: 'u1', email: 'fran@example.com' });
    });
    await p.goto(BASE + (opts.hash || '/')); await p.waitForTimeout(opts.wait || 1800);
    return { p, ctx, A };
  }

  /* ---------- 1. Cabeceras ---------- */
  const res = await fetch(BASE + '/');
  const H = k => res.headers.get(k) || '';
  check('Cabeceras: CSP, no se puede meter en otra web, HSTS, nosniff', /frame-ancestors 'none'/.test(H('content-security-policy')) &&
    H('x-frame-options') === 'DENY' && /max-age=\d{7,}/.test(H('strict-transport-security')) && H('x-content-type-options') === 'nosniff');
  check('Cabeceras: sin código incrustado salvo el del tema (por su huella)', !/unsafe-inline/.test(/script-src[^;]*/.exec(H('content-security-policy'))[0]) &&
    !/unsafe-eval/.test(H('content-security-policy')));
  /* La huella del script del tema tiene que coincidir con el de index.html (si se cambia uno, falla aquí). */
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m =>
    "'sha256-" + require('crypto').createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
  check('La huella del script del tema coincide con vercel.json', hashes.length && hashes.every(h => H('content-security-policy').includes(h)), hashes.join(' '));

  /* ---------- 2. Todas las pantallas con la política puesta ---------- */
  let { p, ctx, A } = await open({ session: true });
  const views = await p.evaluate(() => Object.keys(window.PadelData.NAMES));
  for (const v of views) { await p.evaluate(v => { document.getElementById('modal-root').innerHTML = ''; window.PadelApp.go(v); }, v); await p.waitForTimeout(350); }
  await p.click('#menu-btn').catch(() => {}); await p.waitForTimeout(300);
  await p.evaluate(() => window.PadelShell.closeDrawer()); await p.waitForTimeout(300);
  check('Con la política puesta, ninguna pantalla queda bloqueada (' + views.length + ')',
    !csp.length && !(await p.evaluate(() => window.__csp || [])).length, csp.concat(await p.evaluate(() => window.__csp || [])).slice(0, 3).join(' | '));
  const blocked = await p.evaluate(() => new Promise(res => {
    window.__evil = false;
    const s = document.createElement('script'); s.textContent = 'window.__evil = true'; document.head.appendChild(s);
    setTimeout(() => res(!window.__evil && (window.__csp || []).some(x => /script-src/.test(x))), 200);
  }));
  check('Prueba de control: un script metido a la fuerza se bloquea (la política está activa)', blocked);
  check('El tema se aplica (el script incrustado sí corre)', !!(await p.evaluate(() => document.documentElement.getAttribute('data-theme'))));

  /* ---------- 3. Mi perfil: cambiar la contraseña ---------- */
  await p.evaluate(() => { document.getElementById('modal-root').innerHTML = ''; document.body.classList.remove('has-modal'); window.PadelApp.go('perfil'); });
  await p.waitForTimeout(500);
  check('Mi perfil: tarjeta «Seguridad» con «Cambiar contraseña»', (await p.textContent('#pf-security')).includes('Cambiar contraseña'));
  await p.click('[data-pw="open"]'); await p.waitForTimeout(150);
  await p.fill('#pw-cur', 'vieja-123'); await p.fill('#pw-new', 'corta'); await p.fill('#pw-new2', 'corta');
  await p.click('[data-pw="save"]'); await p.waitForTimeout(200);
  check('Nueva demasiado corta: lo dice y no envía nada', (await p.textContent('#pf-security')).includes('al menos 8') && !A.put.length);
  await p.fill('#pw-cur', 'vieja-123'); await p.fill('#pw-new', 'nueva-larga-1'); await p.fill('#pw-new2', 'otra-cosa-22');
  await p.click('[data-pw="save"]'); await p.waitForTimeout(200);
  check('Las dos nuevas no coinciden: lo dice', (await p.textContent('#pf-security')).includes('no coinciden') && !A.put.length);
  await p.fill('#pw-cur', 'MAL-mal-mal'); await p.fill('#pw-new', 'nueva-larga-1'); await p.fill('#pw-new2', 'nueva-larga-1');
  await p.click('[data-pw="save"]'); await p.waitForTimeout(500);
  check('Actual incorrecta: no cambia nada', (await p.textContent('#pf-security')).includes('actual no es correcta') && !A.put.length);
  check('…y no te echa de la cuenta', !!(await p.evaluate(() => window.PadelAuth.user())));
  await p.fill('#pw-cur', 'vieja-123'); await p.fill('#pw-new', 'nueva-larga-1'); await p.fill('#pw-new2', 'nueva-larga-1');
  await p.click('[data-pw="save"]'); await p.waitForTimeout(600);
  check('Correcto: comprueba la actual y pone la nueva con la sesión recién abierta', A.put.length === 1 &&
    A.put[0][1].password === 'nueva-larga-1' && A.put[0][0] === 'Bearer t2' &&
    A.token.some(t => t.email === 'fran@example.com' && t.password === 'vieja-123'), JSON.stringify(A.put));
  check('…y lo confirma', (await p.textContent('#pf-security')).includes('Contraseña cambiada'));
  check('Las contraseñas no se quedan guardadas en el móvil', !(await p.evaluate(() => JSON.stringify(localStorage))).match(/vieja-123|nueva-larga-1/));
  await ctx.close();

  /* ---------- 4. ¿Olvidaste la contraseña? ---------- */
  ({ p, ctx, A } = await open({}));
  await p.evaluate(() => { document.getElementById('modal-root').innerHTML = ''; document.body.classList.remove('has-modal'); window.PadelApp.go('perfil'); });
  await p.waitForTimeout(400);
  await p.click('[data-action="auth-forgot"]'); await p.waitForTimeout(150);
  await p.fill('#au-email', 'no-es-un-email'); await p.click('[data-action="auth-recover"]'); await p.waitForTimeout(150);
  check('Olvidé: email mal escrito, lo dice y no envía', (await p.textContent('#view')).includes('Escribe bien tu email') && !A.recover.length);
  await p.fill('#au-email', 'fran@example.com'); await p.click('[data-action="auth-recover"]'); await p.waitForTimeout(400);
  check('Olvidé: pide el enlace para ese email y vuelve a esta web', A.recover.length === 1 && A.recover[0][1].email === 'fran@example.com' &&
    decodeURIComponent(A.recover[0][0]).includes('redirect_to=' + BASE + '/'), JSON.stringify(A.recover));
  const msg = await p.textContent('#view');
  check('Olvidé: no revela si el email tiene cuenta', msg.includes('Si fran@example.com tiene cuenta'));
  await p.click('[data-action="auth-back"]'); await p.waitForTimeout(150);
  check('«Volver a entrar» vuelve al formulario', await p.locator('#au-pass').count() === 1);
  await ctx.close();

  ({ p, ctx, A } = await open({ hash: '/#access_token=rec-tok&refresh_token=rec-r&expires_in=3600&token_type=bearer&type=recovery', recovery: true, wait: 2200 }));
  check('Vuelta del correo: pide la contraseña nueva', (await p.textContent('#modal-root')).includes('Contraseña nueva'));
  check('…y limpia el enlace de la barra (el token no se queda a la vista)', !(await p.evaluate(() => location.href)).includes('rec-tok'));
  await p.fill('#np-pass', 'nueva-larga-1'); await p.fill('#np-pass2', 'nueva-larga-2'); await p.click('[data-np="save"]'); await p.waitForTimeout(200);
  check('…si no coinciden, lo dice', (await p.textContent('#np-msg')).includes('no coinciden') && !A.put.length);
  await p.fill('#np-pass', 'igual-que-antes'); await p.fill('#np-pass2', 'igual-que-antes'); await p.click('[data-np="save"]'); await p.waitForTimeout(500);
  check('…si es la misma de antes, lo explica en castellano', (await p.textContent('#np-msg')).includes('distinta de la actual'), await p.textContent('#np-msg'));
  await p.fill('#np-pass', 'nueva-larga-1'); await p.fill('#np-pass2', 'nueva-larga-1'); await p.click('[data-np="save"]'); await p.waitForTimeout(700);
  check('…guarda con la sesión del enlace y te deja dentro', A.put.some(x => x[0] === 'Bearer rec-tok' && x[1].password === 'nueva-larga-1') &&
    !(await p.textContent('#modal-root')).includes('Contraseña nueva') && !!(await p.evaluate(() => window.PadelAuth.user())));
  await ctx.close();

  /* Enlace caducado: ofrece pedir otro para la contraseña. */
  ({ p, ctx, A } = await open({ hash: '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', wait: 1500 }));
  await p.fill('#lp-email', 'fran@example.com'); await p.click('[data-lp="forgot"]'); await p.waitForTimeout(500);
  check('Enlace caducado → «Pedir otro enlace para la contraseña» lleva al formulario con el email puesto',
    (await p.inputValue('#au-email').catch(() => '')) === 'fran@example.com' && await p.locator('[data-action="auth-recover"]').count() === 1);
  await ctx.close();

  check('Sin errores de JavaScript', !errors.length, errors.slice(0, 3).join(' | '));
  await browser.close(); srv.kill();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
