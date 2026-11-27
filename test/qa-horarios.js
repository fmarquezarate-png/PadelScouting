/* Nuestros horarios (Este mes): calendario de la pareja, editor en dos pasos, alcance por pareja,
   pareja sin cuenta, fallo de red e imagen para compartir. */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const SNAP = fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8');
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e ? ' → ' + e : ''));
const J = (r, o, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(o) });

const ROUND = (month) => ({ id: 30, label: 'Septiembre', monthStart: month || '2026-09-01', leagueMonth: 6, group: 13, myTeamId: 81,
  status: 'en_curso', source: 'liga', fixtures: [{ id: 301, rivalTeamId: 1, rivalLabel: 'X', scheduledAt: null, status: 'pendiente', sets: null }] });
const ME = (days, scope) => ({ player_id: 1, name: 'Francisco Márquez', is_me: true, has_account: true,
  status: days ? 'marcado' : 'pendiente', scope: scope || 'general', days: days || {} });
const MATE = (days, account) => ({ player_id: 2, name: 'Marta Ruiz', is_me: false, has_account: account !== false,
  status: days ? 'marcado' : 'pendiente', scope: 'general', days: days || {} });

async function mockApp(page, o) {
  const S = { round: o.round || ROUND(), av: o.av, calls: [], saves: [], fail: !!o.fail };
  await page.route('**/rest/v1/rpc/get_league_snapshot', r => J(r, JSON.parse(SNAP)));
  await page.route('**/rest/v1/rpc/list_seasons', r => J(r, [{ slug: '2026-s1', name: 'Temporada 2026 · primer semestre', kind: 'masculina', matches: 561 }]));
  await page.route('**/rest/v1/rpc/get_my_profile', r => J(r, { label: 'Francisco', category: 'masculina', playsMixed: false, defaultKind: 'masculina' }));
  await page.route('**/rest/v1/rpc/get_my_round', r => J(r, S.round));
  await page.route('**/rest/v1/rpc/list_my_records', r => J(r, []));
  await page.route('**/rest/v1/rpc/push_my_records', r => J(r, 0));
  await page.route('**/rest/v1/rpc/get_pair_availability', r => {
    S.calls.push(['get', JSON.parse(r.request().postData())]);
    if (S.fail) return J(r, { message: 'sin red' }, 503);
    J(r, S.av);
  });
  await page.route('**/rest/v1/rpc/save_availability', r => {
    const a = JSON.parse(r.request().postData()); S.calls.push(['save']); S.saves.push(a.p);
    S.av = S.av.map(p => p.is_me ? Object.assign({}, p, { status: 'marcado', scope: a.p.team_id ? 'pareja' : 'general', days: a.p.days }) : p);
    J(r, { ok: true, set_id: 1 });
  });
  await page.route('**/rest/v1/rpc/delete_pair_availability', r => { S.calls.push(['delete', JSON.parse(r.request().postData())]); J(r, { ok: true }); });
  await page.addInitScript(() => localStorage.setItem('padel-scouting.session.v1', JSON.stringify({
    access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: 'test@example.com' } })));
  await page.addInitScript(n => { window.__PADEL_NOW__ = n; }, o.now || '2026-09-10T12:00:00Z');
  return S;
}

