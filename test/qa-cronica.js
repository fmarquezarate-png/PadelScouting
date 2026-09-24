/* Crónica automática: el motor con los datos reales del mixto S1 y del masculino S1. */
const L = require('../js/liga.js');
const C = require('../js/cronica.js');
const ok = [], bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e != null ? ' → ' + e : ''));

/* Filas «mías» como las arma Nuestra temporada (versión mínima para el motor). */
function rows(snap) {
  const m = L.build(snap), me = m.myTeamId, label = {};
  m.months.forEach(x => { label[x.n] = x.label; });
  const lastLad = m.ladder[m.lastMonth] || {};
  const tot = Object.keys(lastLad).length;
  return m.matches.filter(x => x.home === me || x.away === me).map(x => {
    const home = x.home === me, riv = home ? x.away : x.home, lad = m.ladder[x.month][me] || {};
    const base = { mes: x.month, mesnom: label[x.month], rivalId: riv, rival: m.teams[riv].label,
      grupo: lad.group, lad: lastLad[riv] ? lastLad[riv].place : null, ladTot: tot };
    if (!x.sets) return Object.assign(base, { wo: true, win: (x.walkover === 'home') === home });
    const sets = x.sets.map(s => home ? [s[0], s[1]] : [s[1], s[0]]);
    const w = sets.filter(s => s[0] > s[1]).length;
    return Object.assign(base, { sets, win: w >= 2, stb: sets.length === 3, ganoS1: sets[0][0] > sets[0][1],
      gf: sets.slice(0, 2).reduce((a, s) => a + s[0], 0), ga: sets.slice(0, 2).reduce((a, s) => a + s[1], 0) });
  }).sort((a, b) => a.mes - b.mes);
}

const mix = C.build(rows(require('./fixtures/mixta-snapshot.json')), null);
check('Mixto: 12 partidos (11 jugados + 1 WO)', mix.summary.n === 11 && mix.summary.wo === 1, mix.summary.n + '+' + mix.summary.wo);
check('Mixto: tres actos en orden de meses', mix.acts.length === 3 && mix.acts[0].ph.includes('Febrero') && mix.acts[2].ph.includes('Septiembre'),
  mix.acts.map(a => a.ph).join(' | '));
check('Mixto: ningún acto con meses desordenados', mix.acts.every(a => !/Septiembre → Julio/.test(a.ph)));
check('Mixto: el duelo es Sonia/Jordi (derrota 8–10 y revancha)', mix.duel && mix.duel.rival.startsWith('Sonia') &&
  mix.duel.cards[0].score.endsWith('8–10') && mix.duel.cards[1].text.startsWith('La revancha'));
const hk = Object.fromEntries(mix.highlights.map(h => [h.k, h]));
check('Mixto: super tie-breaks 3–2', hk['Super tie-breaks'] && hk['Super tie-breaks'].v === '3–2');
check('Mixto: mejor mes Mayo (2–0)', hk['Mejor mes'] && hk['Mejor mes'].v === 'Mayo');
check('Mixto: rival más duro el 0–6 0–6', hk['El rival más duro'] && hk['El rival más duro'].sub.startsWith('0–6 · 0–6'));
check('Mixto: una remontada', hk['Remontadas'] && hk['Remontadas'].v === '1');
check('Mixto: el WO cuenta en el acto', mix.acts.some(a => a.text.includes('WO a favor')));

const masc = C.build(rows(require('./fixtures/league-snapshot.json')), null);
check('Masculino: los tres actos de la crónica escrita a mano',
  masc.acts.map(a => a.title).join('|') === 'Al filo|Vivir en el tie-break|Dejar de sufrir', masc.acts.map(a => a.title).join('|'));
check('Masculino: abril 4–0', masc.acts[1].dates.endsWith('4–0'));
check('Masculino: mayo→julio 6–3 sin tercer set', masc.acts[2].dates.endsWith('6–3') && masc.acts[2].text.includes('ninguno llegó'));
check('Masculino: el duelo es Ernesto & Jordi (10–9)', masc.duel && masc.duel.rival.startsWith('Ernesto') && masc.duel.cards[0].score.includes('10–9'));

const lv = C.levels({ fran: [{ nivel: 0.18, fecha: '12/03' }, { nivel: 2.51 }], cris: [{ nivel: 0.18 }, { nivel: 1.54 }], meName: 'Francisco', partnerName: 'Cristian' });
check('Niveles del club: los dos, sin distinguir liga', lv.me.to === 2.51 && lv.partner.to === 1.54 && !('mixto' in lv.me));
check('Sin histórico importado no hay sección de niveles', C.levels({ fran: [] }) === null);

ok.forEach(x => console.log('  ok  ' + x));
if (bad.length) { console.log('\n===== FALLA ====='); bad.forEach(x => console.log('  XX  ' + x)); }
console.log('\n' + ok.length + ' ok / ' + bad.length + ' fallos');
process.exit(bad.length ? 1 : 0);
