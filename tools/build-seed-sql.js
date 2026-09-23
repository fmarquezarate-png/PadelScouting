/* Genera el SQL de carga del primer semestre 2026 a partir del texto
   crudo de la liga. Se ejecuta una vez; después la carga la hace la app. */
const fs = require('fs');
const P = require('../js/liga-parser.js');
const raw = fs.readFileSync(__dirname + '/../legacy/liga-2026-s1.txt', 'utf8');
const r = P.parse(raw);
const q = s => "'" + String(s).replace(/'/g, "''") + "'";

const players = new Map();
const teams = new Map();
for (const label of r.teams) {
  const { a, b } = P.splitTeam(label);
  players.set(a, true); players.set(b, true);
  teams.set(label, [a, b]);
}

const out = [];
out.push(`insert into seasons (slug, name, starts_on) values ('2026-s1','Temporada 2026 · primer semestre','2026-02-01') on conflict (slug) do nothing;`);
out.push(`insert into players (label) values\n  ${[...players.keys()].map(p => `(${q(p)})`).join(',\n  ')}\non conflict (label) do nothing;`);
out.push(`update players set is_me = true where label = 'Francisco ';`);
out.push(`insert into teams (label, player_a_id, player_b_id)\nselect v.label, pa.id, pb.id from (values\n  ${[...teams.entries()].map(([l, [a, b]]) => `(${q(l)},${q(a)},${q(b)})`).join(',\n  ')}\n) as v(label, a, b)\njoin players pa on pa.label = v.a\njoin players pb on pb.label = v.b\non conflict (label) do nothing;`);

const MESNOM = {1:'Febrero',2:'Marzo',3:'Abril',4:'Mayo',5:'Junio',6:'Julio'};
out.push(`insert into league_months (season_id, number, label)\nselect s.id, v.n, v.lab from (values\n  ${r.months.map(m => `(${m.n},${q(MESNOM[m.n] || 'Mes ' + m.n)})`).join(',\n  ')}\n) as v(n, lab), seasons s where s.slug = '2026-s1'\non conflict (season_id, number) do nothing;`);

const groups = [];
r.months.forEach(M => M.groups.forEach(G => groups.push([M.n, G.n])));
out.push(`insert into league_groups (month_id, number)\nselect lm.id, v.g from (values\n  ${groups.map(([m, g]) => `(${m},${g})`).join(',\n  ')}\n) as v(m, g)\njoin league_months lm on lm.number = v.m\njoin seasons s on s.id = lm.season_id and s.slug = '2026-s1'\non conflict (month_id, number) do nothing;`);

const standings = [];
r.months.forEach(M => M.groups.forEach(G => {
  const order = G.order.length ? G.order : G.teams;
  order.forEach((t, i) => standings.push([M.n, G.n, t, i + 1]));
}));
out.push(`insert into group_standings (group_id, team_id, position)\nselect lg.id, t.id, v.pos from (values\n  ${standings.map(([m, g, t, p]) => `(${m},${g},${q(t)},${p})`).join(',\n  ')}\n) as v(m, g, team, pos)\njoin league_months lm on lm.number = v.m\njoin seasons s on s.id = lm.season_id and s.slug = '2026-s1'\njoin league_groups lg on lg.month_id = lm.id and lg.number = v.g\njoin teams t on t.label = v.team\non conflict (group_id, team_id) do nothing;`);

const CHUNK = 150;
for (let i = 0; i < r.matches.length; i += CHUNK) {
  const rows = r.matches.slice(i, i + CHUNK).map(m =>
    `(${m.month},${m.group},${q(m.home)},${q(m.away)},` +
    `${m.sets ? q(JSON.stringify(m.sets)) + '::jsonb' : 'null'},` +
    `${m.walkover ? q(m.walkover) : 'null'},${m.superTieBreak},` +
    `${m.setsHome},${m.setsAway},${m.gamesHome},${m.gamesAway})`);
  out.push(`insert into matches (month_id, group_id, home_team_id, away_team_id, sets, walkover, super_tie_break, sets_home, sets_away, games_home, games_away)\nselect lm.id, lg.id, th.id, ta.id, v.sets, v.wo, v.stb, v.sh, v.sa, v.gh, v.ga from (values\n  ${rows.join(',\n  ')}\n) as v(m, g, home, away, sets, wo, stb, sh, sa, gh, ga)\njoin league_months lm on lm.number = v.m\njoin seasons s on s.id = lm.season_id and s.slug = '2026-s1'\njoin league_groups lg on lg.month_id = lm.id and lg.number = v.g\njoin teams th on th.label = v.home\njoin teams ta on ta.label = v.away\non conflict do nothing;`);
}

fs.mkdirSync(__dirname + '/../tmp-sql', { recursive: true });
out.forEach((sql, i) => fs.writeFileSync(`${__dirname}/../tmp-sql/${String(i).padStart(2,'0')}.sql`, sql));
console.log('bloques:', out.length, '| jugadores:', players.size, '| parejas:', teams.size,
            '| grupos:', groups.length, '| posiciones:', standings.length, '| partidos:', r.matches.length);
