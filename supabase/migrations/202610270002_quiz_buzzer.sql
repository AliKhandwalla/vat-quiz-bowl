-- Phase III: server-authoritative buzzer state. Apply after Phase II.
-- "First" means the first valid attempt serialized/accepted by PostgreSQL,
-- not the first physical press or earliest browser/network timestamp.
begin;

create table public.quiz_buzzer (
  room_id uuid primary key references public.quiz_rooms(id) on delete cascade,
  round_id uuid not null default gen_random_uuid(),
  round_number integer not null default 0 check (round_number >= 0),
  revision bigint not null default 0 check (revision >= 0),
  status text not null default 'paused' check (status in ('ready', 'paused', 'locked')),
  winning_player_id uuid references public.quiz_players(id),
  winning_at timestamptz,
  -- Freeze the accepted identity so renaming/rejoining cannot rewrite a result.
  winning_name text,
  winning_team text,
  constraint winner_matches_status check (
    (status = 'locked' and winning_player_id is not null and winning_at is not null
      and winning_name is not null and winning_team is not null)
    or (status in ('ready', 'paused') and winning_player_id is null and winning_at is null
      and winning_name is null and winning_team is null)
  )
);
alter table public.quiz_buzzer enable row level security;
revoke all on public.quiz_buzzer from public, anon, authenticated;
grant select on public.quiz_buzzer to authenticated;
create policy buzzer_members_read on public.quiz_buzzer for select to authenticated
  using (quiz_private.has_room_access(room_id));

create function quiz_private.initialize_buzzer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.quiz_buzzer(room_id) values (new.id);
  return new;
end;
$$;
revoke all on function quiz_private.initialize_buzzer() from public, anon, authenticated;
create trigger initialize_quiz_buzzer after insert on public.quiz_rooms
  for each row execute function quiz_private.initialize_buzzer();
insert into public.quiz_buzzer(room_id) select id from public.quiz_rooms;

create or replace function public.get_quiz_room(p_room_id uuid, p_host_token text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_room public.quiz_rooms; v_players jsonb; v_buzzer public.quiz_buzzer;
begin
  if not quiz_private.has_room_access(p_room_id) then raise exception 'NOT_A_MEMBER' using errcode = '42501'; end if;
  if p_host_token is not null then perform quiz_private.assert_host(p_room_id, p_host_token); end if;
  select * into v_room from public.quiz_rooms where id = p_room_id;
  select coalesce(jsonb_agg(to_jsonb(p) - 'user_id' order by p.created_at, p.id), '[]'::jsonb)
    into v_players from public.quiz_players p where p.room_id = p_room_id;
  select * into v_buzzer from public.quiz_buzzer where room_id = p_room_id;
  return jsonb_build_object('room', to_jsonb(v_room), 'players', v_players,
    'buzzer', to_jsonb(v_buzzer), 'server_time', now(), 'is_host', p_host_token is not null);
end;
$$;

-- All host actions compare the round the host was actually viewing. A retry
-- after a lost response cannot accidentally advance/reset a second round.
-- start/reset: new UUID, increment round number, ready, clear winner.
-- pause: same UUID and round number, ready -> paused; no winner is erased.
-- Starting from paused intentionally creates a NEW round, never resumes an ID.
create function public.control_quiz_buzzer(
  p_room_id uuid, p_host_token text, p_expected_round uuid, p_action text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_state public.quiz_buzzer;
begin
  perform quiz_private.assert_host(p_room_id, p_host_token);
  if p_action is null or p_action not in ('start', 'pause', 'reset') then
    raise exception 'INVALID_BUZZER_ACTION' using errcode = '22023';
  end if;
  select * into v_state from public.quiz_buzzer where room_id = p_room_id for update;
  if not found then raise exception 'BUZZER_MIGRATION_REQUIRED'; end if;
  if p_expected_round is distinct from v_state.round_id then raise exception 'STALE_ROUND'; end if;
  if p_action = 'pause' then
    if v_state.status = 'locked' then raise exception 'ROUND_LOCKED'; end if;
    if v_state.status = 'paused' then return to_jsonb(v_state); end if;
    update public.quiz_buzzer set status = 'paused', revision = revision + 1
      where room_id = p_room_id returning * into v_state;
  else
    update public.quiz_buzzer set
      round_id = gen_random_uuid(), round_number = round_number + 1,
      status = 'ready', revision = revision + 1,
      winning_player_id = null, winning_at = null, winning_name = null, winning_team = null
      where room_id = p_room_id returning * into v_state;
  end if;
  return to_jsonb(v_state);
end;
$$;

-- No player ID, winner identity, or timestamp is accepted from the client.
-- The row lock serializes buzzes against each other AND against host actions.
-- Expected rejections return the current state so even a losing/stale client
-- can synchronize immediately without waiting for a websocket notification.
create function public.submit_quiz_buzz(p_room_id uuid, p_round_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_player public.quiz_players; v_state public.quiz_buzzer; v_reason text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_player from public.quiz_players where room_id = p_room_id and user_id = auth.uid();
  if not found then raise exception 'NOT_A_MEMBER' using errcode = '42501'; end if;
  select * into v_state from public.quiz_buzzer where room_id = p_room_id for update;
  if not found then raise exception 'BUZZER_MIGRATION_REQUIRED'; end if;
  if p_round_id is distinct from v_state.round_id then v_reason := 'stale_round';
  elsif v_state.status = 'paused' then v_reason := 'paused';
  elsif v_state.status = 'locked' then
    v_reason := case when v_state.winning_player_id = v_player.id then 'duplicate' else 'locked' end;
  else
    update public.quiz_buzzer set status = 'locked', revision = revision + 1,
      winning_player_id = v_player.id, winning_at = clock_timestamp(),
      winning_name = v_player.display_name, winning_team = v_player.team_name
      where room_id = p_room_id returning * into v_state;
    return jsonb_build_object('accepted', true, 'reason', 'accepted', 'buzzer', to_jsonb(v_state));
  end if;
  return jsonb_build_object('accepted', false, 'reason', v_reason, 'buzzer', to_jsonb(v_state));
end;
$$;

revoke all on function public.get_quiz_room(uuid, text) from public, anon, authenticated;
revoke all on function public.control_quiz_buzzer(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.submit_quiz_buzz(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_quiz_room(uuid, text),
  public.control_quiz_buzzer(uuid, text, uuid, text), public.submit_quiz_buzz(uuid, uuid) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quiz_buzzer') then
    alter publication supabase_realtime add table public.quiz_buzzer;
  end if;
end $$;
commit;
