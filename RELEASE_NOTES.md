# VAT Quiz Bowl v1.0.0

Prepared October 27, 2026 for the Village Academic Team. This is the initial release candidate for a supervised VAT deployment. No Git tag or published GitHub/Vercel release has been created by this task.

VAT Quiz Bowl lets a moderator host an academic competition and share a six-character room code with students. Each independently opened browser receives a signed guest identity. Hosts assign teams, open questions, identify the first server-accepted buzz, judge responses, award/deduct points, and finish matches with preserved final standings. Students receive live winner, lockout, score, and match updates on a phone or computer.

## Release verification

See [the release audit and command results](docs/RELEASE-AUDIT.md). Local TypeScript/production build, automated tests, disposable PostgreSQL migrations/security/concurrency checks, hosted Supabase integration including heartbeat expiry and lost replies, and independent-browser match checks are executed checks. The final hosted frontend URL, real iOS/Android devices, school Wi-Fi drops and class-sized load are separate acceptance gates; they have not been certified by those tests.

The framework, visual design, server-side arbitration, and scoring architecture are retained. Final changes harden public environment configuration and startup errors, improve player restoration/rate-limit feedback, update the version badge, and complete the documentation. `package.json` and `package-lock.json` already declare 1.0.0 and remain consistent. No dependency upgrades or new SQL migrations are required for this release.

## Deploying

Follow [the exact Vercel/Supabase deployment guide](docs/DEPLOYMENT.md), then [the VAT session acceptance checklist](docs/ACCEPTANCE.md). The frontend is static `dist/` output; it communicates directly with Supabase. No Node server, service-role key, or database password belongs in the deployed browser application.

Only browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are needed. Existing projects may continue using the legacy anon-key fallback. All three existing migrations must be installed on a fresh backend; an already migrated Phase IV/V project needs no additional SQL. Anonymous sign-ins are verified on the configured backend through actual guest creation; production-domain Auth and dashboard settings still need owner verification.

## Known limitations

- First buzz is server acceptance order, which may differ from physical press order across networks. Scoring and answer judging remain moderator decisions.
- Identity and host credentials use tab-session storage. Refresh/rejoin in that session retains membership; closing/clearing it or switching devices is not account recovery. Duplicating a tab can clone storage; independently open tabs/private sessions for different participants.
- Players are marked offline after 75 seconds without a server heartbeat. Backgrounded/suspended phones may appear offline; records and assignments are retained.
- Room codes are invitations to open rooms, not passwords or host credentials. Rooms do not expire automatically. Closing joining blocks new players while existing members can reconnect.
- Supabase Auth limits and project quotas must accommodate many fresh student identities behind one school IP. CAPTCHA and app-specific room/join quotas are not implemented; resolve abuse protection before unrestricted public exposure. Do not enable a CAPTCHA requirement without implementing the matching client token flow.
- There is no automatic deletion/retention job. Tests leave isolated rooms/users for administrator review, with joining closed. Final-match history in the UI shows ten recent matches; older database records remain.
- Screen-reader/contrast conformance, physical touch devices, school-network interruptions, expected class size/duration, and final-domain deployment checks still require manual acceptance. Historic screenshots also require the owner's publication/privacy review.

No push, tag, release publication, external setting change, or deployment is authorized merely by these notes. Obtain the owner's explicit approval before those release actions.
