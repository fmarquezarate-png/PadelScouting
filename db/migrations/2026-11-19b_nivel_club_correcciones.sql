/* ============================================================
   2026-11-19b · Nivel del club: al volver a subir el histórico, lo que sobra se oculta
   Cuando el club corrige un resultado, el apunte erróneo desaparece de su histórico.
   Al subir de nuevo, los apuntes guardados dentro de las fechas del texto pegado que ya
   no están en él (los erróneos de antes) se ocultan. No se elimina nada.
   Se puede ejecutar más de una vez sin problema.
   ============================================================ */
alter table public.player_club_levels add column if not exists hidden boolean not null default false;

create or replace function public.player_club_json(p_player bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p_player is null then null else jsonb_build_object(
    'playerId', p_player,
    'name', (select label from players where id = p_player),
    'ranking', (select ranking from player_club_rankings where player_id = p_player),
    'rows', coalesce((select jsonb_agg(jsonb_build_array(to_char(played_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), won, level)
                       order by played_at) from player_club_levels where player_id = p_player and not hidden), '[]'::jsonb)) end
$$;

/* p_to: hasta dónde llega el texto pegado (incluidas las líneas de corrección), para ocultar
   también los apuntes erróneos posteriores al último partido. */
create or replace function public.import_player_club(p_player bigint, p_ranking int, p_rows jsonb, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_add int; n_upd int; n_hid int; n_tot int; v_from timestamptz; v_to timestamptz;
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
  create temporary table if not exists tmp_club_rows (at timestamptz primary key, won boolean, level numeric) on commit drop;
  truncate tmp_club_rows;
  insert into tmp_club_rows
    select distinct on ((r->>0)::timestamptz) (r->>0)::timestamptz, (r->>1)::boolean, (r->>2)::numeric
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r;
  select min(at), greatest(max(at), p_to) into v_from, v_to from tmp_club_rows;

  select count(*) filter (where p.played_at is null),
         count(*) filter (where p.played_at is not null and (p.won is distinct from x.won or p.level is distinct from x.level or p.hidden))
    into n_add, n_upd
    from tmp_club_rows x left join player_club_levels p on p.player_id = p_player and p.played_at = x.at;

  insert into player_club_levels (player_id, played_at, won, level, hidden)
    select p_player, at, won, level, false from tmp_club_rows
    on conflict (player_id, played_at) do update set won = excluded.won, level = excluded.level, hidden = false, updated_at = now()
      where player_club_levels.won is distinct from excluded.won or player_club_levels.level is distinct from excluded.level
         or player_club_levels.hidden;

  /* Lo guardado entre la primera y la última fecha pegadas que ya no está: era un apunte erróneo. */
  update player_club_levels p set hidden = true, updated_at = now()
    where p.player_id = p_player and not p.hidden and v_from is not null
      and p.played_at between v_from and v_to
      and not exists (select 1 from tmp_club_rows x where x.at = p.played_at);
  get diagnostics n_hid = row_count;

  select count(*) into n_tot from player_club_levels where player_id = p_player and not hidden;
  return jsonb_build_object('added', n_add, 'updated', n_upd, 'hidden', n_hid, 'total', n_tot, 'playerId', p_player);
end $$;

/* Las de siempre siguen valiendo (sin p_to) y hay versiones con p_to para la app nueva. */
create or replace function public.import_player_club(p_player bigint, p_ranking int, p_rows jsonb)
returns jsonb language sql security definer set search_path = public as $$
  select public.import_player_club(p_player, p_ranking, p_rows, null::timestamptz)
$$;

create or replace function public.import_player_club_by_label(p_label text, p_ranking int, p_rows jsonb, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  select id into v_id from players where label = p_label;
  if v_id is null then raise exception 'No encuentro a «%» en la liga.', p_label; end if;
  return public.import_player_club(v_id, p_ranking, p_rows, p_to);
end $$;

create or replace function public.import_club_levels(p_who text, p_ranking int, p_name text, p_rows jsonb, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me bigint := public.my_player_id(); v_target bigint;
begin
  if v_me is null then raise exception 'Primero dinos quién eres en Mi perfil.'; end if;
  v_target := case when p_who = 'me' then v_me
                   when p_who like 'partner:%' then public.partner_of(v_me, substr(p_who, 9)) end;
  if v_target is null then raise exception 'No encuentro a tu pareja en esa competición.'; end if;
  return public.import_player_club(v_target, p_ranking, p_rows, p_to);
end $$;

revoke execute on function public.player_club_json(bigint), public.import_player_club(bigint, int, jsonb),
  public.import_player_club(bigint, int, jsonb, timestamptz), public.import_player_club_by_label(text, int, jsonb, timestamptz),
  public.import_club_levels(text, int, text, jsonb, timestamptz) from public, anon;
grant execute on function public.import_player_club_by_label(text, int, jsonb, timestamptz),
  public.import_club_levels(text, int, text, jsonb, timestamptz) to authenticated;
