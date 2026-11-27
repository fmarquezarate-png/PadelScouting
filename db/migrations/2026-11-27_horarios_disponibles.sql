/* ============================================================
   2026-11-27 · Horarios disponibles de la pareja («Este mes»)
   (pendiente de revisar y aplicar)
   · Los horarios son de la PERSONA (jugador), por mes. Una sola marca vale para
     todas sus parejas (mixto y no mixto), salvo que decida un horario distinto
     para una pareja concreta (team_id).
   · Un día = una máscara de 4 bloques: bit0 18:00, bit1 19:15, bit2 20:30, bit3 21:45
     (cada uno 1 h 15 min, hasta las 23:00). Fin de semana abierto = 15 (todos).
   · Solo se guardan los días DISPONIBLES. El modo «días ocupados» de la pantalla se
     convierte en días disponibles antes de guardar.
   · Una fila en availability_sets significa «esta persona ya marcó ese mes»,
     aunque no tenga ningún día libre (distinto de «aún no ha marcado»).
   · Sin políticas en las tablas: se leen y escriben solo por las funciones de abajo,
     que miran quién eres y si formas equipo con la otra persona.
   No elimina ni modifica nada existente.
   ============================================================ */

create table if not exists public.availability_sets (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.players(id),
  team_id bigint references public.teams(id),      -- null = horario general
  month_start date not null check (month_start = date_trunc('month', month_start)::date),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create unique index if not exists availability_sets_uniq
  on public.availability_sets (player_id, coalesce(team_id, -1), month_start);

create table if not exists public.availability_days (
  set_id bigint not null references public.availability_sets(id) on delete cascade,
  day date not null,
  blocks smallint not null check (blocks between 1 and 15),
  primary key (set_id, day)
);

alter table public.availability_sets enable row level security;
alter table public.availability_days enable row level security;
/* Sin políticas a propósito: el acceso directo queda cerrado. */
revoke all on public.availability_sets from anon, authenticated;
revoke all on public.availability_days from anon, authenticated;

/* ¿Soy uno de los dos jugadores de ese equipo? */
create or replace function public.i_am_in_team(p_team_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from teams t
    where t.id = p_team_id and public.my_player_id() in (t.player_a_id, t.player_b_id)
  )
$$;

/* Horarios de una pareja en un mes: uno por jugador del equipo.
   Para cada jugador manda su horario de esa pareja si lo hay; si no, el general;
   si no, «pendiente». */
create or replace function public.get_pair_availability(p_team_id bigint, p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_month date := date_trunc('month', p_month)::date; v_out jsonb;
begin
  if auth.uid() is null or not public.i_am_in_team(p_team_id) then
    raise exception 'No perteneces a esta pareja' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'player_id', pl.id,
      'name', coalesce(pl.display_name, pl.label),
      'is_me', pl.id = public.my_player_id(),
      'has_account', exists (select 1 from profiles pr where pr.player_id = pl.id),
      'status', case when s.id is null then 'pendiente' else 'marcado' end,
      'scope', case when s.team_id is not null then 'pareja' else 'general' end,
      'days', coalesce((select jsonb_object_agg(d.day::text, d.blocks) from availability_days d where d.set_id = s.id), '{}'::jsonb)
    ) order by (pl.id = public.my_player_id()) desc, pl.id), '[]'::jsonb)
  into v_out
  from teams t
  join players pl on pl.id in (t.player_a_id, t.player_b_id)
  left join lateral (
    select s2.* from availability_sets s2
    where s2.player_id = pl.id and s2.month_start = v_month
      and (s2.team_id = t.id or s2.team_id is null)
    order by (s2.team_id is not null) desc
    limit 1
  ) s on true
  where t.id = p_team_id;
  return v_out;
end $$;

/* Guarda MIS horarios de un mes (sustituye los anteriores de ese mismo alcance).
   p = { month: '2026-12-01', team_id: null | n, days: { '2026-12-03': 6, ... } } */
create or replace function public.save_availability(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me bigint := public.my_player_id();
  v_month date := date_trunc('month', (p->>'month')::date)::date;
  v_team bigint := nullif(p->>'team_id', '')::bigint;
  v_set bigint; v_key text; v_val int;
begin
  if auth.uid() is null or v_me is null then
    raise exception 'Necesitas iniciar sesión y tener tu jugador asignado' using errcode = '42501';
  end if;
  if v_team is not null and not public.i_am_in_team(v_team) then
    raise exception 'No perteneces a esta pareja' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p->'days', '{}'::jsonb)) <> 'object' or (select count(*) from jsonb_object_keys(coalesce(p->'days', '{}'::jsonb))) > 70 then
    raise exception 'Días no válidos' using errcode = '22023';
  end if;

  insert into availability_sets (player_id, team_id, month_start)
    values (v_me, v_team, v_month)
    on conflict (player_id, coalesce(team_id, -1), month_start)
    do update set updated_at = now(), updated_by = auth.uid()
    returning id into v_set;

  delete from availability_days where set_id = v_set;
  for v_key, v_val in select key, value::int from jsonb_each_text(coalesce(p->'days', '{}'::jsonb)) loop
    if v_val between 1 and 15 then
      insert into availability_days (set_id, day, blocks) values (v_set, v_key::date, v_val);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'set_id', v_set);
end $$;

/* Quita MI horario «distinto para esta pareja» (vuelve a valer el general). */
create or replace function public.delete_pair_availability(p_team_id bigint, p_month date)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.my_player_id() is null or not public.i_am_in_team(p_team_id) then
    raise exception 'No perteneces a esta pareja' using errcode = '42501';
  end if;
  delete from availability_sets
   where player_id = public.my_player_id() and team_id = p_team_id
     and month_start = date_trunc('month', p_month)::date;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.i_am_in_team(bigint) from public, anon;
revoke execute on function public.get_pair_availability(bigint, date) from public, anon;
revoke execute on function public.save_availability(jsonb) from public, anon;
revoke execute on function public.delete_pair_availability(bigint, date) from public, anon;
grant execute on function public.i_am_in_team(bigint) to authenticated;
grant execute on function public.get_pair_availability(bigint, date) to authenticated;
grant execute on function public.save_availability(jsonb) to authenticated;
grant execute on function public.delete_pair_availability(bigint, date) to authenticated;
