# v1.0.0 release audit — October 27, 2026

## Verdict

**READY FOR DEPLOYMENT** — all locally verifiable release gates pass. This verdict authorizes no release action and does not claim that a deployed production URL or an unrestricted public service has been verified. The owner still needs to configure/approve Vercel, verify production-domain Auth, review abuse/shared-IP capacity controls, and complete the school/device acceptance checklist before student admission or public promotion.

Source baseline: `00f1320` (`Complete Phase V production readiness`). The release changes remain uncommitted for review. No tag, push, GitHub release, deployment, external setting change, database reset, or deletion of existing rooms was performed. Live tests were authorized, created isolated synthetic users/rooms, and closed their rooms to new joins. The browser test match was completed. Test records persist for administrator review.

## Concise project audit

| System | Finding |
| --- | --- |
| Frontend/build | React 19, TypeScript strict mode, Vite, Tailwind, Lucide; static `dist/` output. Node 24 declared in package engines and `.nvmrc`. No server runtime required. Clean lockfile install and production build pass. |
| Environment/startup | **Fixed:** build/runtime validation differed, allowed malformed project URLs, and could throw while creating the SDK outside the configuration guard. Shared parsing now trims values, checks both configured keys, validates origins and HTTPS, and catches storage/crypto/SDK initialization errors. Environment reads remain explicit; unrelated `VITE_*` variables are not passed wholesale to the browser adapter. |
| Navigation/loading | Hash links retained; `/host`, `/player`, and trailing-slash aliases refresh through exact Vercel rewrites. **Fixed:** a restoring player now sees a recovery prompt instead of being invited to join again. |
| Auth/rooms | Signed anonymous Auth, six-character room invites, idempotent creation/joining and retained membership are implemented and verified against the configured backend. Host rights require both the owning identity and a hashed credential. Code possession never grants hosting. |
| Buzzer | Existing row-lock arbitration retained. Exactly one winner under real PostgreSQL contention and hosted concurrent clients; duplicates, stale attempts, paused/ended matches, frozen identities, resets and reconnects pass. No client winner selection. |
| Scoring/lifecycle | Server-only team management, assignments, bounded integer increments, persisted request IDs, atomic match/round changes, frozen tied final results, and new-match history preservation pass. |
| Realtime/recovery | One room channel with four listeners, immediate revision-checked buzzer updates, debounced roster reads, heartbeat and fallback snapshots. Cleanup removes listeners/timers/channel and rejects disposed callbacks. Browser refresh/rejoin and hosted recovery tests pass; packet-level socket counts and full-length school Wi-Fi behavior were not measured. |
| Migrations/security | Three ordered version-controlled migrations. Populated upgrade retained data. Local catalog tests verify 8 RLS tables and 16 restricted function/search-path checks; live negative tests verify member/host boundaries. No schema/policy change was needed. The public key cannot inspect every live administrative setting. |
| UI | Navy/blue/gold design retained. Updated phase badge to v1.0.0; inputs retain useful examples, not mock functionality. Small phone/tablet/desktop checks and Space buzzing/focus checks pass. No raw HTML insertion or debug console calls in frontend source. |
| Performance | Vendor chunking retained; no added dependency or speculative optimization. Existing heartbeat fan-out can grow with roster size; full-club capacity is a manual load gate. Final bundle measurements appear below. |
| Repository/release | Private env/generated files ignored. Working source, reachable local Git blobs, and built files scanned heuristically without matched privileged credentials. README, changelog, release notes, ten-step deployment guide, CI artifact scan, and this report complete. Package/lock version already 1.0.0; no version/dependency change needed. |

**Code blockers found and resolved:** malformed/inconsistent configuration and unguarded startup failures. Player restoration and rate-limit feedback were nonblocking UX fixes. No known critical functional or authorization defect remains in the tested scope.

**Remaining operational gates:** actual deployment URL, live dashboard administrative review, abuse protection/shared-IP capacity, physical phones and school-scale acceptance. These do not require redesigning the application to prepare a controlled deployment. Unrestricted public exposure remains gated on resolving abuse prevention; CAPTCHA and application-level creation/join quotas are absent. See the precise owner actions in [DEPLOYMENT.md](DEPLOYMENT.md).

