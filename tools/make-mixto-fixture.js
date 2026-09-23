/* Foto de prueba del mixto a partir de la muestra de test/fixtures/mixto-muestra.txt.
   Misma forma que devuelve get_league_snapshot(); ids a partir de 1001 para que no
   choquen con los del masculino. Solo para pruebas. */
const fs = require('fs');
const P = require('../js/liga-parser.js');
const r = P.parse(fs.readFileSync(__dirname + '/../test/fixtures/mixto-muestra.txt', 'utf8'));

const id = {}; let next = 1001;
r.teams.forEach(t => { id[t] = next++; });
const teams = r.teams.map(t => {
  const { a, b } = P.splitTeam(t);
  return [id[t], t, a, b, a === 'Francisco' || b === 'Francisco'];
});
const months = r.months.map(m => [m.n, m.label || 'Mes ' + m.n]);
const standings = [];
r.months.forEach(M => M.groups.forEach(G => {
  (G.order.length ? G.order : G.teams).forEach((t, i) => standings.push([M.n, G.n, id[t], i + 1]));
}));
const matches = r.matches.map(m => [m.month, m.group, id[m.home], id[m.away], m.sets, m.walkover]);
const snapshot = {
  season: { slug: '2026-s1-mixta', name: 'Mixto 2026 · primer semestre', kind: 'mixta' },
  months, teams, standings, matches, archetypes: {}
};
fs.writeFileSync(__dirname + '/../test/fixtures/mixto-snapshot.json', JSON.stringify(snapshot));
console.log(months.length, 'meses ·', teams.length, 'parejas ·', matches.length, 'partidos ·',
  'nuestra:', teams.filter(t => t[4]).map(t => t[1]).join(', '));
