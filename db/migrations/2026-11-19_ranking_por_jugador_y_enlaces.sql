/* ============================================================
   2026-11-19 · Ranking del club por jugador + enlaces del club
   (pendiente de aplicar: el conector de Supabase estaba caído)
   No elimina nada: las tablas viejas (club_levels, club_rankings) se quedan
   y sus datos se copian a las nuevas.
   ============================================================ */

/* ---------- 1. Ranking y nivel del club, del JUGADOR ---------- */
create table if not exists public.player_club_levels (
  player_id bigint not null references public.players(id),
  played_at timestamptz not null,
  won boolean not null,
  level numeric not null,
  updated_at timestamptz not null default now(),
  primary key (player_id, played_at)
);
create table if not exists public.player_club_rankings (
  player_id bigint primary key references public.players(id),
  ranking int,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.player_club_levels enable row level security;
alter table public.player_club_rankings enable row level security;
/* Sin políticas: solo se leen y escriben por las funciones de abajo, que miran quién eres. */

/* Tu jugador. */
create or replace function public.my_player_id()
returns bigint language sql stable security definer set search_path = public as $$
  select player_id from profiles where user_id = auth.uid()
$$;

/* Tu pareja en una competición: la de tu equipo más reciente de esa competición. */
create or replace function public.partner_of(p_player bigint, p_kind text)
returns bigint language sql stable security definer set search_path = public as $$
  select case when te.player_a_id = p_player then te.player_b_id else te.player_a_id end
  from teams te
  join group_standings gs on gs.team_id = te.id
  join league_groups lg on lg.id = gs.group_id
  join league_months lm on lm.id = lg.month_id
  join seasons s on s.id = lm.season_id
  where p_player in (te.player_a_id, te.player_b_id) and s.kind = p_kind
  order by s.slug desc, lm.number desc limit 1
$$;

/* ¿Puedes ver (y subir) el nivel de este jugador? Tú, tu pareja (en cualquier competición) o el admin. */
create or replace function public.can_see_player_club(p_player bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or p_player = public.my_player_id()
      or exists (select 1 from teams te where public.my_player_id() in (te.player_a_id, te.player_b_id)
                 and p_player in (te.player_a_id, te.player_b_id))
$$;

create or replace function public.player_club_json(p_player bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p_player is null then null else jsonb_build_object(
    'playerId', p_player,
    'name', (select label from players where id = p_player),
    'ranking', (select ranking from player_club_rankings where player_id = p_player),
    'rows', coalesce((select jsonb_agg(jsonb_build_array(to_char(played_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), won, level)
                       order by played_at) from player_club_levels where player_id = p_player), '[]'::jsonb)) end
$$;

/* La misma forma de siempre para la app: { me, 'partner:masculina', 'partner:mixta', … }. */
create or replace function public.get_my_club_levels()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me bigint := public.my_player_id(); k text; v jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or v_me is null then return null; end if;
  v := jsonb_build_object('me', public.player_club_json(v_me));
  for k in select distinct kind from seasons loop
    v := v || jsonb_build_object('partner:' || k, public.player_club_json(public.partner_of(v_me, k)));
  end loop;
  return v;
end $$;

/* Subir un histórico a un jugador concreto (por su nombre en la liga). */
create or replace function public.import_player_club(p_player bigint, p_ranking int, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_add int; n_upd int; n_tot int;
begin
  if auth.uid() is null then raise exception 'Hace falta iniciar sesión'; end if;
  if p_player is null or not public.can_see_player_club(p_player) then
    raise exception 'Solo puedes subir tu nivel o el de tu pareja.';
  end if;
  if p_ranking is not null then
    insert into player_club_rankings (player_id, ranking, updated_at, updated_by)
      values (p_player, p_ranking, now(), auth.uid())
      on conflict (player_id) do update set ranking = excluded.ranking, updated_at = now(), updated_by = auth.uid();
  end if;
  with x as (
    select (r->>0)::timestamptz as at, (r->>1)::boolean as won, (r->>2)::numeric as level
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  ), old as (select played_at, won, level from player_club_levels where player_id = p_player),
  up as (
    insert into player_club_levels (player_id, played_at, won, level)
    select p_player, at, won, level from x
    on conflict (player_id, played_at) do update set won = excluded.won, level = excluded.level, updated_at = now()
      where player_club_levels.won is distinct from excluded.won or player_club_levels.level is distinct from excluded.level
    returning played_at
  )
  select count(*) filter (where up.played_at not in (select played_at from old)),
         count(*) filter (where up.played_at in (select played_at from old))
    into n_add, n_upd from up;
  select count(*) into n_tot from player_club_levels where player_id = p_player;
  return jsonb_build_object('added', n_add, 'updated', n_upd, 'total', n_tot, 'playerId', p_player);
end $$;

/* La de siempre (yo / mi pareja): ahora escribe en el jugador. */
create or replace function public.import_club_levels(p_who text, p_ranking int, p_name text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me bigint := public.my_player_id(); v_target bigint;
begin
  if v_me is null then raise exception 'Primero dinos quién eres en Mi perfil.'; end if;
  v_target := case when p_who = 'me' then v_me
                   when p_who like 'partner:%' then public.partner_of(v_me, substr(p_who, 9)) end;
  if v_target is null then raise exception 'No encuentro a tu pareja en esa competición.'; end if;
  return public.import_player_club(v_target, p_ranking, p_rows);
end $$;

/* Admin (o la propia pareja): el nivel de los dos jugadores de una pareja. */
create or replace function public.get_team_club(p_team bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a bigint; b bigint;
begin
  select player_a_id, player_b_id into a, b from teams where id = p_team;
  if a is null then return null; end if;
  return jsonb_build_object(
    'a', case when public.can_see_player_club(a) then public.player_club_json(a) end,
    'b', case when public.can_see_player_club(b) then public.player_club_json(b) end);
end $$;

/* Admin: buscar a qué jugador subir por su nombre en la liga. */
create or replace function public.import_player_club_by_label(p_label text, p_ranking int, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  select id into v_id from players where label = p_label;
  if v_id is null then raise exception 'No encuentro a «%» en la liga.', p_label; end if;
  return public.import_player_club(v_id, p_ranking, p_rows);
end $$;

revoke execute on function public.my_player_id(), public.partner_of(bigint, text), public.can_see_player_club(bigint),
  public.player_club_json(bigint), public.get_my_club_levels(), public.import_player_club(bigint, int, jsonb),
  public.import_club_levels(text, int, text, jsonb), public.get_team_club(bigint),
  public.import_player_club_by_label(text, int, jsonb) from public, anon;
grant execute on function public.get_my_club_levels(), public.import_club_levels(text, int, text, jsonb),
  public.get_team_club(bigint), public.import_player_club_by_label(text, int, jsonb) to authenticated;

/* Copiar lo que ya estaba subido (por cuenta) a los jugadores. Sin eliminar nada. */
insert into public.player_club_levels (player_id, played_at, won, level)
select distinct on (tgt, cl.played_at) tgt, cl.played_at, cl.won, cl.level
from (
  select cl.*, case when cl.who = 'me' then pr.player_id
                    when cl.who like 'partner:%' then public.partner_of(pr.player_id, substr(cl.who, 9)) end as tgt
  from public.club_levels cl join public.profiles pr on pr.user_id = cl.user_id
) cl
where tgt is not null
order by tgt, cl.played_at
on conflict (player_id, played_at) do nothing;

insert into public.player_club_rankings (player_id, ranking, updated_by)
select distinct on (tgt) tgt, cr.ranking, cr.user_id
from (
  select cr.*, case when cr.who = 'me' then pr.player_id
                    when cr.who like 'partner:%' then public.partner_of(pr.player_id, substr(cr.who, 9)) end as tgt
  from public.club_rankings cr join public.profiles pr on pr.user_id = cr.user_id
) cr
where tgt is not null and cr.ranking is not null
order by tgt
on conflict (player_id) do nothing;

/* ---------- 2. Enlaces del club ---------- */
create table if not exists public.club_links (
  id bigint generated always as identity primary key,
  title text not null check (length(title) between 1 and 40),
  url text not null check (url ~* '^https?://[^/\s]+\.[^\s]+$'),
  note text check (note is null or length(note) <= 90),
  icon text not null default 'web',
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.club_links enable row level security;
create policy club_links_read on public.club_links for select using (active);

create or replace function public.list_club_links()
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'url', url, 'note', note, 'icon', icon)
                  order by position, id), '[]'::jsonb)
  from club_links where active
$$;

create or replace function public.save_club_link(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint := nullif(p->>'id', '')::bigint;
begin
  perform public.assert_admin();
  if v_id is null then
    insert into club_links (title, url, note, icon, position)
      values (btrim(p->>'title'), btrim(p->>'url'), nullif(btrim(coalesce(p->>'note', '')), ''), coalesce(nullif(p->>'icon', ''), 'web'),
              coalesce((select max(position) + 1 from club_links where active), 0))
      returning id into v_id;
  else
    update club_links set title = btrim(p->>'title'), url = btrim(p->>'url'),
      note = nullif(btrim(coalesce(p->>'note', '')), ''), icon = coalesce(nullif(p->>'icon', ''), 'web'), updated_at = now()
      where id = v_id;
  end if;
  return public.list_club_links();
end $$;

/* Quitar = ocultar (no se elimina). */
create or replace function public.hide_club_link(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update club_links set active = false, updated_at = now() where id = p_id;
  return public.list_club_links();
end $$;

create or replace function public.order_club_links(p_ids bigint[])
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update club_links c set position = x.i, updated_at = now()
    from unnest(p_ids) with ordinality x(id, i) where c.id = x.id;
  return public.list_club_links();
end $$;

grant execute on function public.list_club_links() to anon, authenticated;
revoke execute on function public.save_club_link(jsonb), public.hide_club_link(bigint), public.order_club_links(bigint[]) from public, anon;
grant execute on function public.save_club_link(jsonb), public.hide_club_link(bigint), public.order_club_links(bigint[]) to authenticated;
