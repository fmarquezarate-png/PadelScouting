/* «Descarga la app»: detecta aparato y navegador, pasos por caso, invitación al entrar
   (una por visita; «Ahora no» = 7 días; «No, gracias» = nunca) y la invitación a los avisos. */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SNAP = fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8');
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e != null ? ' → ' + e : ''));
const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1',
  iphoneInsta: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  pcEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const errors = [];
  async function open(ua, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e)));
    await p.addInitScript(o => {
      window.__PADEL_INVITES__ = true;
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      if (o.session) localStorage.setItem('padel-scouting.session.v1', JSON.stringify({
        access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: 'x@x.com' } }));
      if (o.installSeen) localStorage.setItem('padel-scouting.invite.install.v1', 'never');
    }, opts);
    await p.route('**/rest/v1/rpc/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
    await p.route('**/rest/v1/rpc/get_league_snapshot', r => r.fulfill({ status: 200, contentType: 'application/json', body: SNAP }));
    await p.route('**/rest/v1/rpc/get_my_profile', r => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(opts.session ? { label: 'Francisco', category: 'masculina', playsMixed: true, defaultKind: 'masculina' } : null) }));
    await p.route('**/rest/v1/rpc/get_my_round', r => r.abort());
    await p.goto(BASE); await p.waitForTimeout(800);
    return { p, ctx };
  }
  const modalText = p => p.textContent('#modal-root').catch(() => '');

  /* ---------- detección ---------- */
  const cases = [['iphoneSafari', 'iPhone o iPad', 'Safari'], ['iphoneChrome', 'iPhone o iPad', 'Chrome'], ['samsung', 'Android', 'Samsung Internet'],
    ['androidChrome', 'Android', 'Chrome'], ['pcEdge', 'Ordenador', 'Edge'], ['macSafari', 'Ordenador', 'Safari (Mac)']];
  for (const [k, dev, br] of cases) {
    const { p, ctx } = await open(UA[k]);
    await p.evaluate(() => window.PadelInstalar.openWizard('menu')); await p.waitForTimeout(200);
    const t = await modalText(p);
    check('Detecta ' + k + ': «' + dev + ' con ' + br + '»', t.includes(dev) && t.includes(br), t.slice(0, 120));
    await ctx.close();
  }

  /* ---------- iPhone con Safari: pasos ---------- */
  let { p, ctx } = await open(UA.iphoneSafari);
  await p.waitForTimeout(2600);
  let t = await modalText(p);
  check('Al entrar desde el navegador, invita a descargar la app', t.includes('Descarga la app') && t.includes('Cómo instalarla'), t.slice(0, 80));
  await p.click('[data-inv="yes"]'); await p.waitForTimeout(200);
  t = await modalText(p);
  check('«Cómo instalarla» abre el asistente y pide confirmar lo detectado', t.includes('¿Es así?') && t.includes('Safari'));
  await p.click('[data-ins="yes"]'); await p.waitForTimeout(200);
  t = await modalText(p);
  check('iPhone + Safari: Compartir → «Añadir a pantalla de inicio» → Añadir', t.includes('Compartir') && t.includes('Añadir a pantalla de inicio') && t.includes('Añadir'));
  check('iPhone: recuerda volver a entrar con la cuenta en la app instalada', t.includes('vuelve a entrar con tu cuenta'));
  await p.click('[data-ins="pick"]'); await p.waitForTimeout(200);
  await p.click('[data-dev="android"]'); await p.waitForTimeout(150);
  await p.click('[data-br="samsung"]'); await p.waitForTimeout(150);
  await p.click('[data-ins="yes"]'); await p.waitForTimeout(200);
  t = await modalText(p);
  check('«No, lo elijo yo»: Android + Samsung Internet da sus pasos', t.includes('Añadir página a') && t.includes('Samsung Internet'));
  await p.click('[data-ins="close"]'); await p.waitForTimeout(200);
  check('«Hecho» cierra el asistente', (await modalText(p)).trim() === '');
  await p.reload(); await p.waitForTimeout(3000);
  check('Tras «Cómo instalarla», no vuelve a invitar en la siguiente visita (7 días)', !(await modalText(p)).includes('Descarga la app'));
  await ctx.close();

  /* ---------- Ahora no / No, gracias ---------- */
  ({ p, ctx } = await open(UA.androidChrome));
  await p.waitForTimeout(2600);
  await p.click('[data-inv="never"]'); await p.waitForTimeout(200);
  check('«No, gracias» lo guarda para siempre', await p.evaluate(() => localStorage.getItem('padel-scouting.invite.install.v1')) === 'never');
  await p.evaluate(() => localStorage.setItem('padel-scouting.invite.install.v1', String(Date.now() - 1000)));
  await p.reload(); await p.waitForTimeout(3000);
  check('Pasados los 7 días de «Ahora no», vuelve a invitar', (await modalText(p)).includes('Descarga la app'));
  await p.click('[data-inv="later"]'); await p.waitForTimeout(200);
  const until = +(await p.evaluate(() => localStorage.getItem('padel-scouting.invite.install.v1')));
  check('«Ahora no» = otra vez dentro de 7 días', until > Date.now() + 6.9 * 864e5 && until < Date.now() + 7.1 * 864e5);
  await ctx.close();

  /* ---------- dentro de Instagram ---------- */
  ({ p, ctx } = await open(UA.iphoneInsta));
  await p.evaluate(() => window.PadelInstalar.openWizard('menu')); await p.waitForTimeout(200);
  check('Dentro de Instagram: explica que hay que abrirla en Safari', (await modalText(p)).includes('Abrir en Safari'));
  await ctx.close();

  /* ---------- menú ---------- */
  ({ p, ctx } = await open(UA.pcEdge, { installSeen: true }));
  await p.click('#menu-btn'); await p.waitForTimeout(300);
  await p.click('[data-shell="instalar"]'); await p.waitForTimeout(300);
  t = await modalText(p);
  check('Menú ☰ → «Descarga la app» abre el asistente', t.includes('Ordenador') && t.includes('Edge'));
  await p.click('[data-ins="yes"]'); await p.waitForTimeout(200);
  check('Ordenador + Edge: Aplicaciones → «Instalar este sitio como aplicación»', (await modalText(p)).includes('Instalar este sitio como aplicación'));
  await ctx.close();

  /* ---------- invitación a los avisos ---------- */
  ({ p, ctx } = await open(UA.iphoneSafari, { session: true, installSeen: true }));
  await p.waitForTimeout(3000);
  t = await modalText(p);
  check('iPhone en Safari con cuenta: la invitación a avisos guía a instalar primero', t.includes('¿Te avisamos de tus partidos?') && t.includes('Cómo instalarla'), t.slice(0, 100));
  await p.click('[data-inv="yes"]'); await p.waitForTimeout(200);
  check('…y abre el asistente de descarga', (await modalText(p)).includes('¿Es así?'));
  await ctx.close();
  ({ p, ctx } = await open(UA.androidChrome, { session: true, installSeen: true }));
  await p.waitForSelector('#modal-root .modal', { timeout: 8000 }).catch(() => {});
  t = await modalText(p);
  check('Android con cuenta y sin avisos: invita a activarlos (los 3 tipos)', t.includes('¿Te avisamos de tus partidos?') && t.includes('Activar avisos') && t.includes('20:00'), t.slice(0, 100) + ' | ' + await p.evaluate(() => localStorage.getItem('padel-scouting.invite.notify.v1') + ' ' + Notification.permission));
  await ctx.close();
  ({ p, ctx } = await open(UA.androidChrome, { installSeen: false, session: true }));
  await p.waitForTimeout(3000);
  t = await modalText(p);
  check('Como mucho una invitación por visita (primero la de descargar)', t.includes('Descarga la app') && !t.includes('¿Te avisamos'));
  await p.click('[data-inv="later"]'); await p.waitForTimeout(3500);
  check('…y no encadena la de avisos en la misma visita', (await modalText(p)).trim() === '');
  await ctx.close();
  ({ p, ctx } = await open(UA.androidChrome, { installSeen: true }));
  await p.waitForTimeout(3000);
  check('Sin cuenta no invita a los avisos', (await modalText(p)).trim() === '');
  await ctx.close();

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
