# VAT Quiz Bowl — Phase IV

The existing React, TypeScript, Vite, Tailwind CSS, and Lucide interface now supports a complete live quiz bowl match: host-managed teams, persistent scoring, question/round tracking, authoritative buzzers, final standings, and new matches. Existing routes, branding, guest sessions, and room codes are retained. No Phase V deployment work is included.

## Setup / upgrade

1. Use Node.js 24 (or 22.18+) and run `npm install`.
2. Copy `.env.example` to `.env.local` and set the Supabase URL and browser-safe **publishable** key (or legacy **anon** key). Never use a service-role key, secret key, or database password in frontend configuration. Restart Vite after changing environment variables.
3. Enable **Anonymous Sign-Ins** in Supabase Authentication → Sign In / Providers. Guests receive signed identities without a sign-in form.
4. In the Supabase SQL Editor, execute each required migration **in order**, copying the entire file including `begin` / `commit`:
   - New project: `202610270001_quiz_rooms.sql`, then `202610270002_quiz_buzzer.sql`, then `202610270003_competition.sql` from `supabase/migrations/`.
   - Existing Phase III project: run **only** `supabase/migrations/202610270003_competition.sql`.
   - Do not rerun an already applied raw migration. A linked Supabase CLI migration workflow is also supported.
5. Keep `quiz_private` out of Data API exposed schemas. The public schema supplies the restricted RPCs. The migrations enable Realtime publication for `quiz_rooms`, `quiz_players`, `quiz_buzzer`, `quiz_teams`, `quiz_matches`, and `quiz_competition`.
6. Run `npm run dev` and open the printed localhost URL.

The supplied project is configured in ignored `.env.local`; all three migrations were applied and live integration tests executed during this phase. No new environment variables or privileged credentials are required for Phase IV. The public key cannot install SQL migrations, which is why the SQL Editor step is necessary.

`npm run build` runs TypeScript and creates `dist/`. `npm run preview` serves that build locally. Hash routes work on static hosting. This phase does not publish the frontend or change hosting. A localhost address is accessible only on that machine; an already hosted frontend must receive the updated build for other devices to use these changes.

## Run a match

1. Click **Host a Game** and share the room code. An existing host session resumes its room.
2. Students join from independently opened browsers/tabs/devices with their display name and a **team preference**. New players remain **Unassigned** until the host assigns them. Preferences never grant authority to change teams.
3. In **Teams & players**, create/rename teams and choose the assigned team for each player. New rooms include Blue and Gold as starter teams. Existing Phase II/III team assignments are migrated without discarding players or rooms.
4. **Open buzzers** opens the first question, or reopens the current question after a pause/reset. Players tap/click BUZZ or press Space outside form controls. The first valid request accepted by PostgreSQL wins. No points are awarded automatically.
5. The scoring team defaults to the accepted winner's team. Choose a different team to override it. Use the configurable +10 / +5 / −5 defaults or a custom positive/negative adjustment. The live leaderboard sorts highest score first and shows competition-style ties: T1, T1, #3.
6. **Next question** completes the current question, advances its number, and atomically opens a fresh buzzer identifier. **Next round** completes the current question, advances the competition round, and opens question 1.
7. **End match** asks for confirmation, finishes the open question, freezes ranked final scores, records the server completion time, closes new joins, and disables buzzing/scoring/team changes. Existing members can reconnect to the summary.
8. Use **Return to dashboard** / **View summary**, or **Start new match**. A new match resets scores to zero and counters to round 1 / no open question, retains teams and player assignments, and reopens joining. Previous final results remain available under **Previous match results** (ten most recent summaries in the UI; older rows remain in the database).

Empty teams can be removed only if they have no assigned players and zero points. Removal archives the team rather than erasing references. A team with points remains in the standings until the match is finished. Scores may be negative. Each adjustment must be a nonzero integer from −10,000 to +10,000; total team scores are bounded to ±1 billion. These are configurable club shortcuts, not an official ruleset.

## Counters and buzzer semantics

Competition round/question numbers are separate from Phase III's internal buzzer cycle. Every reopen, reset, question advance, match end, or new match invalidates old buzzer requests with a fresh UUID as appropriate. The monotonic buzzer revision never resets.

| Control | Competition counters | Buzzer |
| --- | --- | --- |
| New room / new match | Round 1, question 0, completed 0 | Paused, new identifier, no winner |
| Open buzzers | If question is 0, set it to 1; otherwise preserve it | New identifier, clear winner, ready |
| Pause | Preserve counters | Preserve identifier; ready → paused; locked results remain locked |
| Reset buzzers | Preserve the current question (or open question 1) | New identifier, clear winner, ready |
| Next question | Complete an open question and increment its number | New identifier, clear winner, ready |
| Next round | Complete an open question; increment round; question becomes 1 | New identifier, clear winner, ready |
| End match | Count the open question once as completed | Invalidate identifier; no further buzzing; retain an accepted result if present |

“Questions completed” means questions the host has moved past or finished by ending the match. Reopening/resetting the same question does not count it again. There is no automatic answer grading or question bank. Starting with Next Question when no question is open starts question 1 without counting a phantom completed question.

“First” means the first valid attempt serialized and accepted by PostgreSQL, not the first physical press across different network connections. The Phase III arbitration functions are retained unchanged behind restricted wrappers. Membership is derived from `auth.uid()`, not a client-provided player ID. Winning names/team IDs are captured at acceptance; reassigning a player later cannot rewrite that accepted result. The host may override the scoring team.

