/* La liga: pestañas Grupos | Clasif. general, y las fechas de los partidos que trae la carga. */
const { chromium } = require('playwright');
const fs = require('fs');
const P = require('../js/liga-parser.js');
const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e != null ? ' → ' + e : ''));
const J = (r, o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });

(async () => {
  /* ---------- la carga lee las fechas ---------- */
  const raw = fs.readFileSync(__dirname + '/fixtures/mixto-muestra.txt', 'utf8');
  const before = P.parse(raw.replace(/\n(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\n[a-z]+\d{4}\n\d\d:\d\dh/g, ''));
  const r = P.parse(raw);
  check('Las fechas no cambian los partidos jugados', r.matches.length === before.matches.length && r.warnings.length === 0, r.matches.length + ' vs ' + before.matches.length);
  check('Lee las 6 fechas de partidos pendientes de la muestra', r.schedules.length === 6, r.schedules.length);
  const mine = r.schedules.find(x => x.home === 'Francisco /Ana Clerch');
  check('Francisco/Ana vs Annabelle/Alfred: domingo 27 sep a las 19:00', mine && mine.away === 'Annabelle /Alfred Sim' && mine.at === '2026-09-27T19:00', mine && mine.at);
  check('Un partido sin fecha no se inventa una', !r.schedules.some(x => x.home === 'Aleix Samp/Naia Sampe' && x.away === 'Maria Jose/Agustin Ca'));
  const pay = P.toPayload(r, { slug: '2026-s2-mixta', name: 'x', kind: 'mixta' }, raw);
  check('El paquete de carga lleva las fechas', pay.schedules.length === 6 && pay.schedules[0].length === 5);
  check('Lee fechas en catalán y sin hora', P.parseWhen('03 dissabte oct2026') === '2026-10-03T00:00' && P.parseWhen('7 dilluns set2026 9:30h') === '2026-09-07T09:30');
  check('Un marcador no se toma por fecha', P.parseWhen('6-3 / 6-2') === null && P.parseWhen('25') === null);

  /* ---------- pantalla ---------- */
  const snap = JSON.parse(fs.readFileSync(__dirname + '/fixtures/league-snapshot.json', 'utf8'));
  const last = Math.max(...snap.months.map(m => m[0]));
  const g1 = snap.standings.filter(s => s[0] === last && s[1] === 1).sort((a, b) => a[3] - b[3]).map(s => s[2]);
  snap.matches = snap.matches.filter(m => !(m[0] === last && m[1] === 1 && [m[2], m[3]].sort().join() === [g1[0], g1[1]].sort().join()));
  snap.schedules = [[last, 1, g1[0], g1[1], '2026-10-11T19:30']];
  const browser = await chromium.launch({ executablePath: EXE });
  const errors = [];
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errors.push(String(e)));
  await p.route('**/rest/v1/rpc/**', r => J(r, null));
  await p.route('**/rest/v1/rpc/get_league_snapshot', r => J(r, snap));
  await p.goto(BASE); await p.waitForTimeout(1200);
  await p.evaluate(() => window.PadelApp.go('liga')); await p.waitForTimeout(1000);
  const tabs = await p.$$eval('#lgTabs [data-lgtab]', b => b.map(x => x.textContent + ':' + x.getAttribute('aria-selected')));
  check('Dos botones arriba: Grupos (abierto) y Clasif. general', tabs.join('|') === 'Grupos:true|Clasif. general:false', tabs.join('|'));
  const months = await p.$$eval('#grMonths [data-grm]', b => b.filter(x => x.getAttribute('aria-pressed') === 'true').map(x => x.textContent));
  check('Abre en el último mes', months.length === 1 && months[0] === snap.months.find(m => m[0] === last)[1], months.join());
  const nGroups = new Set(snap.standings.filter(s => s[0] === last).map(s => s[1])).size;
  check('Enseña todos los grupos del mes', (await p.$$('.gr-card')).length === nGroups, (await p.$$('.gr-card')).length + ' de ' + nGroups);
  const c1 = await p.textContent('#gr-1');
  check('Partido pendiente con su fecha de la web', c1.includes('dom 11 oct · 19:30'), c1.slice(0, 200));
  check('Pendientes primero y «por jugar» en la cabecera', c1.includes('por jugar') && (await p.$eval('#gr-1 .gr-ms li', li => li.className)).includes('todo'));
  const pts = await p.$$eval('#gr-1 .gr-tbl tbody tr td:last-child', t => t.map(x => parseInt(x.textContent, 10)));
  check('La tabla del grupo va ordenada por puntos', pts.every((v, i) => !i || pts[i - 1] >= v), pts.join());
  await p.click('#grMonths [data-grm="' + snap.months[0][0] + '"]'); await p.waitForTimeout(500);
  check('El selector cambia de mes', (await p.textContent('.lg .blk h2, .lg .blk')).includes(snap.months[0][1]));
  const name = await p.$eval('#gr-2 .gr-tbl tbody tr td.nm', t => t.textContent.trim());
  await p.fill('#grSearch', name.slice(0, 8)); await p.waitForTimeout(400);
  check('Buscar deja solo los grupos de esa pareja', (await p.$$('.gr-card')).length >= 1 && (await p.$$('.gr-card')).length < nGroups);
  check('Buscar no pierde el foco al escribir', await p.evaluate(() => document.activeElement && document.activeElement.id === 'grSearch'));
  await p.click('[data-lgtab="general"]'); await p.waitForTimeout(600);
  check('Clasif. general: la tabla de siempre', (await p.$$('#tblRows tr')).length > 10 && (await p.textContent('.lg')).includes('Clasificación general'));
  await p.evaluate(() => window.PadelApp.go('inicio')); await p.waitForTimeout(300);
  await p.evaluate(() => window.PadelApp.go('liga')); await p.waitForTimeout(700);
  check('Recuerda la pestaña al volver', (await p.getAttribute('[data-lgtab="general"]', 'aria-selected')) === 'true');

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  ok.forEach(x => console.log('  ok  ' + x));
  if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
  console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
  process.exit(bad.length ? 1 : 0);
})();
