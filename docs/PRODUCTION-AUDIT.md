# Phase V verification — 2026-10-27

## Verdict and scope

The existing application is prepared for GitHub publication and Vercel deployment, subject to the release gates below. Tests demonstrate complete matches against the configured Supabase project and real PostgreSQL arbitration. This is **not certification for unrestricted public use or full-club capacity**. No frontend was deployed, GitHub code pushed, Supabase setting changed, or existing room deleted. Isolated live test records were created with the owner's authorization and their rooms closed to new joins. Browser test room was ended. Anonymous test users and records remain for administrator review.

## Implemented changes

- Added a subscription-generation recovery gate. An HTTP read started before an offline event, channel failure, replacement subscription, or cleanup cannot mark the room connected or clear its connection warning. Only a read for the current subscribed generation can restore interactivity.
- Removed the extra heartbeat on `SUBSCRIBED`; retained the subscribe-time authoritative recovery read, initial heartbeat, visibility recovery, and 20-second fallback. No interval runs for the presence clock on the homepage without a session. These are code-level reductions; no query-throughput or render-speed claim is made.
- Kept one room channel, immediate revision-checked buzzer delivery, debounced roster reads, server arbitration, frozen winners, transactional scoring, and persisted idempotency IDs. No scoring or winner determination moved into the browser.
- Added `/host` and `/player` path aliases while preserving existing hash navigation. Exact Vercel rewrites include trailing slashes; missing assets are not rewritten to HTML.
- Added Vercel security headers: restrictive CSP, frame denial, MIME sniffing protection, referrer policy, and unused device-feature restrictions. CSP allows the existing Supabase HTTPS/WebSocket service; custom domains require an explicit policy update.
- Vercel builds now reject missing configuration and non-HTTPS backend URLs. All configured public-key variables are checked, including an unused fallback, before bundling. Added Node 24 configuration, opt-in live testing documentation, GitHub CI checks, and read-only credential scanning.
- Excluded generated previews and `.vercel/`; staged removal of seven generated images from Git tracking, preserving their local files. No history rewrite. Added setup, deployment, limitations, and practical acceptance instructions.

## Security and database findings

| Boundary | Evidence and conclusion |
| --- | --- |
| Database RLS | Disposable PostgreSQL catalog assertions passed for all eight application tables: six public state tables and two private tables. Anonymous direct access and authenticated direct DML are denied. Actual hosted tests also reject cross-room reads and forged operations. |
| Host authority | Server checks owning `auth.uid()` plus a hashed 256-bit host credential. Players, wrong tokens, unrelated hosts, and room codes cannot perform host operations. Browser session credentials are never URL parameters or public roster data. |
| Player identity | Signed anonymous Auth identity determines membership and buzzer player ID. No client-selected player identity controls acceptance. Repeat joins retain the same row for the same identity. Display names are labels, not verified real-world identity. |
| Function safety | Local catalog checks passed for 16 application/private functions: SECURITY DEFINER search paths are empty and grants restricted. Only the member-access policy helper is executable by authenticated users inside the private schema; private implementation RPCs and receipt data are inaccessible. Hosted negative tests verify relevant public permissions. |
| Atomicity | Separate PostgreSQL connections held actual row-lock waits with 2 and 8 simultaneous buzzes, exactly one winner. Hosted tests used 2 and 3 concurrent authenticated clients and checked delivery to every subscriber. Concurrent scoring increments and stale/duplicate host advances passed. |
| Migrations/data | Migrations 001 and 002 were applied in order, populated with rooms/players/results, then upgraded with 003 without losing those records. Competition tests and the original buzzer contention tests passed after upgrade. No Phase V SQL migration is necessary. |
| Indexes | Reviewed unique room code; `(room_id,user_id)` membership; `(room_id,created_at,id)` roster ordering; host owner; team room/active-name; `(room_id,match_number)` history; root/buzzer room primary keys; room/request receipt primary key. These support the current lookup patterns. No production-scale query-plan/throughput benchmark was performed. |
| Credential exposure | Read-only heuristic scan of current tracked/unignored source plus reachable local Git blobs found no matching service-role JWT, Supabase secret key, private key, GitHub/AWS token, password-bearing database URL, or tracked private env file. Public Supabase URL/key are expected in built JavaScript. `.env.local` is ignored. Binary images and unrecognized token formats are outside the scanner's guarantees. |
| Browser output | Host/player production-build console checks returned no warning/error entries during the tested match under the checked-in CSP. Source has no console credential logging or raw HTML insertion. This is a tested-path observation, not proof about extensions or all browser behavior. |
| Dependencies | `npm audit --json` queried the registry and reported 0 vulnerabilities across all severities on this date. Dependency versions were not upgraded; only root Node engine metadata changed. |

The catalog audit runs locally against these migration definitions; the public key cannot inspect all live administrator metadata. Before release, inspect hosted Security Advisor and confirm `quiz_private` is not an exposed Data API schema. Do not grant broad table DML or function execution to resolve an application error.

## Tests actually executed

