# Changelog

## 1.0.0 — 2026-10-27

Initial release prepared locally. Tagging, GitHub release publication, pushing, and Vercel deployment require owner approval and have not been performed by this release task.

### Included

- VAT navy, blue, and gold homepage, host dashboard, mobile player dashboard, and responsive navigation.
- Supabase anonymous guest identities, six-character room codes, persistent rooms/memberships, heartbeat-based online status, and Realtime updates.
- Server-enforced host authority using the owning signed identity and a hashed unguessable host credential.
- Atomic server-authoritative buzzing, one winner, lockouts, pause/reset, stale-request rejection, mouse/touch/Space input, and authoritative reconnect recovery.
- Host-managed teams and assignments, positive/negative/custom scoring, live ranked standings and ties, configurable shortcuts, question/round controls, immutable final results, and new matches.
- Three ordered SQL migrations with member-scoped RLS, restricted functions, safe search paths, data-preserving upgrades, and transaction/idempotency protection.
- Vite production build, Node 24 declaration, Vercel static hosting configuration/security headers, direct dashboard aliases and existing hash links, GitHub CI, and automated database/live integration tests.

### Final release fixes

- Unified build/browser environment parsing, trimmed public credentials consistently, and rejected malformed project origins, embedded credentials, query parameters, fragments, and non-HTTPS production endpoints.
- Caught storage, crypto, configuration, and SDK initialization failures so the frontend displays a recoverable configuration notice.
- Replaced the player join prompt during session restoration with a saved-session recovery state.
- Added actionable signup-rate-limit feedback and regression coverage for auth errors, corrupt saved state, configuration, and room-creation retry credentials.
- Replaced the development phase badge with v1.0.0 and completed release/deployment documentation.

### Limitations

Physical-device/school-network capacity testing and verification on the final deployed URL remain required. Guest identity and host access are tab-session scoped. Anonymous-signup abuse controls and shared-IP capacity require owner review before admitting a class or allowing unrestricted public use. No CAPTCHA client, room expiration, automatic grading, host recovery, or automatic retention cleanup is included. See [release notes](RELEASE_NOTES.md).
