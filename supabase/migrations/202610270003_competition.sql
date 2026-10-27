-- Phase IV. Apply once AFTER both existing migrations. No deployment changes.
begin;
lock table public.quiz_rooms in share row exclusive mode;

create table public.quiz_teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.quiz_rooms(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 32),
  score integer not null default 0 check (score between -1000000000 and 1000000000),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index quiz_teams_active_name on public.quiz_teams(room_id, lower(btrim(name))) where archived_at is null;
create index quiz_teams_room on public.quiz_teams(room_id);
alter table public.quiz_players add column team_id uuid references public.quiz_teams(id);
alter table public.quiz_players add column requested_team_name text;
alter table public.quiz_buzzer add column winning_team_id uuid references public.quiz_teams(id);

-- Preserve old names/assignments and the frozen team of an existing buzz.
insert into public.quiz_teams(room_id, name)
select distinct on (room_id, lower(btrim(name))) room_id, btrim(name) from (
  select room_id, team_name as name from public.quiz_players
  union all select room_id, winning_team from public.quiz_buzzer where winning_team is not null
) names order by room_id, lower(btrim(name)), name;
update public.quiz_players p set team_id = t.id, requested_team_name = p.team_name
  from public.quiz_teams t where t.room_id = p.room_id and lower(t.name) = lower(btrim(p.team_name));
update public.quiz_buzzer b set winning_team_id = t.id from public.quiz_teams t
  where t.room_id = b.room_id and lower(t.name) = lower(btrim(b.winning_team));

create table public.quiz_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.quiz_rooms(id) on delete cascade,
  match_number integer not null check (match_number > 0),
  status text not null default 'active' check (status in ('active', 'ended')),
  round_number integer not null default 1 check (round_number > 0),
  question_number integer not null default 0 check (question_number >= 0),
  questions_completed integer not null default 0 check (questions_completed >= 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  final_results jsonb,
  unique (room_id, match_number),
  check ((status = 'active' and ended_at is null and final_results is null)
    or (status = 'ended' and ended_at is not null and final_results is not null))
);
create table public.quiz_competition (
  room_id uuid primary key references public.quiz_rooms(id) on delete cascade,
  current_match_id uuid not null references public.quiz_matches(id),
  revision bigint not null default 0 check (revision >= 0),
  scoring_shortcuts integer[] not null default array[10,5,-5],
  check (cardinality(scoring_shortcuts) = 3 and array_position(scoring_shortcuts, null) is null
    and scoring_shortcuts[1] between -10000 and 10000 and scoring_shortcuts[1] <> 0
    and scoring_shortcuts[2] between -10000 and 10000 and scoring_shortcuts[2] <> 0
    and scoring_shortcuts[3] between -10000 and 10000 and scoring_shortcuts[3] <> 0)
);
create table quiz_private.competition_requests (
  room_id uuid not null references public.quiz_rooms(id) on delete cascade,
  request_id uuid not null,
  match_id uuid not null,
  action text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (room_id, request_id)
);

alter table public.quiz_teams enable row level security;
alter table public.quiz_matches enable row level security;
alter table public.quiz_competition enable row level security;
alter table quiz_private.competition_requests enable row level security;
revoke all on public.quiz_teams, public.quiz_matches, public.quiz_competition from public, anon, authenticated;
revoke all on quiz_private.competition_requests from public, anon, authenticated;
grant select on public.quiz_teams, public.quiz_matches, public.quiz_competition to authenticated;
create policy teams_members_read on public.quiz_teams for select to authenticated using (quiz_private.has_room_access(room_id));
create policy matches_members_read on public.quiz_matches for select to authenticated using (quiz_private.has_room_access(room_id));
create policy competition_members_read on public.quiz_competition for select to authenticated using (quiz_private.has_room_access(room_id));