| Check | Result |
| --- | --- |
| `npm ci` | Passed clean lockfile installation (110 packages, 0 audit findings). No dependency version upgrade. Final unit/database tests and build also passed after this install. |
| `npm test` | 10 passed, 0 failed: config/key guards, deployment URL/config checks, route precedence, offline/channel/disposal read gating, stale buzzer/score reconciliation, unknown-response nonce retention, negative/tied ranking. |
| `npm run test:database` | Passed, including populated upgrade, authorization, private ACL/search-path catalog assertions, real concurrent buzzer and score writes, stale/paused/duplicate attempts, question advance, ended-match restrictions, immutable final standings and new matches. Disposable cluster only. |
| `npm run test:integration -- --presence` | Passed against the configured hosted project: separate guest identities, live room roster/lobby, 75-second expiry (80-second wait), retained player ID after reconnect, actual Realtime winners/scores/counters/results across all participants, complete match/reset. |
| `npm run test:integration` with added transport faults | Passed: additional SDK clients restore the same identities; a failed read recovers, a committed buzz with its reply discarded is recovered as the single winner, retry is a duplicate, and a committed score with its reply discarded is retried using the same nonce and increments only once. Fault injection is client-only and uses real database commits. It does not emulate a phone radio or a dropped WebSocket transport. |
| `npm run build` | Passed TypeScript (`tsc -b`) and production Vite build. No chunk-size warning after splitting. |
| `node scripts/test-static.mjs` | Passed against local `serve-production.mjs`: homepage, four exact dashboard aliases, configured security headers, referenced JS/CSS, and missing-asset 404 behavior. This is not a deployed Vercel test. |
| Browser match | Passed in independent host/student tabs: create/join, live roster, host assignment, Space buzz, authoritative winner, +10 scoring visible in student view, next-question unlock, direct `/player` navigation and refresh retaining identity/state, end match and synchronized final results. |
| Responsive browser checks | Player viewport widths 390, 768, 1440 px: document content widths 375, 753, 1425 px respectively (normal vertical scrollbar; no horizontal overflow). Phone buzzer measured 230 × 230 px. Phone winner screenshot reviewed. Desktop host dashboard also exercised. |
| Lint | Not run: no lint tool/configuration exists. TypeScript strict checking remains enabled. |
| GitHub Actions/deployment | Configured locally only; not executed on GitHub or Vercel. |

Intermediate failures were corrected or retried: sandbox networking initially blocked hosted calls/local preview; they passed with authorized network access. An initial TypeScript use of Node `process` in Vite config was replaced with Vite's environment loader. The new fault test initially used the wrong RPC argument name; it was corrected and the complete live suite rerun successfully. An offline lockfile-only install lacked a cached optional package. A subsequent clean install found an orphan I/O worker from a disposable local PostgreSQL test holding its executable open. That verified test worker was stopped; the Windows-only local test cluster now uses synchronous I/O, and the complete database suite exits normally. Clean installation then passed. This changes no hosted database setting or SQL locking semantics. See [PostgreSQL I/O configuration](https://www.postgresql.org/docs/18/runtime-config-resource.html#GUC-IO-METHOD). No failing application assertion remains in the final runs.

## Performance measurements

Same machine, production minified files, gzip measured with Node zlib:

| JavaScript | Baseline | Split build |
| --- | ---: | ---: |
| Largest file | 514,723 bytes | 227,081 bytes |
| Total bytes | 514,723 | 514,007 |
| Sum of individual gzip sizes | 147,320 | 147,000 |

React and Supabase now occupy separate reusable chunks; application code is 63,703 bytes. All are still needed on startup. This resolves the >500 KB single-file warning and separates vendor caching; it does **not** establish faster startup. Build duration was 9.10 seconds baseline and 10.54 seconds in the final split build, an uncontrolled single-machine comparison. No measured latency, query-count, capacity, or render-performance claim is made. `node scripts/bundle-size.mjs` gives exact sizes for each current build.

## Required release gates and known risks

1. **Abuse protection and shared school IP:** anonymous signup defaults to 30/IP/hour according to [Supabase documentation](https://supabase.com/docs/guides/auth/auth-anonymous). Settings were not inspected or changed. Validate expected fresh joins behind school NAT. CAPTCHA token handling is absent; coordinate its client integration with backend requirements before enabling it. Existing authenticated users also lack app-specific room-creation/join-attempt quotas. RLS prevents privilege escalation but does not prevent resource abuse. Resolve this before unrestricted public exposure.
2. **Production origin:** owner must import the repository into Vercel, configure existing public env names, review Supabase Site URL/redirect configuration, and test new anonymous sign-ins on the final HTTPS origin. No production URL was available or deployed. See README deployment steps and [Vercel's Vite guide](https://vercel.com/docs/frameworks/frontend/vite).
3. **School/physical-device acceptance:** run [ACCEPTANCE.md](ACCEPTANCE.md) with the intended class size, actual iOS/Android devices, school Wi-Fi, background suspension, offline/reconnect, and a full-length session. Browser viewport checks are not real touch-device/Safari certification. No screen-reader, full contrast, or WCAG conformance audit was performed; semantic labels, focus styling and keyboard behavior were reviewed/tested in the stated scope.
4. **Identity/retention:** sessionStorage is browser-tab/session scoped and accessible to page scripts. CSP reduces script injection exposure; it is not credential recovery. Closing/clearing a host session loses host access. Names can repeat; room codes invite membership to open rooms. Assign teams carefully. Define backups, quota monitoring, and administrator-controlled data retention; no automatic deletion was added.
5. **Repository privacy:** old screenshots remain in existing Git history. Current test fixtures are synthetic, and generated previews are no longer tracked. The owner should review historical images and any future student-supplied names before making the repository public. The heuristic scan does not certify personal-data absence or scan unknown remote/unreachable objects.