## Changed/created files

| Files | Release change |
| --- | --- |
| `src/lib/publicConfig.ts` (new), `vite.config.ts` | Shared, safe build/browser parsing and origin/key validation. |
| `src/lib/supabase.ts`, `src/vite-env.d.ts` | Explicit typed public env reads, guarded client initialization, same session-only identity/storage and request timeouts. |
| `src/rooms/errors.ts`, `src/rooms/api.ts` | Extracted existing friendly error mapping for direct testing; added network signup-limit guidance; preserved adapter exports and RPC contracts. |
| `src/App.tsx` | Version badge and player-session restoration prompt. Layout and game controls retained. |
| `scripts/release.test.mjs` (new) | Five additional regression tests with config, auth/error, storage corruption and creation-retry cases. |
| `scripts/audit-repository.mjs`, `.github/workflows/checks.yml` | Optional built-artifact credential scan, enabled after the CI build. |
| `.env.example`, `README.md` | Updated public env/setup/test/deployment instructions and links. |
| `CHANGELOG.md`, `RELEASE_NOTES.md`, `docs/DEPLOYMENT.md`, `docs/RELEASE-AUDIT.md` (new) | Initial-release capabilities, limitations, exact deployment procedure, evidence and verdict. |

Reviewed but unchanged: package/lock versions, Node version, dependencies, `vercel.json`, routing helper, room subscription/revision/recovery code, scoring/buzzer components, styles, three migrations, existing backend/integration tests and the acceptance checklist. Ignored screenshots remain local evidence, not release source.

## Commands executed and actual results

| Command/check | Actual outcome |
| --- | --- |
| Repository/source inspection and `git status --short` | Initial working tree clean; inspected source/config/schema/tests/docs before edits. No repository-specific AGENTS instructions found. |
| `npm ci` | Passed: 110 packages installed, 111 audited, 0 vulnerabilities. npm noted two packages with install scripts not covered by its allowScripts configuration; neither build nor PostgreSQL tests were blocked. No policy was weakened. |
| `npx --no-install prettier --write` on changed TypeScript/test/scan files | Passed. Only affected files formatted; no formatter/linter dependency added. |
| `npm test` | **15 passed, 0 failed** in final run. Includes the ten existing checks and five new release tests. |
| `npm run test:database` | Passed all migration, populated-upgrade, RLS/ACL/search-path, host/membership, 2-/8-connection buzzer contention, duplicate/stale/paused/end/reset, concurrent scoring/advance, ties/history/reconnect checks. Disposable local PostgreSQL only; normal exit. |
| `npm run test:integration -- --presence` | Passed against configured hosted Supabase: independent guests, idempotent rooms/joins, live roster/lobby, host authorization, 80-second heartbeat-expiry check, retained identity, 2-/3-client contention and delivery to every subscriber, assignments/scoring/counters/summary/new match, and client-only lost-response fault injection for committed buzzes and scores. Test room closed afterward. |
| `npm run build` | Passed `tsc -b` and Vite production build to `dist/`, no oversized-chunk warning. Initial ImportMetaEnv typing error introduced during consolidation was corrected with explicit env types; the final compiler/build pass. |
| Production build with a temporary unused `VITE_RELEASE_UNUSED_MARKER` canary, followed by JavaScript scan | Passed: the unused canary is absent from built JavaScript; the temporary process variable was removed afterward. No product environment setting was added. |
| `node scripts/serve-production.mjs` and `node scripts/test-static.mjs` | Passed local HTTP checks: homepage/four aliases, exact configured headers, JS/CSS MIME responses, missing asset 404. This is static artifact QA, not Vercel deployment verification. QA server stopped after testing. |
| `node scripts/audit-repository.mjs --dist` | Passed heuristic working-source/reachable-history/build scan; no matched privileged credentials. `.env.local`, `dist/` and preview paths confirmed ignored. The scanner does not certify personal data, binaries, unknown secret formats or remote/unreachable Git objects. |
| `node scripts/bundle-size.mjs` | App JS 65,246 bytes (gzip 19,326); React 223,223 (69,241); Supabase 227,081 (58,974). Total JS 515,550 bytes, gzip sum 147,541. Largest chunk 227,081. No load-time improvement claimed. |
| `git diff --check` | Passed. Git emitted normal local LF/CRLF conversion notices, not whitespace errors. |

