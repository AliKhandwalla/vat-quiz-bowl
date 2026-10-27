# VAT Quiz Bowl — Phase III

The existing React, TypeScript, Vite, Tailwind CSS, and Lucide interface now includes server-authoritative live buzzers, synchronized round controls, persistent rooms/players, and secure guest/host sessions. Scoring remains a local preview; no Phase IV scoring or tournament features are implemented.

## Setup

1. Run `npm install` using Node.js 22 or newer.
2. Copy `.env.example` to `.env.local`. Enter your Supabase project URL and **publishable key** (or legacy **anon** key). No service-role key or database password is needed by the application.
3. In Supabase **Authentication → Sign In / Providers**, enable **Anonymous Sign-Ins**. These provide signed guest identities without a sign-in form; guests use the `authenticated` PostgreSQL role.
4. For a **new project**, run `supabase/migrations/202610270001_quiz_rooms.sql` followed by `supabase/migrations/202610270002_quiz_buzzer.sql` in the SQL Editor. For an **existing Phase II project**, run only the new `202610270002_quiz_buzzer.sql` file. Copy and execute the **entire file**, including `begin` and `commit`. Alternatively use your linked Supabase CLI migration workflow. Do not rerun an already applied raw migration. These files contain the exact SQL; there are no placeholder secrets or additional privileged API endpoints to deploy.
5. Keep `quiz_private` **out of the Data API's exposed schemas**. Only `public` needs to be exposed. Ensure Realtime is enabled for `public.quiz_rooms`, `public.quiz_players`, and `public.quiz_buzzer`; the migrations add all three to `supabase_realtime`.
6. Run `npm run dev` and open the printed localhost URL. Restart Vite after changing environment variables.

For the configured project, the browser-safe URL/key are saved in ignored `.env.local`. Anonymous sign-ins and both migrations were applied during development. Do not commit `.env.local`.

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
- Periodic snapshots repair missed events while the websocket reconnects. Returning online, returning to a tab, and **Retry connection** trigger recovery. Live host changes and buzz submissions are disabled while disconnected. After subscription recovery, a new authoritative snapshot must complete before buzzing is enabled.
- The database uniqueness constraint on `(room_id, user_id)` makes simultaneous/retried joins idempotent. A saved creation request ID and transactional advisory lock make a lost room-creation response safe to retry.

## Authorization

The browser sends a publishable/anon key and its signed guest JWT. RLS limits room and roster reads to members and the owning host. Direct client inserts, updates, and deletes are revoked. Writes go through narrowly scoped PostgreSQL RPC functions with empty `search_path`, fully qualified relations, input validation, and explicit execute grants.

Host-only writes verify **both** `auth.uid()` and the SHA-256 hash of a random host credential in `quiz_private.host_credentials`. Ordinary players cannot change room permissions with the public code, even if they copy a host request. Private credential tables have RLS and no client table permissions. Definer helper functions cannot be called directly except the boolean membership predicate required by RLS. No service-role or privileged key is used or embedded. Vite refuses to build if a privileged or invalid key is supplied as the frontend Supabase key.

Guest identity and room membership are the only authentication mechanisms introduced in this phase. Rooms, players, and guest Auth records persist until administrator cleanup; the frontend has no deletion API. Supabase Auth limits apply to guest creation. Production operators can configure additional abuse protection and retention for the club's usage.

## Live buzzer semantics

Open the host dashboard and click **Start round**. Players can tap/click BUZZ or press Space outside form controls. The button immediately displays **Buzzing** and blocks repeat submissions until confirmation. The winning player sees **YOU BUZZED FIRST!**; other players see **LOCKED OUT — [name] buzzed first.** All dashboards display the same accepted name and team. Repeated keyboard keydown events are ignored, and form fields/buttons retain their normal keyboard behavior.

| Action | Server behavior |
| --- | --- |
| New room | Paused, round number 0, no winner. |
| Start round | New UUID round identifier, increment round number, clear winner, status `ready`. Buzzing is enabled. |
| Pause | Preserve UUID and round number; change `ready` to `paused`. Buzzing is disabled. A locked result cannot be paused or erased. |
| Reset buzzers / Next question | Same new-round semantics as Start: new UUID, increment round number, clear winner, status `ready`. Scores are untouched. |
| Start after pause | Opens a **new** round; it does not reuse/resume the paused UUID. |
| Accepted buzz | Preserve round identifier; status `locked`, record one winning player and server timestamp. |

`public.quiz_buzzer` has one row per room and is separate from heartbeat/lobby writes. `submit_quiz_buzz` derives the participant from the signed `auth.uid()`, checks room membership, and locks the buzzer row with `SELECT ... FOR UPDATE`. While holding that lock it verifies the submitted round identifier and current status. Only an eligible `ready` row becomes `locked`. Later attempts return `accepted: false` with `duplicate`, `locked`, `paused`, or `stale_round`, together with the authoritative state. No player ID, winner name, or browser timestamp is accepted as input.

