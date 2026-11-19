/* «El club»: enlaces (pantalla y menú ☰; el admin añade, edita, ordena y quita)
   y el ranking del club por jugador (el admin lo sube a otra pareja). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const EXE = require('./chrome-path');
const SNAP = JSON.parse(fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8'));
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e != null ? ' → ' + e : ''));
const J = (r, o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
const ME = SNAP.teams.find(t => t[4]);

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const errors = [];
  async function open(opts) {
    opts = opts || {};
    const S = { links: (opts.links || []).slice(), calls: [] };
    const ctx = await browser.newContext({ viewport: { width: opts.w || 390, height: 844 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e)));
    p.on('dialog', d => d.accept());
    await p.addInitScript(o => {
      localStorage.setItem('padel-scouting.tour.v1', 'done');
      localStorage.setItem('padel-scouting.invite.install.v1', 'never');
      if (o.session) localStorage.setItem('padel-scouting.session.v1', JSON.stringify({
        access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: 'x@x.com' } }));
    }, opts);
    await p.route('**/rest/v1/rpc/**', r => J(r, null));
    await p.route('**/rest/v1/rpc/get_league_snapshot', r => J(r, SNAP));
    await p.route('**/rest/v1/rpc/get_my_round', r => r.abort());
    await p.route('**/rest/v1/rpc/get_my_profile', r => J(r, opts.session
      ? { label: ME[2], category: 'masculina', playsMixed: false, defaultKind: 'masculina', isAdmin: !!opts.admin } : null));
    await p.route('**/rest/v1/rpc/list_club_links', r => J(r, S.links));
    await p.route('**/rest/v1/rpc/save_club_link', r => {
      const a = JSON.parse(r.request().postData()).p; S.calls.push(['save', a]);
      if (a.id) Object.assign(S.links.find(x => x.id === a.id), a); else S.links.push(Object.assign({ id: 100 + S.links.length }, a));
      J(r, S.links);
    });
    await p.route('**/rest/v1/rpc/hide_club_link', r => {
      const a = JSON.parse(r.request().postData()); S.calls.push(['hide', a.p_id]);
      S.links = S.links.filter(x => x.id !== a.p_id); J(r, S.links);
    });
    await p.route('**/rest/v1/rpc/order_club_links', r => {
      const a = JSON.parse(r.request().postData()); S.calls.push(['order', a.p_ids]);
      S.links.sort((x, y) => a.p_ids.indexOf(x.id) - a.p_ids.indexOf(y.id)); J(r, S.links);
    });
    await p.route('**/rest/v1/rpc/get_team_club', r => { S.calls.push(['team', JSON.parse(r.request().postData()).p_team]);
      J(r, { a: { ranking: 120, rows: [['2026-03-12T21:03:58Z', true, 0.5]] }, b: { ranking: 140, rows: [] } }); });
    await p.route('**/rest/v1/rpc/import_player_club_by_label', r => { S.calls.push(['import', JSON.parse(r.request().postData())]);
      J(r, { added: 2, updated: 0, total: 2 }); });
    await p.goto(BASE); await p.waitForTimeout(opts.wait || 1500);
    return { p, ctx, S };
  }
  const LINKS = [
    { id: 1, title: 'Web del club', url: 'https://www.elmoli.com/', note: 'Noticias y horarios', icon: 'web' },
    { id: 2, title: 'Reservar pista', url: 'https://playtomic.com/clubs/club-de-tenis-el-moli', note: '', icon: 'reserva' }];

  /* ---------- cualquiera: pantalla y menú ---------- */
  let { p, ctx, S } = await open({ links: LINKS });
  await p.evaluate(() => window.PadelApp.go('club')); await p.waitForTimeout(500);
  check('«El club» tiene título y frase', (await p.textContent('#page-title')) === 'El club' && (await p.textContent('#view-intro')).length > 20);
  const cards = await p.$$eval('.club-card a.club-hit', as => as.map(a => [a.textContent, a.getAttribute('href'), a.target, a.rel]));
  check('Una tarjeta por enlace, con título, frase y web', cards.length === 2 && cards[0][0].includes('Web del club') &&
    cards[0][0].includes('Noticias y horarios') && cards[0][0].includes('elmoli.com'), JSON.stringify(cards));
  check('Los enlaces se abren aparte y seguros (nueva pestaña, sin opener)', cards.every(c => c[2] === '_blank' && /noopener/.test(c[3])));
  check('El primero destaca (tarjeta grande)', (await p.getAttribute('.club-card:first-child', 'class')).includes('lead'));
  check('Sin ser admin no hay botones de editar', await p.locator('[data-cl-new], [data-cl-edit], [data-cl-hide]').count() === 0);
  await p.click('#menu-btn'); await p.waitForTimeout(300);
  const dr = await p.$$eval('#dr-club .dr-link', as => as.map(a => a.textContent.trim()));
  check('Menú ☰: grupo «El club» con los enlaces', dr.length === 2 && dr[0].includes('Web del club'), dr.join(' | '));
  await p.click('#dr-club [data-drawer-go="club"]'); await p.waitForTimeout(400);
  check('…y «Todos los enlaces» abre la pantalla', (await p.textContent('#page-title')) === 'El club');
  await ctx.close();

  ({ p, ctx, S } = await open({ links: [] }));
  await p.evaluate(() => window.PadelApp.go('club')); await p.waitForTimeout(500);
  check('Sin enlaces: lo explica', (await p.textContent('#view')).includes('El administrador los añadirá'));
  await ctx.close();

  /* ---------- admin ---------- */
  ({ p, ctx, S } = await open({ links: LINKS, session: true, admin: true, wait: 2000 }));
  await p.evaluate(() => { document.getElementById('modal-root').innerHTML = ''; document.body.classList.remove('has-modal'); window.PadelApp.go('club'); });
  await p.waitForTimeout(500);
  await p.click('[data-cl-new]'); await p.waitForTimeout(200);
  await p.fill('#cl-title', 'Instagram'); await p.fill('#cl-url', 'javascript:alert(1)');
  await p.click('[data-cl-save]'); await p.waitForTimeout(300);
  check('No acepta direcciones que no son web', (await p.textContent('.club-editor')).includes('no parece una web') && !S.calls.length);
  await p.fill('#cl-url', 'instagram.com/clubelmoli'); await p.click('[data-cl-icon="redes"]'); await p.waitForTimeout(150);
  check('Elegir icono no borra lo escrito', (await p.inputValue('#cl-title')) === 'Instagram');
  await p.click('[data-cl-save]'); await p.waitForTimeout(600);
  const sv = S.calls.find(c => c[0] === 'save');
  check('Añadir: completa https:// y guarda título e icono', sv && sv[1].url === 'https://instagram.com/clubelmoli' && sv[1].icon === 'redes' && sv[1].title === 'Instagram',
    JSON.stringify(sv));
  check('…y aparece en la pantalla', (await p.$$('.club-card')).length === 3);
  await p.click('[data-cl-up="2"]'); await p.waitForTimeout(500);
  const od = S.calls.find(c => c[0] === 'order');
  check('Subir un enlace guarda el nuevo orden', od && od[1][0] === 2 && od[1][1] === 1, JSON.stringify(od));
  await p.click('[data-cl-edit="1"]'); await p.waitForTimeout(200);
  await p.fill('#cl-note', 'Todo sobre El Molí'); await p.click('[data-cl-save]'); await p.waitForTimeout(500);
  check('Editar guarda los cambios del mismo enlace', S.calls.some(c => c[0] === 'save' && c[1].id === 1 && c[1].note === 'Todo sobre El Molí'));
  await p.click('[data-cl-hide="1"]'); await p.waitForTimeout(500);
  check('Quitar (con confirmación) lo oculta', S.calls.some(c => c[0] === 'hide' && c[1] === 1) && !(await p.textContent('#view')).includes('Web del club'));

  /* ---------- admin: ranking del club de otra pareja ---------- */
  const other = SNAP.teams.find(t => !t[4] && t[0] !== ME[0]);
  await p.evaluate(id => { window.PadelLiga.setViewPair(id); window.PadelApp.go('temporada'); }, other[0]);
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const b = document.querySelector('[data-metric="club"]'); if (b) b.click(); });
  await p.waitForTimeout(900);
  check('Admin mirando otra pareja: carga su nivel del club', S.calls.some(c => c[0] === 'team' && c[1] === other[0]));
  const rk = await p.textContent('#clubRow').catch(() => '');
  check('…y enseña su ranking', rk.includes('120'), rk);
  await p.click('[data-action="club-import"]'); await p.waitForTimeout(200);
  const chips = await p.$$eval('[data-ci-who]', b => b.map(x => x.textContent));
  check('Subir: elige entre los dos jugadores de esa pareja', chips[0] === other[2] && chips[1] === other[3], chips.join(' | '));
  await p.click('[data-ci-who="partner"]'); await p.waitForTimeout(150);
  await p.fill('#ci-text', 'Ranking: 350\n12/03/2026 21:03:58\tGanado\t\t0,18\n21/03/2026 20:00:00\tPerdido\t\t0,16'); await p.waitForTimeout(250);
  await p.click('[data-ci="save"]'); await p.waitForTimeout(500);
  const im = S.calls.find(c => c[0] === 'import');
  check('…y lo guarda en ese jugador (por su nombre en la liga)', im && im[1].p_label === other[3] && im[1].p_ranking === 350 && im[1].p_rows.length === 2 &&
    im[1].p_to === '2026-03-21T20:00:00Z',
    JSON.stringify(im));
  await ctx.close();

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
