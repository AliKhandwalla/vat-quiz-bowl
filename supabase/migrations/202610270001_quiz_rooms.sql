-- Phase II only: lobby membership, host permissions, and liveness.
-- No buzzer arbitration or scoring state is stored or synchronized.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists quiz_private;
revoke all on schema quiz_private from public, anon, authenticated;

create table public.quiz_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  accepting_players boolean not null default true,
  created_at timestamptz not null default now(),
  host_last_seen_at timestamptz not null default now()
);
create table quiz_private.host_credentials (
  room_id uuid primary key references public.quiz_rooms(id) on delete cascade,
  host_user_id uuid not null references auth.users(id),
  request_id uuid not null unique,
  token_hash bytea not null
);
create index host_credentials_user_idx on quiz_private.host_credentials(host_user_id);
create table public.quiz_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.quiz_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  team_name text not null check (char_length(btrim(team_name)) between 1 and 32),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, user_id)
);
create index quiz_players_room_order_idx on public.quiz_players(room_id, created_at, id);
alter table public.quiz_rooms enable row level security;
alter table public.quiz_players enable row level security;
alter table quiz_private.host_credentials enable row level security;
revoke all on public.quiz_rooms, public.quiz_players from public, anon, authenticated;
revoke all on quiz_private.host_credentials from public, anon, authenticated;
grant select on public.quiz_rooms, public.quiz_players to authenticated;

-- Definer helpers avoid recursive RLS, and expose neither credentials nor a
-- writable membership surface. Every relation has a fully qualified name.
create function quiz_private.has_room_access(p_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from quiz_private.host_credentials where room_id = p_room_id and host_user_id = auth.uid())
    or exists (select 1 from public.quiz_players where room_id = p_room_id and user_id = auth.uid())
  );
$$;
create function quiz_private.assert_host(p_room_id uuid, p_host_token text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_host_token is null or not exists (
    select 1 from quiz_private.host_credentials
    where room_id = p_room_id and host_user_id = auth.uid()
      and token_hash = extensions.digest(p_host_token, 'sha256')
  ) then raise exception 'HOST_UNAUTHORIZED' using errcode = '42501'; end if;
end;
$$;
revoke all on function quiz_private.has_room_access(uuid) from public, anon, authenticated;
revoke all on function quiz_private.assert_host(uuid, text) from public, anon, authenticated;
grant usage on schema quiz_private to authenticated;
grant execute on function quiz_private.has_room_access(uuid) to authenticated;
create policy room_members_read on public.quiz_rooms for select to authenticated
  using (quiz_private.has_room_access(id));
create policy roster_members_read on public.quiz_players for select to authenticated
  using (quiz_private.has_room_access(room_id));

create function public.create_quiz_room(p_request_id uuid, p_host_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room public.quiz_rooms;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_random bytea;
  v_code text;
  v_attempt integer;
  v_index integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_request_id is null or p_host_token is null or p_host_token !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  -- Concurrent/retried creates with the same request cannot create two rooms.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select r.* into v_room from public.quiz_rooms r
    join quiz_private.host_credentials c on c.room_id = r.id where c.request_id = p_request_id;
  if found then
    perform quiz_private.assert_host(v_room.id, p_host_token);
    return to_jsonb(v_room);
  end if;
  for v_attempt in 1..10 loop
    v_random := extensions.gen_random_bytes(6);
    v_code := '';
    for v_index in 0..5 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_random, v_index) % 32) + 1, 1);
    end loop;
    insert into public.quiz_rooms(code) values (v_code)
      on conflict (code) do nothing returning * into v_room;
    exit when found;
  end loop;
  if v_room.id is null then raise exception 'ROOM_CREATION_FAILED'; end if;
  insert into quiz_private.host_credentials(room_id, host_user_id, request_id, token_hash)
    values (v_room.id, auth.uid(), p_request_id, extensions.digest(p_host_token, 'sha256'));
  return to_jsonb(v_room);
end;
$$;

