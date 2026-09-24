/* Este mes: ronda en curso, fechas, avisos al abrir, resultados y registro en la cuenta. */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const SNAP = fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8');
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e ? ' → ' + e : ''));
const J = (r, o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });

async function mockApp(page, opts) {
  const S = { round: opts.round || null, fid: 100, calls: [], pushed: [], remote: opts.remote || [] };
  await page.route('**/rest/v1/rpc/get_league_snapshot', r => J(r, JSON.parse(SNAP)));
  await page.route('**/rest/v1/rpc/list_seasons', r => J(r, [{ slug: '2026-s1', name: 'Temporada 2026 · primer semestre', kind: 'masculina', matches: 561 }]));
  await page.route('**/rest/v1/rpc/get_my_profile', r => J(r, { label: 'Francisco', category: 'masculina', playsMixed: false, defaultKind: 'masculina' }));
  await page.route('**/rest/v1/rpc/get_my_round', r => { S.calls.push('get_my_round'); J(r, S.round); });
  await page.route('**/rest/v1/rpc/start_round', r => {
    const pl = JSON.parse(r.request().postData()).payload; S.calls.push('start_round'); S.lastStart = pl;
    S.round = { id: 1, label: pl.label, monthStart: pl.monthStart, leagueMonth: pl.leagueMonth, group: pl.group, myTeamId: pl.myTeamId,
      status: 'en_curso', source: pl.source, fixtures: pl.rivals.map(x => ({ id: S.fid++, rivalTeamId: x.teamId, rivalLabel: x.label, scheduledAt: null, status: 'pendiente', sets: null })) };
    J(r, S.round);
  });
  await page.route('**/rest/v1/rpc/keep_round', r => { S.calls.push('keep_round'); J(r, null); });
  await page.route('**/rest/v1/rpc/update_fixture', r => {
    const a = JSON.parse(r.request().postData()); S.calls.push('update_fixture'); S.lastPatch = a.patch;
    const f = S.round.fixtures.find(x => x.id === a.p_id);
    if ('scheduledAt' in a.patch) f.scheduledAt = a.patch.scheduledAt || null;
    if ('status' in a.patch) f.status = a.patch.status;
    if ('sets' in a.patch) f.sets = a.patch.sets;
    if ('recordId' in a.patch) f.recordId = a.patch.recordId;
    J(r, { id: f.id, scheduled_at: f.scheduledAt, status: f.status, sets: f.sets, record_id: f.recordId || null });
  });
  await page.route('**/rest/v1/rpc/list_my_records', r => J(r, S.remote));
  await page.route('**/rest/v1/rpc/push_my_records', r => { S.pushed.push(...JSON.parse(r.request().postData()).items); J(r, 1); });
  if (opts.logged !== false) {
    await page.addInitScript(() => localStorage.setItem('padel-scouting.session.v1', JSON.stringify({
      access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: 'fmarquezarate@gmail.com' } })));
  }
  if (opts.local) await page.addInitScript(l => localStorage.setItem('padel-scouting.v1', JSON.stringify({ version: 1, matches: l })), opts.local);
  return S;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [];
  const newPage = async () => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    return p;
  };
  const text = p => p.textContent('#view');

  /* ---------- sin sesión ---------- */
  {
    const p = await newPage();
    await mockApp(p, { logged: false });
    await p.goto(BASE); await p.waitForTimeout(1500);
    check('Sin sesión: la red invita a montar el grupo', (await p.textContent('.net-btn')).toUpperCase().includes('TU GRUPO DEL MES'));
    check('Sin sesión: no salta ningún aviso', await p.locator('.modal').count() === 0);
    await p.click('.net-btn'); await p.waitForTimeout(900);
    check('La red abre «Este mes»', (await p.textContent('#page-title')) === 'Este mes');
    check('Sin sesión: pide entrar', (await text(p)).includes('Entrar con mi cuenta'));
    await p.close();
  }

  /* ---------- nueva ronda ---------- */
  const p = await newPage();
  const localRec = [{ id: 'm-local1', date: '2026-09-01', rivals: [{ name: 'Yago', archetype: 'A' }, { name: 'Edgar', archetype: 'B' }],
    status: 'normal', sets: [{ own: 6, opponent: 3 }, { own: 6, opponent: 4 }], readSet: 1, readGame: 3, patterns: [], worked: [], notWorked: [],
    physicalState: 'normal', mentalState: 'normal', partnerNotes: '', createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z' }];
  const remoteRec = [{ id: 'm-remote1', deleted: false, updatedAt: '2026-09-10T10:00:00Z', data: { id: 'm-remote1', date: '2026-09-10',
    rivals: [{ name: 'Ernesto', archetype: 'A' }, { name: 'Jordi', archetype: 'A' }], status: 'normal', sets: [{ own: 4, opponent: 6 }, { own: 3, opponent: 6 }],
    readSet: null, readGame: null, patterns: [], worked: [], notWorked: [], physicalState: 'normal', mentalState: 'normal', partnerNotes: '',
    createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z' } }];
  const S = await mockApp(p, { local: localRec, remote: remoteRec });
  await p.goto(BASE); await p.waitForTimeout(2500);

  check('Al abrir sin grupo, pregunta los rivales', (await p.textContent('.modal #rm-t').catch(() => '')).startsWith('Tus rivales de'));
  const rivals = await p.locator('.rm-list li').count();
  check('Propone 3 rivales en masculino', rivals === 3, 'n=' + rivals);
  check('Explica que es una previsión', (await p.textContent('.modal')).includes('reglas de subida y bajada'));
  await p.click('[data-rm-del="0"]'); await p.waitForTimeout(150);
  await p.fill('#rm-q', 'yago'); await p.waitForTimeout(200);
  check('Busca parejas para cambiar una', await p.locator('[data-rm-add]').count() >= 1);
  await p.click('[data-rm-add] >> nth=0'); await p.waitForTimeout(150);
  await p.click('[data-rm="ok"]'); await p.waitForTimeout(1500);
  check('Confirma y guarda la ronda', S.calls.includes('start_round') && S.lastStart.rivals.length === 3);
  check('Si cambias una pareja queda como «elegido por ti»', S.lastStart.source === 'manual');
  check('Lleva a Este mes', (await p.textContent('#page-title')) === 'Este mes');
  check('Una tarjeta por rival', await p.locator('.em-card').count() === 3);
  const t1 = await text(p);
  check('Probabilidad de subir y bajar', t1.includes('Subes') && t1.includes('Bajas'));
  check('Masculino: sin «Te mantienes» (en grupos de 4 nadie se mantiene)', !t1.includes('Te mantienes'));
  const outs = await p.$$eval('.em-o b', els => els.map(e => parseInt(e.textContent, 10)));
  check('Subes + bajas ≈ 100 %', Math.abs(outs.reduce((a, b) => a + b, 0) - 100) <= 1, outs.join('+'));
  check('Cada rival: probabilidad, marcador y puesto', (await p.locator('.em-card').first().textContent()).includes('ganáis'));
  check('Cada rival: botón para comparar', await p.locator('.em-card [data-rival]').count() === 3);

  /* ---------- fecha y calendario ---------- */
  const fx = S.round.fixtures[0].id;
  await p.fill(`[data-fx-date="${fx}"]`, '2026-09-27T19:00'); await p.dispatchEvent(`[data-fx-date="${fx}"]`, 'change'); await p.waitForTimeout(900);
  check('Guarda la fecha y hora', S.lastPatch && /^2026-09-27T\d\d:00:00.000Z$/.test(S.lastPatch.scheduledAt), S.lastPatch && S.lastPatch.scheduledAt);
  check('La tarjeta enseña la fecha', (await p.textContent(`[data-fx="${fx}"] .em-chip`)).includes('19:00'));
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 3000 }).catch(() => null), p.click(`[data-fx-ics="${fx}"]`)]);
  let ics = '';
  if (dl) ics = fs.readFileSync(await dl.path(), 'utf8');
  check('Al calendario: archivo .ics con aviso 2 h antes', ics.includes('BEGIN:VEVENT') && ics.includes('TRIGGER:-PT2H'));
  await p.evaluate(() => window.PadelApp.go('inicio')); await p.waitForTimeout(1200);
  check('La red enseña el próximo partido', /19:00/.test(await p.textContent('.net-btn')), await p.textContent('.net-btn'));

  /* ---------- aviso de resultado ---------- */
  await p.evaluate(() => { window.__PADEL_NOW__ = '2026-09-28T12:00:00Z'; });
  await p.evaluate(() => window.PadelEsteMes.checkPrompts()); await p.waitForTimeout(400);
  check('2 h después, al abrir pregunta el resultado', (await p.textContent('.modal #rs-t').catch(() => '')).startsWith('¿Cómo fue contra'));
  await p.fill('[data-rs-set="0-0"]', '6'); await p.fill('[data-rs-set="0-1"]', '3');
  await p.fill('[data-rs-set="1-0"]', '6'); await p.fill('[data-rs-set="1-1"]', '6');
  await p.click('[data-rs="basic"]'); await p.waitForTimeout(300);
  check('No acepta un set empatado', (await p.textContent('.modal')).includes('no cuadra'));
  await p.fill('[data-rs-set="1-1"]', '7'); await p.waitForTimeout(250);
  check('Con un set cada uno aparece el super tie-break', await p.locator('[data-rs-set="2-0"]').count() === 1);
  await p.click('[data-rs="basic"]'); await p.waitForTimeout(250);
  check('Pide el super tie-break si va 1–1', (await p.textContent('.modal')).includes('falta el super tie-break'));
  await p.fill('[data-rs-set="2-0"]', '10'); await p.fill('[data-rs-set="2-1"]', '8');
  await p.click('[data-rs="basic"]'); await p.waitForTimeout(1200);
  check('Guarda el resultado básico', S.lastPatch.status === 'jugado' && JSON.stringify(S.lastPatch.sets) === '[[6,3],[6,7],[10,8]]', JSON.stringify(S.lastPatch));
  check('No vuelve a preguntar por ese partido', !(await p.textContent('#modal-root')).includes('¿Cómo fue contra'));

  /* WO y «aún no se jugó» */
  const fx2 = S.round.fixtures[1].id, fx3 = S.round.fixtures[2].id;
  await p.evaluate(id => window.PadelEsteMes.openResultModal(window.PadelEsteMes.state.round.fixtures.find(f => f.id === id), false), fx2);
  await p.click('[data-rs="wo_favor"]'); await p.waitForTimeout(900);
  check('WO a favor con un toque', S.lastPatch.status === 'wo_favor');
  await p.evaluate(id => window.PadelEsteMes.openResultModal(window.PadelEsteMes.state.round.fixtures.find(f => f.id === id), false), fx3);
  await p.click('[data-rs="notyet"]'); await p.waitForTimeout(200);
  await p.fill('#rs-when', '2026-10-10T18:30'); await p.click('[data-rs="resave"]'); await p.waitForTimeout(900);
  check('«Aún no se jugó» deja poner otra fecha', /2026-10-10T\d\d:30:00.000Z/.test(S.lastPatch.scheduledAt || ''), S.lastPatch.scheduledAt);

  /* registro completo desde un partido */
  await p.evaluate(() => window.PadelApp.go('estemes')); await p.waitForTimeout(800);
  await p.click(`[data-fx-full="${fx}"]`); await p.waitForTimeout(800);
  check('Registro completo: abre el formulario', (await p.textContent('#page-title')) === 'Registro rápido');
  const r1 = await p.inputValue('#rival-0').catch(() => null) || await p.evaluate(() => window.PadelApp.state.form.rivals[0].name);
  check('Registro completo: rivales y sets ya puestos', !!r1 && (await p.evaluate(() => window.PadelApp.state.form.sets[2].own)) === 10, r1);

  /* ---------- registro en la cuenta ---------- */
  const localNow = await p.evaluate(() => window.PadelStorage.all().map(m => m.id));
  check('Baja a este navegador lo que había en la cuenta', localNow.includes('m-remote1'), localNow.join(','));
  check('Sube lo que solo estaba en el navegador', S.pushed.some(i => i.id === 'm-local1'));
  await p.evaluate(() => window.PadelStorage.remove('m-local1')); await p.waitForTimeout(500);
  check('Borrar también se sube (como borrado)', S.pushed.some(i => i.id === 'm-local1' && i.deleted));

  /* ---------- provisionales en el motor ---------- */
  const prov = await p.evaluate(() => {
    const st = window.PadelEsteMes.state; const keep = st.round;
    st.round = { leagueMonth: 6, group: 13, myTeamId: 81, fixtures: [
      { rivalTeamId: 1, status: 'jugado', sets: [[6, 1], [6, 2]] }, { rivalTeamId: 2, status: 'wo_contra' }, { rivalTeamId: 3, status: 'pendiente' }] };
    const out = window.PadelEsteMes.provisionalMatches({ months: [[6, 'Julio']], matches: [[6, 13, 3, 81, [[6, 4], [6, 4]], null]] });
    st.round = keep; return out;
  });
  check('Provisionales: tus resultados entran en el motor marcados', prov.length === 2 && prov.every(x => x[6] === 1), JSON.stringify(prov));
  check('Provisionales: si la liga ya lo publicó, manda la liga', !prov.some(x => x[3] === 3));

  /* ---------- si la liga ya tiene el grupo del mes, sale de la liga ---------- */
  const fromLeague = await p.evaluate(() => {
    window.__PADEL_NOW__ = '2026-07-15T12:00:00Z';
    const m = window.PadelLiga.state.model; const pr = window.PadelEsteMes.proposal(m);
    const lad = m.ladder[m.lastMonth]; const me = m.myTeamId;
    const real = Object.keys(lad).map(Number).filter(id => id !== me && lad[id].group === lad[me].group).sort();
    window.__PADEL_NOW__ = null;
    return { source: pr.source, label: pr.label, group: pr.group, ok: JSON.stringify(pr.rivals.slice().sort()) === JSON.stringify(real) };
  });
  check('Mes en curso publicado: el grupo sale exacto de la liga', fromLeague.source === 'liga' && fromLeague.label === 'Julio' &&
    fromLeague.group === 13 && fromLeague.ok, JSON.stringify(fromLeague));

  /* ---------- sin respuesta de la base no pregunta ---------- */
  {
    const q = await newPage();
    await mockApp(q, {});
    await q.route('**/rest/v1/rpc/get_my_round', r => r.abort());
    await q.goto(BASE); await q.waitForTimeout(2200);
    check('Si la base no contesta, no pide rivales (evita rondas duplicadas)', await q.locator('.modal #rm-t').count() === 0);
    await q.close();
  }

  /* ---------- «sigue la misma ronda» ---------- */
  {
    const q = await newPage();
    const old = { id: 9, label: 'Septiembre', monthStart: '2026-08-01', leagueMonth: null, group: 12, myTeamId: 81, status: 'en_curso', source: 'prevision', fixtures: [] };
    const S2 = await mockApp(q, { round: old });
    await q.goto(BASE); await q.waitForTimeout(2200);
    check('Mes nuevo con ronda abierta: vuelve a preguntar', await q.locator('[data-rm="keep"]').count() === 1);
    await q.click('[data-rm="keep"]'); await q.waitForTimeout(700);
    check('«Sigue la misma ronda» no crea otra', S2.calls.includes('keep_round') && !S2.calls.includes('start_round'));
    await q.close();
  }

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
