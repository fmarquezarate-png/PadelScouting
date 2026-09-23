/* Genera una foto de la liga idéntica a la que devuelve get_league_snapshot(),
   a partir del texto crudo. Sirve para probar la app sin tocar Supabase. */
const fs = require('fs');
const P = require('../js/liga-parser.js');
const r = P.parse(fs.readFileSync(__dirname + '/../legacy/liga-2026-s1.txt', 'utf8'));

const ids = fs.readFileSync(__dirname + '/team-ids.txt', 'utf8').trim();
const teamId = {}; const teamLabel = {};
ids.split('|').forEach(p => { const i = p.indexOf('='); teamId[p.slice(i + 1)] = +p.slice(0, i); teamLabel[+p.slice(0, i)] = p.slice(i + 1); });

const MES = { 1: 'Febrero', 2: 'Marzo', 3: 'Abril', 4: 'Mayo', 5: 'Junio', 6: 'Julio' };
const teams = Object.keys(teamLabel).map(Number).sort((a, b) => a - b).map(id => {
  const { a, b } = P.splitTeam(teamLabel[id]);
  return [id, teamLabel[id], a, b, teamLabel[id] === 'Francisco /Cristian C'];
});
const months = r.months.map(m => [m.n, MES[m.n] || 'Mes ' + m.n]).sort((a, b) => a[0] - b[0]);

const standings = [];
r.months.forEach(M => M.groups.forEach(G => {
  (G.order.length ? G.order : G.teams).forEach((t, i) => standings.push([M.n, G.n, teamId[t], i + 1]));
}));
standings.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[3] - y[3]);

const matches = r.matches.map(m =>
  [m.month, m.group, teamId[m.home], teamId[m.away], m.sets, m.walkover]);

const snapshot = {
  season: { slug: '2026-s1', name: 'Temporada 2026 · primer semestre' },
  months, teams, standings, matches, archetypes: {}
};
fs.writeFileSync(__dirname + '/../test/fixtures/league-snapshot.json', JSON.stringify(snapshot));
const crypto = require('crypto');
const md5 = x => crypto.createHash('md5').update(JSON.stringify(x)).digest('hex');
console.log('teams  ', md5(teams));
console.log('months ', md5(months));
console.log('stand  ', md5(standings));
console.log('matches', md5(matches));
console.log('bytes  ', JSON.stringify(snapshot).length);
