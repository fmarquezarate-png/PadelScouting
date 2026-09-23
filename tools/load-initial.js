/* Carga única del primer semestre 2026 en Supabase, vía tablas puente. */
const fs = require('fs');
const P = require('../js/liga-parser.js');
const r = P.parse(fs.readFileSync(__dirname + '/../legacy/liga-2026-s1.txt', 'utf8'));

const standings = [];
r.months.forEach(M => M.groups.forEach(G => {
  (G.order.length ? G.order : G.teams).forEach((t, i) =>
    standings.push({ month: M.n, grp: G.n, team: t, pos: i + 1 }));
}));
const matches = r.matches.map(m => ({
  month: m.month, grp: m.group, home: m.home, away: m.away,
  sets: m.sets, walkover: m.walkover, stb: m.superTieBreak,
  sh: m.setsHome, sa: m.setsAway, gh: m.gamesHome, ga: m.gamesAway
}));
fs.writeFileSync(__dirname + '/../tmp-sql/standings.json', JSON.stringify(standings));
fs.writeFileSync(__dirname + '/../tmp-sql/matches.json', JSON.stringify(matches));
console.log('standings:', standings.length, 'matches:', matches.length);