**First means the first valid buzz serialized and accepted by PostgreSQL.** It does not determine which physical button was pressed earliest across different network connections. `winning_at` comes from PostgreSQL's `clock_timestamp()` after acquiring the row lock; timestamps do not choose the winner. The accepted name/team are frozen so a player renaming themselves cannot rewrite the result.

`control_quiz_buzzer` uses the existing host credential plus signed host identity and locks the same row. Every host request includes the round the host was viewing. A delayed buzz from a previous round cannot win after reset; a duplicate host reset cannot accidentally advance two rounds. Direct inserts/updates/deletes on the buzzer table are denied to clients, including the host. Only its restricted RPCs can change protected state.

Realtime buzzer events are applied immediately through the existing single room subscription, without the roster's debounce. A monotonic server revision prevents an old HTTP snapshot, delayed RPC result, or out-of-order event from overwriting a newer round/winner. Reconnection reads the full authoritative snapshot, so missing a websocket event does not strand a client in an old round. A failed/unconfirmed buzz is not automatically resubmitted and never produces an optimistic winner display.

## Scoring preview

Only the scoreboard's labeled LOCAL controls remain in memory. They are never sent to Supabase, reset on refresh, and are independent of live buzzer reset. Host-side simulated-player buzzes and player-side simulated-moderator controls have been removed. No synchronized scoring or tournament features are included.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Existing homepage, navigation, host/player views; consumes live rooms/buzzers and local score preview. |
| `src/components/HostBuzzer.tsx` | Existing-layout host buzzer card with authenticated controls. |
| `src/components/PlayerBuzzer.tsx` | Existing-layout player buzzer, pending/result states, mobile click and keyboard support. |
| `src/lib/supabase.ts` | Validated public configuration, one Supabase client, per-tab guest sessions, timeouts. |
| `src/rooms/api.ts` | Typed room RPC adapter and user-facing error mapping. |
| `src/rooms/useRoom.ts` | One room subscription, snapshots, heartbeats, recovery, buzz/control request guards. |
| `src/rooms/state.ts` | Revision-aware reconciliation of RPC, snapshot, and Realtime state. |
| `src/rooms/storage.ts` | Session persistence and idempotent creation credentials. |
| `src/rooms/types.ts` | Live room/player types and liveness timing. |
| `src/demo.ts` | Local score preview only; no buzzer arbitration or backend writes. |
| `supabase/migrations/202610270001_quiz_rooms.sql` | PostgreSQL schema, authorization, operations, Realtime publication. |
| `supabase/migrations/202610270002_quiz_buzzer.sql` | Buzzer state, atomic arbitration, authorized round controls, snapshot extension, RLS/publication. |

## Verification

```sh
npm run build
npm test
npm run test:database
npm run test:integration
npm run test:integration -- --presence
```

`npm test` checks client reconciliation: an old HTTP response cannot erase a Realtime winner, a delayed winning response cannot overwrite a new round, a new round unlocks correctly, and events from a different room are ignored.

`test:database` starts a disposable PostgreSQL cluster under `.test-db/`, executes both actual migrations with Supabase Auth roles/claims bootstrapped, and runs the existing Phase II tests plus buzzer arbitration/security tests. It tests one buzz; two and eight concurrent contenders; duplicate, paused, locked, and stale attempts; host reset/pause/start semantics; direct-write/impersonation/outsider/unauthorized-host denial; and reconnecting to the same result. Contention tests use **separate PostgreSQL connections** and hold the row until every contender is actually waiting on a database lock. A deterministic reset-before-delayed-buzz test verifies that a request already waiting at reset time cannot win the new round. The cluster is stopped and removed. This development-only runtime does not substitute for testing Supabase Realtime.

`test:integration` uses the configured Supabase project and public key. It runs the Phase II room checks, then verifies live buzzing with two and three concurrent independent player sessions. It confirms exactly one accepted attempt and **actual Realtime winner/reset delivery to the host and every player**, authorization, stale/paused/duplicate rejections, and restoration of an existing player's session without adding a player. `--presence` also runs the Phase II 80-second heartbeat expiry check. Test rooms close to new joins and sessions sign out afterward. Room/player/Auth records remain for inspection; cleanup is an administrator task.

Manual browser check: open an independent host and two players, create/join a room, Start, and click BUZZ. Confirm the same name/team on host and both players. Next question must clear results and enable both buzzers. Pause must disable them without changing the displayed round. Start opens another round. Test Space, reload the winner/locked-out dashboards, and inspect phone widths. Do not infer successful Realtime solely from polling updates.

References: [guest sessions](https://supabase.com/docs/guides/auth/auth-anonymous), [database functions](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).