(async () => {
  const browser = await chromium.launch({ executablePath: require('./chrome-path') });
  const errors = [];
  const open = async (o) => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    const S = await mockApp(p, o);
    await p.goto(BASE); await p.waitForTimeout(1800);
    await p.evaluate(() => { document.getElementById('modal-root').innerHTML = ''; document.body.classList.remove('has-modal'); window.PadelApp.go('estemes'); });
    await p.waitForTimeout(1200);
    return { p, S };
  };
  const box = p => p.textContent('#em-av').catch(() => '');
  const cell = (p, d) => p.locator('#em-av .av-day[aria-label^="' + d + ' "]').first();

  /* ---------- lógica pura ---------- */
  {
    const { p } = await open({ av: [ME(null), MATE(null)] });
    const r = await p.evaluate(() => {
      const H = window.PadelHorarios;
      return {
        a: H.rangeText('2026-09-17', 15), b: H.rangeText('2026-09-17', 6), c: H.rangeText('2026-09-17', 9),
        d: H.rangeText('2026-09-19', 15), dec: H.windowDays('2026-12-01'), jul: H.windowDays('2026-07-01'), sep: H.windowDays('2026-09-01'),
        solo: H.combine([{ is_me: true, status: 'marcado', days: { '2026-09-17': 6 } }, { is_me: false, has_account: false, status: 'pendiente', days: {} }]),
        both: H.combine([{ is_me: true, status: 'marcado', days: { '2026-09-17': 6, '2026-09-18': 1 } }, { is_me: false, has_account: true, status: 'marcado', days: { '2026-09-17': 3, '2026-09-18': 2 } }])
      };
    });
    check('Bloques → texto: todos = 18–23', r.a === '18–23', r.a);
    check('Bloques → texto: los dos del medio = 19:15–21:45', r.b === '19:15–21:45', r.b);
    check('Bloques → texto: sueltos se separan', r.c === '18–19:15 · 21:45–23', r.c);
    check('Fin de semana = «Libre»', r.d === 'Libre', r.d);
    check('La ronda de diciembre cubre diciembre y enero', r.dec.length === 62 && r.dec[61] === '2027-01-31', r.dec.length + ' ' + r.dec[61]);
    check('La ronda de julio cubre julio y agosto', r.jul.length === 62 && r.jul[61] === '2026-08-31');
    check('Un mes normal cubre solo ese mes', r.sep.length === 30);
    check('Pareja sin cuenta: el calendario son tus horarios', r.solo.mode === 'solo' && r.solo.shared['2026-09-17'] === 6);
    check('Los dos marcados: se cruzan bloque a bloque', r.both.mode === 'pareja' && r.both.shared['2026-09-17'] === 2 && !r.both.shared['2026-09-18'],
      JSON.stringify(r.both.shared));
    await p.close();
  }

  /* ---------- calendario de la pareja ---------- */
  {
    const mine = { '2026-09-17': 15, '2026-09-24': 6, '2026-09-19': 15 };
    const hers = { '2026-09-17': 6, '2026-09-19': 15, '2026-09-24': 1 };
    const { p, S } = await open({ av: [ME(mine), MATE(hers)] });
    const t = await box(p);
    check('Este mes enseña «Nuestros horarios»', t.includes('Nuestros horarios'));
    check('Pide los horarios de la ronda: equipo y mes', S.calls.some(c => c[0] === 'get' && c[1].p_team_id === 81 && c[1].p_month === '2026-09-01'));
    check('Jueves 17: verde con 19:15–21:45', await cell(p, '17').evaluate(e => e.classList.contains('both')) &&
      (await cell(p, '17').textContent()).includes('19:15–21:45'));
    check('Jueves 17: se encienden los 2 bloques del medio',
      JSON.stringify(await cell(p, '17').locator('.av-bars i').evaluateAll(els => els.map(e => e.className))) === '["half","on","on","half"]');
    check('Sábado 19: libre los dos', (await cell(p, '19').textContent()).includes('Libre'));
    check('Jueves 24: sin coincidencia, marcado como «solo uno»', await cell(p, '24').evaluate(e => e.classList.contains('one') && !e.classList.contains('both')));
    check('El calendario empieza en lunes (1 de sept. = martes, 1 hueco)', await p.locator('#em-av .av-cal .av-pad').count() === 1);
    check('Botón de compartir activo', await p.locator('[data-av="share"]').isEnabled());

    /* imagen: sin «compartir» del sistema (escritorio) se descarga un PNG */
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), p.click('[data-av="share"]')]);
    let png = Buffer.alloc(0);
    if (dl) png = fs.readFileSync(await dl.path());
    check('Compartir genera una imagen PNG', png.length > 5000 && png.slice(1, 4).toString() === 'PNG', 'bytes=' + png.length);
    check('La imagen se llama como la pareja', !!dl && /^horarios-.+\.png$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());

    /* ---------- editor: días que puedo → horas → guardar ---------- */
    await p.click('[data-av="edit"]'); await p.waitForTimeout(200);
    check('Editor: arranca en «Días que puedo» (pocos días libres)', await p.getAttribute('[data-ed-mode="can"]', 'aria-pressed') === 'true');
    check('Editor: los días pasados no se tocan', await p.locator('[data-ed-day="2026-09-05"]').isDisabled());
    await p.click('[data-ed-day="2026-09-22"]'); await p.waitForTimeout(100);
    check('Editor: tocar un día lo marca', await p.getAttribute('[data-ed-day="2026-09-22"]', 'aria-pressed') === 'true');
    await p.click('[data-ed="next"]'); await p.waitForTimeout(100);
    check('Paso 2: pregunta las horas', (await p.textContent('.modal')).includes('¿A qué hora puedes?'));
    check('Paso 2: el fin de semana no pide horas', await p.locator('[data-ed-day="2026-09-19"]').isDisabled());
    await p.click('[data-ed-day="2026-09-22"]'); await p.waitForTimeout(100);
    check('Paso 2: al tocar un día salen sus 4 bloques encendidos', await p.locator('[data-ed-block][aria-pressed="true"]').count() === 4);
    await p.click('[data-ed-block="0"]'); await p.waitForTimeout(100);
    check('Paso 2: se apaga el bloque de las 18:00', await p.getAttribute('[data-ed-block="0"]', 'aria-pressed') === 'false');
    await p.click('[data-ed="save"]'); await p.waitForTimeout(900);
    const sv = S.saves[S.saves.length - 1] || {};
    check('Guarda tus horarios del mes', sv.month === '2026-09-01' && sv.team_id === null);
    check('Guarda el martes 22 sin las 18:00 (14) y conserva lo anterior', sv.days && sv.days['2026-09-22'] === 14 && sv.days['2026-09-17'] === 15 &&
      sv.days['2026-09-19'] === 15, JSON.stringify(sv.days));
    check('Tras guardar se cierra y se recarga', await p.locator('.modal').count() === 0 && S.calls.filter(c => c[0] === 'get').length >= 2);

    /* ---------- distinto para esta pareja, y vuelta al general ---------- */
    await p.click('[data-av="edit"]'); await p.click('[data-ed-pair]'); await p.click('[data-ed="next"]'); await p.click('[data-ed="save"]');
    await p.waitForTimeout(900);
    check('«Distinto para esta pareja» guarda con el equipo', S.saves[S.saves.length - 1].team_id === 81);
    check('Lo dice debajo del calendario', (await box(p)).includes('solo para esta pareja'));
    await p.click('[data-av="edit"]');
    check('Al volver a abrir recuerda que es solo de esta pareja', await p.getAttribute('[data-ed-pair]', 'aria-pressed') === 'true');
    await p.click('[data-ed-pair]'); await p.click('[data-ed="next"]'); await p.click('[data-ed="save"]'); await p.waitForTimeout(900);
    const iDel = S.calls.findIndex(c => c[0] === 'delete'), iSave = S.calls.map(c => c[0]).lastIndexOf('save');
    check('Quitarlo borra el de la pareja y guarda el general', iDel >= 0 && iSave > iDel && S.saves[S.saves.length - 1].team_id === null);
    await p.close();
  }

  /* ---------- modo «días que NO puedo» ---------- */
  {
    const { p, S } = await open({ av: [ME(null), MATE(null)] });
    const t = await box(p);
    check('Sin marcar: lo avisa y no enseña calendario', t.includes('Aún no has marcado') && await p.locator('#em-av .av-cal').count() === 0);
    check('Sin marcar: no se puede compartir todavía', await p.locator('[data-av="share"]').count() === 0);
    await p.click('[data-av="edit"]'); await p.click('[data-ed-mode="cant"]'); await p.waitForTimeout(100);
    check('«NO puedo»: parte de todo el mes libre', (await p.textContent('.modal')).includes('21 días libres'), await p.textContent('.modal .field-note:last-child'));
    await p.click('[data-ed-day="2026-09-15"]'); await p.waitForTimeout(100);
    check('«NO puedo»: tocar marca el día como ocupado', await p.locator('[data-ed-day="2026-09-15"].busy').count() === 1);
    await p.click('[data-ed="next"]'); await p.click('[data-ed="save"]'); await p.waitForTimeout(900);
    const sv = S.saves[0] || { days: {} };
    check('Guarda los demás días con todos los bloques', Object.keys(sv.days).length === 20 && !sv.days['2026-09-15'] && sv.days['2026-09-16'] === 15,
      Object.keys(sv.days).length);
    check('Con la pareja sin marcar: lo dice y deja compartir los tuyos', (await box(p)).includes('Falta que Marta') &&
      await p.locator('[data-av="share"]').isEnabled());
    await p.close();
  }

  /* ---------- pareja que no usa la app ---------- */
  {
    const { p } = await open({ av: [ME({ '2026-09-17': 6 }), MATE(null, false)] });
    const t = await box(p);
    check('Pareja sin cuenta: lo deja claro', t.includes('Marta no usa la app') && t.includes('tus'));
    check('Pareja sin cuenta: tus horarios salen en verde', (await cell(p, '17').textContent()).includes('19:15–21:45'));
    await p.close();
  }

  /* ---------- fallo de red: no se inventa un calendario vacío ---------- */
  {
    const { p, S } = await open({ av: [ME({ '2026-09-17': 6 }), MATE(null)], fail: true });
    const t = await box(p);
    check('Sin red: avisa y ofrece reintentar', t.includes('No se pudieron cargar') && await p.locator('[data-av="retry"]').count() === 1);
    check('Sin red: no deja editar ni compartir', await p.locator('[data-av="edit"], [data-av="share"]').count() === 0);
    S.fail = false;
    await p.click('[data-av="retry"]'); await p.waitForTimeout(800);
    check('Al reintentar con red, aparece el calendario', await p.locator('#em-av .av-cal').count() === 1);
    await p.close();
  }

  /* ---------- la imagen sigue el tema de la app ---------- */
  {
    const { p } = await open({ av: [ME({ '2026-09-17': 15 }), MATE(null, false)] });
    const bg = await p.evaluate(() => {
      const H = window.PadelHorarios, out = {};
      ['light', 'dark'].forEach(t => {
        document.documentElement.setAttribute('data-theme', t);
        const cv = H.drawImage(H.combine(H.state.data));
        const px = cv.getContext('2d').getImageData(20, 40, 1, 1).data;
        out[t] = [px[0], px[1], px[2]].join(',');
      });
      return out;
    });
    check('Tema claro → imagen clara', bg.light === '243,241,234', bg.light);
    check('Tema oscuro → imagen oscura', bg.dark === '14,17,9', bg.dark);
    await p.close();
  }

  /* ---------- periodo siguiente (para tenerlo listo el día 1) ---------- */
  {
    const r = await (async () => {
      const { p } = await open({ av: [ME(null), MATE(null)] });
      const v = await p.evaluate(() => {
        const H = window.PadelHorarios;
        return [H.nextPeriod('2026-09-01'), H.nextPeriod('2026-07-01'), H.nextPeriod('2026-12-01')];
      });
      await p.close(); return v;
    })();
    check('Siguiente de septiembre = octubre', r[0] === '2026-10-01', r[0]);
    check('Siguiente de julio (julio-agosto) = septiembre', r[1] === '2026-09-01', r[1]);
    check('Siguiente de diciembre (diciembre-enero) = febrero', r[2] === '2027-02-01', r[2]);

    const { p, S } = await open({ av: [ME({ '2026-10-06': 15 }), MATE({ '2026-10-06': 2 })] });
    check('Arriba: elegir «Este mes» o el siguiente', await p.getAttribute('[data-av-period="actual"]', 'aria-pressed') === 'true' &&
      (await p.textContent('[data-av-period="siguiente"]')).includes('Octubre'));
    await p.click('[data-av-period="siguiente"]'); await p.waitForTimeout(800);
    const last = S.calls.filter(c => c[0] === 'get').pop();
    check('El siguiente pide los horarios de octubre', last && last[1].p_month === '2026-10-01', JSON.stringify(last));
    check('Enseña el calendario de octubre con lo común', (await cell(p, '6').textContent()).includes('19:15–20:30') &&
      (await box(p)).includes('antes del día 1'));
    await p.click('[data-av="edit"]');
    check('El editor es del mes siguiente', (await p.textContent('#av-t')).includes('Octubre'));
    await p.click('[data-ed-day="2026-10-07"]'); await p.click('[data-ed="next"]'); await p.click('[data-ed="save"]'); await p.waitForTimeout(900);
    const sv = S.saves[S.saves.length - 1] || {};
    check('Se guarda en octubre', sv.month === '2026-10-01' && sv.days['2026-10-07'] === 15 && sv.days['2026-10-06'] === 15, JSON.stringify(sv));
    await p.click('[data-av-period="actual"]'); await p.waitForTimeout(800);
    check('Volver a «Este mes» pide septiembre', S.calls.filter(c => c[0] === 'get').pop()[1].p_month === '2026-09-01');
    await p.close();
  }
  {
    /* La ronda de septiembre ya terminó (1 de octubre, aún sin grupo nuevo): se abre el siguiente. */
    const { p, S } = await open({ av: [ME(null), MATE(null)], now: '2026-10-01T09:00:00Z' });
    check('Si la ronda ya terminó, abre directamente el siguiente', await p.getAttribute('[data-av-period="siguiente"]', 'aria-pressed') === 'true' &&
      S.calls.filter(c => c[0] === 'get').pop()[1].p_month === '2026-10-01');
    await p.close();
  }

  /* ---------- ronda de diciembre: diciembre y enero ---------- */
  {
    const { p } = await open({ round: ROUND('2026-12-01'), av: [ME({ '2027-01-12': 15 }), MATE(null, false)], now: '2026-12-02T12:00:00Z' });
    const months = await p.$$eval('#em-av .av-month', els => els.map(e => e.textContent));
    check('Diciembre: el calendario enseña diciembre y enero', JSON.stringify(months) === '["Diciembre","Enero"]', JSON.stringify(months));
    await p.close();
  }

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