## Security and consistency

- Existing signed guest sessions and 256-bit host credentials are reused. Host operations check both the owning `auth.uid()` and the hashed host credential. Room codes are never authorization.
- All protected tables have RLS. Clients receive member-scoped SELECT only. Direct team, score, match, assignment, or buzzer writes are denied, including direct writes from the host's browser.
- Team names are unique within a room (case-insensitive, trimmed). IDs are checked against the current room, so a team/player from another room cannot be substituted.
- `manage_quiz_competition` validates names, integer adjustments, score limits, match identity, lifecycle, and action payloads. Narrow RPC grants and empty `search_path` are used; implementation functions and request receipts remain private.
- Compound operations use the same buzzer-row lock before modifying matches, teams, or players. Score/end/new-match operations cannot interleave partially with a buzz or question reset.
- Each competition action has a browser-persisted UUID request ID. The private server receipt rejects changed payloads and returns the current snapshot for an exact replay. A lost response or double submission cannot apply the same adjustment twice.
- While an action is unconfirmed, the interface retains its request and offers **Retry saved action**. New host mutations wait until that action is resolved. Retrying after a page reload or even a new match uses the original match/request IDs; old points cannot leak into the new match.
- Question advances also carry the buzzer identifier the host was viewing. Two concurrent host advances from the same question cannot skip two questions. Stale match requests cannot affect a new match.
- Final standings freeze team names, ranks, and points in an ended match row. Renaming/removing teams or resetting current scores later leaves those results intact. Past matches are read-only through the client API.

## Realtime and recovery

The existing single room subscription listens to buzzer, roster, lobby, and competition changes. Critical buzzer events are applied immediately. A competition revision notification fetches one authorized snapshot containing the match, teams, assignments, history, and buzzer so a new match cannot be displayed with the old match's scores. Server revisions prevent older HTTP/RPC responses from restoring stale scores, assignments, or winners. Notifications already covered by an RPC response are ignored. No separate scoreboard polling loop or duplicate subscription is added.

The existing 20-second heartbeat and recovery snapshot remain; online status expires after 75 seconds without a server-timestamped heartbeat. Offline player records and assigned teams are retained. Returning online, returning to the tab, retrying, or refreshing retrieves authoritative state. Buzzing stays disabled during reconnection/competition synchronization. Mobile background suspension may temporarily show a player offline.

Guest tokens, host credentials, active room, and unconfirmed actions use sessionStorage. A distinct auth storage/channel key isolates independently opened tabs. Refresh preserves identity; closing/clearing a browser session or moving to another device requires a new identity. Some browsers clone session storage when duplicating a tab, so use independently opened tabs/private windows for separate participants. Credentials never appear in room codes, URLs, player records, or localStorage.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Existing routes, navigation, branding, and host/player view composition |
| `src/components/Competition.tsx` | Host team management, live scoreboard, match controls, summaries/history |
| `src/components/HostBuzzer.tsx` | Existing buzzer card with live question integration |
| `src/components/PlayerBuzzer.tsx` | Mobile/click/Space buzzer, pending/winner/lockout/ended states |
| `src/rooms/useRoom.ts` | One subscription, recovery, request guards, idempotent competition actions |
| `src/rooms/api.ts` | Typed public RPC adapter and understandable errors |
| `src/rooms/state.ts` | Revision-aware buzzer and competition reconciliation |
| `src/rooms/leaderboard.ts` | Read-only ranking with correct ties |
| `src/rooms/storage.ts` | Session credentials and unconfirmed request persistence |
| `supabase/migrations/202610270003_competition.sql` | Teams, matches, revisions, request receipts, RLS, restricted operations, backfill |

The local scoring reducer has been removed. All displayed team scores come from Supabase. No new framework, service-role key, tournament feature, or deployment integration was introduced.

## Verification

```sh
npm test
npm run test:database
npm run test:integration
npm run build
```

`npm test` verifies stale-response protection for buzzer/competition state and leaderboard ordering/ties, including negative scores.

`test:database` starts an isolated PostgreSQL cluster under `.test-db/`. It runs Phase II/III tests, applies Phase IV to those populated rooms, tests team management and assignment retention, positive/negative/custom scoring, validation, same-request retries, concurrent host scoring/advances, stale buzzes, match end/reset, frozen tied results, history, RLS and authorization, and then reruns the Phase III contention/reconnection tests after the upgrade. Contention uses separate connections and real row-lock waits. The test stops/removes only its verified temporary cluster.

`test:integration` uses the configured Supabase public key and independent guest sessions. It tests actual Realtime delivery for rooms, buzzes, team assignments, scores, counters, match state, and final results; unauthorized requests; score retries; stale questions; new-match resets; and restored player identity/teams/history. The optional `--presence` flag retains the Phase II 80-second heartbeat-expiry test. Test rooms close to joining afterward; database/Auth test records remain for administrator inspection/cleanup.

Browser verification covers host team create/rename/archive, assignment, mouse buzzing, scoring-team override, positive/negative/custom adjustments, shortcut configuration, counters, tied summary, new match, reconnect, and phone layout. Automated checks and live tests must be rerun after relevant changes; a successful polling snapshot alone does not prove Realtime delivery.

References: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [PostgreSQL row locks](https://www.postgresql.org/docs/17/explicit-locking.html).
