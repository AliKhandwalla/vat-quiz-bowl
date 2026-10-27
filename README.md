# VAT Quiz Bowl — Phase II

The existing React, TypeScript, Vite, Tailwind CSS, and Lucide interface now supports persistent Supabase rooms and players, secure guest/host sessions, and live roster and lobby updates.

## Setup

1. Run `npm install` using Node.js 22 or newer.
2. Copy `.env.example` to `.env.local`. Enter your Supabase project URL and **publishable key** (or legacy **anon** key). No service-role key or database password is needed by the application.
3. In Supabase **Authentication → Sign In / Providers**, enable **Anonymous Sign-Ins**. These provide signed guest identities without a sign-in form; guests use the `authenticated` PostgreSQL role.
4. Run all of `supabase/migrations/202610270001_quiz_rooms.sql` once in the project's SQL Editor, or apply it through your linked Supabase CLI migration workflow. It transactionally creates tables, restricted RPCs, RLS policies, private host credentials, and Realtime publication entries. Do not rerun the raw SQL after it succeeds.
5. Keep `quiz_private` **out of the Data API's exposed schemas**. Only `public` needs to be exposed for the room RPCs. Ensure Realtime is enabled for `public.quiz_rooms` and `public.quiz_players`; the migration adds both to `supabase_realtime`.
6. Run `npm run dev` and open the printed localhost URL. Restart Vite after changing environment variables.

For the configured project, the browser-safe URL/key are saved in ignored `.env.local`. Anonymous sign-ins and the migration were applied during development. Do not commit `.env.local`.

`npm run build` runs TypeScript checks and produces the static production site in `dist/`. `npm run preview` serves that build locally. Set the same public environment variables in the deployment build environment. Use an HTTPS static host for students on other devices; sharing a localhost URL does not make the frontend accessible elsewhere. Database functions remain in Supabase. Navigation uses hash routes, so no server route rewrites are required.

## Live rooms

1. Click **Host a Game**. The server creates a room with a random six-character code. An existing active host session resumes its room.
2. In another browser, private window, independently opened tab, or device, open the frontend and enter the code, display name, and team name. Click **Join room**.
3. The host's connected-player list updates automatically. Custom team names are supported, and both sides receive lobby information.
4. The host can **Close joining** or **Reopen joining**, a real server-authorized operation. Existing members can reconnect while new joins are closed.
5. Refresh either dashboard: the saved tab session restores its room without adding another player. Display names are not credentials; distinct guests may use the same name.

Guest JWTs, refresh tokens, the active room, and the random 256-bit host credential use **sessionStorage**. Auth storage/channel keys are distinct per tab so independent tabs do not overwrite each other's guest tokens. Refresh preserves identity. The most recent host credential is retained separately if that tab temporarily joins as a player; Host a Game restores it after server verification. Closing the browser session, clearing its storage, or moving to another device requires a new identity. Browsers may clone session storage when duplicating a tab; use an independently opened tab or private browser for a distinct participant. Host credentials are never placed in room codes, URLs, localStorage, or player records. Losing the original host session does not confer host access to someone with the room code.

## Online status and recovery

- The active participant sends a server-authorized heartbeat every **20 seconds**. PostgreSQL supplies its timestamp; clients use the server clock offset when displaying status.
- A participant is online while its last heartbeat is younger than **75 seconds**. Offline player records are retained. A reliable unload/close event is not required.
- Returning to a sleeping mobile tab or reconnecting updates the same player's heartbeat. Background tabs may appear offline when the browser suspends their timers.
- Supabase Postgres Changes provides immediate roster and lobby notifications. The client waits for the actual database subscription to be ready before marking it connected, then fetches a fresh snapshot to repair the initial event gap.
- Periodic snapshots repair missed events while the websocket reconnects. Returning online, returning to a tab, and **Retry connection** trigger recovery. Live host changes are disabled while disconnected.
- The database uniqueness constraint on `(room_id, user_id)` makes simultaneous/retried joins idempotent. A saved creation request ID and transactional advisory lock make a lost room-creation response safe to retry.

## Authorization

The browser sends a publishable/anon key and its signed guest JWT. RLS limits room and roster reads to members and the owning host. Direct client inserts, updates, and deletes are revoked. Writes go through narrowly scoped PostgreSQL RPC functions with empty `search_path`, fully qualified relations, input validation, and explicit execute grants.

Host-only writes verify **both** `auth.uid()` and the SHA-256 hash of a random host credential in `quiz_private.host_credentials`. Ordinary players cannot change room permissions with the public code, even if they copy a host request. Private credential tables have RLS and no client table permissions. Definer helper functions cannot be called directly except the boolean membership predicate required by RLS. No service-role or privileged key is used or embedded. Vite refuses to build if a privileged or invalid key is supplied as the frontend Supabase key.

Guest identity and room membership are the only authentication mechanisms introduced in this phase. Rooms, players, and guest Auth records persist until administrator cleanup; the frontend has no deletion API. Supabase Auth limits apply to guest creation. Production operators can configure additional abuse protection and retention for the club's usage.

## Local previews retained from Phase I

**Buzzer presses, first-buzz selection, start/pause/next/reset controls, and scores remain in-memory demonstrations.** They are marked LOCAL DEMO/LOCAL and never written to Supabase. The live roster supplies displayed names and teams, but a simulated buzz is not an actual remote response. Refresh resets these previews. No synchronized round control, real buzzer arbitration, or synchronized scoring is implemented.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Existing homepage, navigation, host/player views; consumes live rooms and isolated demos. |
| `src/lib/supabase.ts` | Validated public configuration, one Supabase client, per-tab guest sessions, timeouts. |
| `src/rooms/api.ts` | Typed room RPC adapter and user-facing error mapping. |
| `src/rooms/useRoom.ts` | Subscriptions, snapshots, heartbeats, recovery, duplicate submission guard. |
| `src/rooms/storage.ts` | Session persistence and idempotent creation credentials. |
| `src/rooms/types.ts` | Live room/player types and liveness timing. |
| `src/demo.ts` | Local buzzer/score reducer; no backend writes. |
| `supabase/migrations/202610270001_quiz_rooms.sql` | PostgreSQL schema, authorization, operations, Realtime publication. |

## Verification

```sh
npm run build
npm run test:database
npm run test:integration
npm run test:integration -- --presence
```

`test:database` starts a disposable PostgreSQL cluster under `.test-db/`, executes the actual migration with Supabase Auth roles/claims bootstrapped, and checks permissions, codes, retries, joins, invalid inputs, host authorization, publication, and stale/reconnected records. It stops and removes only its test cluster. The database runtime is a development dependency; this test does not substitute for testing the Supabase Realtime service.

`test:integration` uses the configured, migrated Supabase project and Anonymous Sign-Ins. It creates three independent guest sessions with the public key, creates a test room, tests concurrent joins, verifies **actual Realtime events**, and checks isolation and host-only changes. `--presence` additionally waits 80 seconds without a player's heartbeat, verifies the offline record remains, then reconnects the same player ID. Test rooms close to new joins and test sessions sign out afterward. Room/player/Auth records remain for inspection; cleanup is an administrator task.

Manual browser check: open independent host/player sessions, create/join a room, observe the host roster without refreshing, toggle joining and observe the player lobby state, then reload both and confirm the same room and one player record. Try a wrong code, a player visiting the host route, and a phone viewport. Do not infer successful Realtime solely from polling updates.

References: [guest sessions](https://supabase.com/docs/guides/auth/auth-anonymous), [database functions](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).