create function quiz_private.create_competition(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_match uuid;
begin
  if not exists (select 1 from public.quiz_teams where room_id = p_room_id) then
    insert into public.quiz_teams(room_id, name) values (p_room_id, 'Blue'), (p_room_id, 'Gold');
  end if;
  insert into public.quiz_matches(room_id, match_number, question_number)
    select p_room_id, 1, case when round_number > 0 then 1 else 0 end from public.quiz_buzzer where room_id = p_room_id
    returning id into v_match;
  insert into public.quiz_competition(room_id, current_match_id) values (p_room_id, v_match);
end;
$$;
create function quiz_private.initialize_competition() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform quiz_private.create_competition(new.id); return new; end;
$$;
revoke all on function quiz_private.create_competition(uuid), quiz_private.initialize_competition() from public, anon, authenticated;
create trigger initialize_quiz_competition after insert on public.quiz_rooms
  for each row execute function quiz_private.initialize_competition();
do $$ declare r record; begin
  for r in select id from public.quiz_rooms loop perform quiz_private.create_competition(r.id); end loop;
end $$;

-- Capture the team ID at acceptance, without changing Phase III arbitration.
create function quiz_private.capture_winning_team() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.winning_player_id is null then new.winning_team_id := null;
  elsif old.status <> 'locked' or old.winning_player_id is distinct from new.winning_player_id then
    select team_id into new.winning_team_id from public.quiz_players where id = new.winning_player_id and room_id = new.room_id;
  end if;
  return new;
end;
$$;
revoke all on function quiz_private.capture_winning_team() from public, anon, authenticated;
create trigger capture_quiz_winning_team before update on public.quiz_buzzer
  for each row execute function quiz_private.capture_winning_team();

-- Retain the tested Phase III functions unchanged behind narrow wrappers.
alter function public.submit_quiz_buzz(uuid, uuid) set schema quiz_private;
alter function quiz_private.submit_quiz_buzz(uuid, uuid) rename to submit_buzz_v3;
alter function public.control_quiz_buzzer(uuid, text, uuid, text) set schema quiz_private;
alter function quiz_private.control_quiz_buzzer(uuid, text, uuid, text) rename to control_buzzer_v3;
revoke all on function quiz_private.submit_buzz_v3(uuid, uuid), quiz_private.control_buzzer_v3(uuid, text, uuid, text) from public, anon, authenticated;

create function public.submit_quiz_buzz(p_room_id uuid, p_round_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_state public.quiz_buzzer; v_status text;
begin
  if not exists (select 1 from public.quiz_players where room_id = p_room_id and user_id = auth.uid()) then
    raise exception 'NOT_A_MEMBER' using errcode = '42501'; end if;
  select * into v_state from public.quiz_buzzer where room_id = p_room_id for update;
  select m.status into v_status from public.quiz_competition c join public.quiz_matches m on m.id = c.current_match_id where c.room_id = p_room_id;
  if v_status = 'ended' then return jsonb_build_object('accepted', false, 'reason', 'match_ended', 'buzzer', to_jsonb(v_state)); end if;
  if v_status is null then raise exception 'COMPETITION_MIGRATION_REQUIRED'; end if;
  return quiz_private.submit_buzz_v3(p_room_id, p_round_id);
end;
$$;
create function public.control_quiz_buzzer(p_room_id uuid, p_host_token text, p_expected_round uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_match public.quiz_matches; v_result jsonb;
begin
  perform quiz_private.assert_host(p_room_id, p_host_token);
  perform 1 from public.quiz_buzzer where room_id = p_room_id for update;
  select m.* into v_match from public.quiz_competition c join public.quiz_matches m on m.id = c.current_match_id where c.room_id = p_room_id;
  if v_match.status = 'ended' then raise exception 'MATCH_ENDED'; end if;
  v_result := quiz_private.control_buzzer_v3(p_room_id, p_host_token, p_expected_round, p_action);
  if p_action in ('start', 'reset') and v_match.question_number = 0 then
    update public.quiz_matches set question_number = 1 where id = v_match.id;
  end if;
  update public.quiz_competition set revision = revision + 1 where room_id = p_room_id;
  return v_result;
end;
$$;

-- Rejoining never overwrites a host assignment. p_team is only a preference.
create or replace function public.join_quiz_room(p_code text, p_name text, p_team text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_room public.quiz_rooms; v_player public.quiz_players; v_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_code is null or upper(btrim(p_code)) !~ '^[A-Z2-9]{6}$'
    or p_name is null or char_length(btrim(p_name)) not between 1 and 40
    or p_team is null or char_length(btrim(p_team)) not between 1 and 32 then raise exception 'INVALID_INPUT'; end if;
  select * into v_room from public.quiz_rooms where code = upper(btrim(p_code));
  if not found then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002'; end if;
  -- All compound writes use buzzer -> room/competition -> player/team order.
  perform 1 from public.quiz_buzzer where room_id = v_room.id for update;
  select * into v_room from public.quiz_rooms where id = v_room.id for update;
  select * into v_player from public.quiz_players where room_id = v_room.id and user_id = auth.uid();
  select m.status into v_status from public.quiz_competition c join public.quiz_matches m on m.id = c.current_match_id where c.room_id = v_room.id;
  if v_player.id is null then
    if v_status <> 'active' then raise exception 'MATCH_ENDED'; end if;
    if not v_room.accepting_players then raise exception 'ROOM_CLOSED'; end if;
    insert into public.quiz_players(room_id, user_id, display_name, team_name, requested_team_name)
      values (v_room.id, auth.uid(), btrim(p_name), 'Unassigned', btrim(p_team)) returning * into v_player;
  else
    update public.quiz_players set display_name = btrim(p_name), last_seen_at = now()
      where id = v_player.id returning * into v_player;
  end if;
  update public.quiz_competition set revision = revision + 1 where room_id = v_room.id;
  return jsonb_build_object('room', to_jsonb(v_room), 'player', to_jsonb(v_player) - 'user_id');
end;
$$;

create or replace function public.get_quiz_room(p_room_id uuid, p_host_token text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_room public.quiz_rooms; v_players jsonb; v_buzzer public.quiz_buzzer;
  v_comp public.quiz_competition; v_match public.quiz_matches; v_teams jsonb; v_history jsonb;
begin
  if not quiz_private.has_room_access(p_room_id) then raise exception 'NOT_A_MEMBER' using errcode = '42501'; end if;
  if p_host_token is not null then perform quiz_private.assert_host(p_room_id, p_host_token); end if;
  select * into v_room from public.quiz_rooms where id = p_room_id;
  select coalesce(jsonb_agg(to_jsonb(p) - 'user_id' order by p.created_at, p.id), '[]'::jsonb)
    into v_players from public.quiz_players p where p.room_id = p_room_id;
  select * into v_buzzer from public.quiz_buzzer where room_id = p_room_id;
  select * into v_comp from public.quiz_competition where room_id = p_room_id;
  select * into v_match from public.quiz_matches where id = v_comp.current_match_id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.score desc, t.name, t.id), '[]'::jsonb)
    into v_teams from public.quiz_teams t where t.room_id = p_room_id and t.archived_at is null;
  select coalesce(jsonb_agg(to_jsonb(h) order by h.match_number desc), '[]'::jsonb) into v_history
    from (select * from public.quiz_matches where room_id = p_room_id and status = 'ended' order by match_number desc limit 10) h;
  return jsonb_build_object('room', to_jsonb(v_room), 'players', v_players, 'buzzer', to_jsonb(v_buzzer),
    'competition', to_jsonb(v_comp), 'match', to_jsonb(v_match), 'teams', v_teams, 'history', v_history,
    'server_time', now(), 'is_host', p_host_token is not null);
end;
$$;

create function public.manage_quiz_competition(
  p_room_id uuid, p_host_token text, p_match_id uuid, p_request_id uuid,
  p_action text, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_comp public.quiz_competition; v_match public.quiz_matches; v_buzzer public.quiz_buzzer;
  v_request quiz_private.competition_requests; v_team public.quiz_teams; v_id uuid; v_name text;
  v_delta numeric; v_results jsonb; v_shortcuts integer[];
begin
  perform quiz_private.assert_host(p_room_id, p_host_token);
  if p_request_id is null or p_match_id is null or p_action is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'INVALID_COMPETITION_INPUT'; end if;
  select * into v_buzzer from public.quiz_buzzer where room_id = p_room_id for update;
  select * into v_comp from public.quiz_competition where room_id = p_room_id;
  if not found then raise exception 'COMPETITION_MIGRATION_REQUIRED'; end if;
  select * into v_request from quiz_private.competition_requests where room_id = p_room_id and request_id = p_request_id;
  if found then
    if v_request.match_id <> p_match_id or v_request.action <> p_action or v_request.payload <> p_payload then raise exception 'REQUEST_CONFLICT'; end if;
    return public.get_quiz_room(p_room_id, p_host_token);
  end if;
  if v_comp.current_match_id <> p_match_id then raise exception 'STALE_MATCH'; end if;
  select * into v_match from public.quiz_matches where id = v_comp.current_match_id;
  if p_action = 'new_match' then
    if v_match.status <> 'ended' then raise exception 'MATCH_STILL_ACTIVE'; end if;
    insert into public.quiz_matches(room_id, match_number) values (p_room_id, v_match.match_number + 1) returning id into v_id;
    update public.quiz_teams set score = 0 where room_id = p_room_id;
    update public.quiz_competition set current_match_id = v_id where room_id = p_room_id;
    update public.quiz_rooms set accepting_players = true where id = p_room_id;
    update public.quiz_buzzer set round_id = gen_random_uuid(), round_number = 0, revision = revision + 1,
      status = 'paused', winning_player_id = null, winning_at = null, winning_name = null, winning_team = null where room_id = p_room_id;
  else
    if v_match.status <> 'active' then raise exception 'MATCH_ENDED'; end if;
    if p_action in ('create_team', 'rename_team') then
      v_name := btrim(p_payload->>'name');
      if v_name is null or char_length(v_name) not between 1 and 32 then raise exception 'INVALID_TEAM_NAME'; end if;
      if p_action = 'create_team' then insert into public.quiz_teams(room_id, name) values (p_room_id, v_name);
      else
        update public.quiz_teams set name = v_name where id = (p_payload->>'team_id')::uuid and room_id = p_room_id and archived_at is null returning id into v_id;
        if not found then raise exception 'TEAM_NOT_FOUND'; end if;
        update public.quiz_players set team_name = v_name where team_id = v_id and room_id = p_room_id;
      end if;
    elsif p_action = 'assign_player' then
      v_id := (p_payload->>'team_id')::uuid;
      v_name := 'Unassigned';
      if v_id is not null then
        select name into v_name from public.quiz_teams where id = v_id and room_id = p_room_id and archived_at is null;
        if not found then raise exception 'TEAM_NOT_FOUND'; end if;
      end if;
      update public.quiz_players set team_id = v_id, team_name = v_name where id = (p_payload->>'player_id')::uuid and room_id = p_room_id;
      if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
    elsif p_action = 'remove_team' then
      select * into v_team from public.quiz_teams where id = (p_payload->>'team_id')::uuid and room_id = p_room_id and archived_at is null;
      if not found then raise exception 'TEAM_NOT_FOUND'; end if;
      if exists (select 1 from public.quiz_players where team_id = v_team.id and room_id = p_room_id) then raise exception 'TEAM_NOT_EMPTY'; end if;
      if v_team.score <> 0 then raise exception 'TEAM_HAS_SCORE'; end if;
      update public.quiz_teams set archived_at = now() where id = v_team.id;
    elsif p_action = 'score' then
      if jsonb_typeof(p_payload->'delta') is distinct from 'number' then raise exception 'INVALID_SCORE'; end if;
      v_delta := (p_payload->>'delta')::numeric;
      if v_delta <> trunc(v_delta) or v_delta = 0 or abs(v_delta) > 10000 then raise exception 'INVALID_SCORE'; end if;
      select * into v_team from public.quiz_teams where id = (p_payload->>'team_id')::uuid and room_id = p_room_id and archived_at is null;
      if not found then raise exception 'TEAM_NOT_FOUND'; end if;
      if abs(v_team.score::bigint + v_delta) > 1000000000 then raise exception 'SCORE_LIMIT'; end if;
      update public.quiz_teams set score = score + v_delta::integer where id = v_team.id;
    elsif p_action = 'set_shortcuts' then
      if jsonb_typeof(p_payload->'values') is distinct from 'array' or jsonb_array_length(p_payload->'values') <> 3 then raise exception 'INVALID_SCORE'; end if;
      if exists (select 1 from jsonb_array_elements(p_payload->'values') e where jsonb_typeof(e) <> 'number' or e::text !~ '^-?[0-9]+$' or abs((e::text)::numeric) not between 1 and 10000) then raise exception 'INVALID_SCORE'; end if;
      select array_agg((e::text)::integer order by n) into v_shortcuts from jsonb_array_elements(p_payload->'values') with ordinality x(e,n);
      update public.quiz_competition set scoring_shortcuts = v_shortcuts where room_id = p_room_id;
    elsif p_action in ('next_question', 'next_round') then
      if (p_payload->>'expected_round_id')::uuid is distinct from v_buzzer.round_id then raise exception 'STALE_ROUND'; end if;
      update public.quiz_matches set questions_completed = questions_completed + case when question_number > 0 then 1 else 0 end,
        question_number = case when p_action = 'next_round' then 1 else question_number + 1 end,
        round_number = round_number + case when p_action = 'next_round' then 1 else 0 end where id = v_match.id;
      perform quiz_private.control_buzzer_v3(p_room_id, p_host_token, v_buzzer.round_id, 'reset');
    elsif p_action = 'end_match' then
      select coalesce(jsonb_agg(jsonb_build_object('team_id', id, 'name', name, 'score', score, 'rank', position) order by position, name, id), '[]'::jsonb) into v_results
        from (select id, name, score, rank() over (order by score desc) as position from public.quiz_teams where room_id = p_room_id and archived_at is null) ranked;
      update public.quiz_matches set status = 'ended', ended_at = clock_timestamp(), final_results = v_results,
        questions_completed = questions_completed + case when question_number > 0 then 1 else 0 end where id = v_match.id;
      update public.quiz_rooms set accepting_players = false where id = p_room_id;
      update public.quiz_buzzer set round_id = gen_random_uuid(), revision = revision + 1,
        status = case when winning_player_id is null then 'paused' else 'locked' end where room_id = p_room_id;
    else raise exception 'INVALID_COMPETITION_ACTION'; end if;
  end if;
  update public.quiz_competition set revision = revision + 1 where room_id = p_room_id;
  insert into quiz_private.competition_requests(room_id, request_id, match_id, action, payload)
    values (p_room_id, p_request_id, p_match_id, p_action, p_payload);
  return public.get_quiz_room(p_room_id, p_host_token);
exception
  when unique_violation then raise exception 'TEAM_NAME_TAKEN';
  when invalid_text_representation or numeric_value_out_of_range then raise exception 'INVALID_COMPETITION_INPUT';
end;
$$;

revoke all on function public.submit_quiz_buzz(uuid, uuid), public.control_quiz_buzzer(uuid, text, uuid, text),
  public.join_quiz_room(text,text,text), public.get_quiz_room(uuid,text),
  public.manage_quiz_competition(uuid,text,uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.submit_quiz_buzz(uuid, uuid), public.control_quiz_buzzer(uuid, text, uuid, text),
  public.join_quiz_room(text,text,text), public.get_quiz_room(uuid,text),
  public.manage_quiz_competition(uuid,text,uuid,uuid,text,jsonb) to authenticated;
do $$ declare t text; begin
  foreach t in array array['quiz_teams','quiz_matches','quiz_competition'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
commit;