No final failing automated test remains. Lint was **not executed** because none is configured. GitHub-hosted CI execution and the actual Vercel deployment were **not inspected/executed** for this release. Linux runner behavior is not inferred from the Windows local run. No actual-device radio outage, Safari/Android test or full-club load benchmark was performed.

## Independent-browser product validation

Executed against the locally served release build using the real configured Supabase backend, with one fresh host and two independent student tabs named **Release Alpha** / **Release Beta**:

1. Homepage loaded with preserved branding and v1.0.0 badge. Host created a room. An invalid impossible-to-generate code produced the expected message; correcting it allowed joining.
2. Both student identities joined. Host roster updated without refresh. Host created **Finalists**, assigned Alpha to it and Beta to Gold; assignments appeared on students.
3. Alpha won a click buzz; Beta and host displayed Alpha's authoritative result and Beta was locked out. The attempted second automated click lost its locator because Realtime had already changed it to Locked out; the resulting UI state was checked. This automation sequence does not prove simultaneous browser request arrival: real contention is covered separately by database/hosted SDK tests.
4. Host awarded +10; both students displayed the same score. Host renamed the team **VAT Finalists** and confirmed the buzzer reset. Beta then won using Space; Alpha displayed Beta's lockout result. Winning labels stayed frozen appropriately.
5. Host closed joining. Alpha cleared only the room descriptor, rejoined with the same Auth identity and a different team preference, and retained **VAT Finalists**. Host roster stayed **2 total**, without duplicate membership.
6. Direct `/player` navigation and active-match refresh restored player identity, score and current winner/question. Host deducted 5 from Gold; student score showed −5. Next question unlocked both; Pause disabled buzzing; Next round reopened round 2. An active player refresh restored Ready.
7. Host confirmed End match. Both student summaries agreed: VAT Finalists 10, Blue 0, Gold −5, 3 completed questions and the same completion timestamp. Direct `/host` navigation restored the host summary and connected state in the final built artifact.
8. Console warning/error reads returned no entries in all three tabs for the tested flow. Test tabs were closed afterward. No credentials were read from browser storage or logged.

Responsive dimensions: student 375 px viewport / 360 px content, tablet 768 / 753, desktop host 1280 / 1265 (vertical scrollbar; no horizontal overflow). Phone buzzer measured **230 × 230 px**. Tab navigation reached Host dashboard with a **3 px solid focus outline**. The final screenshot was visually inspected. These are browser viewport/keyboard checks, not physical touch-device or WCAG certification.

## Final gate checklist

- [x] Production build and strict TypeScript pass.
- [x] Automated tests pass; scope and unexecuted tests documented.
- [x] Critical independent-session multiplayer flow verified against real Supabase.
- [x] Server-authoritative arbitration, atomic scoring, idempotency and host boundaries retained and tested.
- [x] RLS/functions/migrations reviewed; no new migration required.
- [x] No matched privileged credentials in scanned source/history/artifact; env exclusions verified.
- [x] Existing Vercel config supports the app; no server runtime added.
- [x] Small-phone/tablet/desktop UI and keyboard behavior checked.
- [x] No known critical bug remains in tested scope; release docs and owner actions complete.
- [ ] Owner reviews live Supabase administrative settings, abuse/shared-IP capacity, backup/retention and historical-image privacy.
- [ ] Owner approves publication/deployment; final HTTPS URL is then verified with independent devices and the full [ACCEPTANCE.md](ACCEPTANCE.md) school-network pilot.

No auto-expiring rooms, CAPTCHA client, application quotas, verified real-world display names, host account recovery, automatic grading or automatic retention cleanup were added. Those limitations are accurately stated in [RELEASE_NOTES.md](../RELEASE_NOTES.md). Deployment and dashboard steps are in [DEPLOYMENT.md](DEPLOYMENT.md); do not infer completion from this checklist.