create function public.join_quiz_room(p_code text, p_name text, p_team text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_room public.quiz_rooms; v_player public.quiz_players;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_code is null or upper(btrim(p_code)) !~ '^[A-Z2-9]{6}$'
    or p_name is null or char_length(btrim(p_name)) not between 1 and 40
    or p_team is null or char_length(btrim(p_team)) not between 1 and 32 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  select * into v_room from public.quiz_rooms where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002'; end if;
  -- Existing members can resume even after the host closes new registrations.
  if not v_room.accepting_players and not exists (
    select 1 from public.quiz_players where room_id = v_room.id and user_id = auth.uid()
  ) then raise exception 'ROOM_CLOSED'; end if;
  insert into public.quiz_players(room_id, user_id, display_name, team_name)
    values (v_room.id, auth.uid(), btrim(p_name), btrim(p_team))
    on conflict (room_id, user_id) do update
      set display_name = excluded.display_name, team_name = excluded.team_name, last_seen_at = now()
    returning * into v_player;
  return jsonb_build_object('room', to_jsonb(v_room), 'player', to_jsonb(v_player) - 'user_id');
end;
$$;

create function public.get_quiz_room(p_room_id uuid, p_host_token text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_room public.quiz_rooms; v_players jsonb;
begin
  if not quiz_private.has_room_access(p_room_id) then raise exception 'NOT_A_MEMBER' using errcode = '42501'; end if;
  if p_host_token is not null then perform quiz_private.assert_host(p_room_id, p_host_token); end if;
  select * into v_room from public.quiz_rooms where id = p_room_id;
  select coalesce(jsonb_agg(to_jsonb(p) - 'user_id' order by p.created_at, p.id), '[]'::jsonb)
    into v_players from public.quiz_players p where p.room_id = p_room_id;
  return jsonb_build_object('room', to_jsonb(v_room), 'players', v_players,
    'server_time', now(), 'is_host', p_host_token is not null);
end;
$$;

create function public.quiz_room_heartbeat(p_room_id uuid, p_host_token text default null)
returns timestamptz language plpgsql security definer set search_path = '' as $$
begin
  if p_host_token is not null then
    perform quiz_private.assert_host(p_room_id, p_host_token);
    update public.quiz_rooms set host_last_seen_at = now() where id = p_room_id;
  else
    update public.quiz_players set last_seen_at = now() where room_id = p_room_id and user_id = auth.uid();
    if not found then raise exception 'NOT_A_MEMBER' using errcode = '42501'; end if;
  end if;
  return now();
end;
$$;

-- This lobby-only operation proves host authorization without implementing
-- Phase III round control, buzzer arbitration, or synchronized scoring.
create function public.set_quiz_room_joining(p_room_id uuid, p_host_token text, p_accepting boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_room public.quiz_rooms;
begin
  perform quiz_private.assert_host(p_room_id, p_host_token);
  if p_accepting is null then raise exception 'INVALID_INPUT'; end if;
  update public.quiz_rooms set accepting_players = p_accepting where id = p_room_id returning * into v_room;
  return to_jsonb(v_room);
end;
$$;

revoke all on function public.create_quiz_room(uuid, text) from public, anon, authenticated;
revoke all on function public.join_quiz_room(text, text, text) from public, anon, authenticated;
revoke all on function public.get_quiz_room(uuid, text) from public, anon, authenticated;
revoke all on function public.quiz_room_heartbeat(uuid, text) from public, anon, authenticated;
revoke all on function public.set_quiz_room_joining(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.create_quiz_room(uuid, text), public.join_quiz_room(text, text, text),
  public.get_quiz_room(uuid, text), public.quiz_room_heartbeat(uuid, text),
  public.set_quiz_room_joining(uuid, text, boolean) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quiz_rooms') then
    alter publication supabase_realtime add table public.quiz_rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quiz_players') then
    alter publication supabase_realtime add table public.quiz_players;
  end if;
end $$;
commit;
