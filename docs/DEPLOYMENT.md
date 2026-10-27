# Vercel deployment and production verification

This guide is preparation. No deployed URL has been verified by this task. The owner must approve pushing, tagging, release publication, or deployment separately.

## 1. Prepare the GitHub repository

Review the release diff and [audit](RELEASE-AUDIT.md). Run the README checks. Confirm that private `.env` files, `dist/`, `node_modules/`, previews, `.test-db/`, and `.vercel/` are ignored. Only `.env.example` is public. Inspect historical images for publication privacy. Commit/push the reviewed source **only after owner approval**; creating a tag or GitHub release is optional and requires its own approval. Record the commit selected for deployment.

## 2. Import into Vercel

In Vercel, select **Add New → Project → Import Git Repository**, authorize access to the intended GitHub repository, and select the folder containing `package.json` as Root Directory. Choose the **Vite** framework preset. Do not select a server/SSR preset or supply the local QA server as an entrypoint. This application needs static hosting only.

## 3. Confirm build settings

| Setting | Value |
| --- | --- |
| Node.js | 24.x (also declared in `.nvmrc` / package engines) |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Development Command, if requested | `npm run dev` |

Keep Vercel's automatic system environment-variable exposure enabled; the configuration uses `VERCEL=1` to require complete settings on Vercel. Production-mode configuration validates HTTPS endpoints. The checked-in `vercel.json` supplies existing build/output settings, exact `/host` and `/player` rewrites (with trailing-slash variants), and security headers. Existing `#/host`, `#/player`, and `#/` links remain valid. Missing asset paths should return 404 instead of HTML. [Vercel Vite documentation](https://vercel.com/docs/frameworks/frontend/vite), [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables).

## 4. Add public build variables

Under **Project Settings → Environment Variables**, add:

| Name | Value to obtain from Supabase |
| --- | --- |
| `VITE_SUPABASE_URL` | HTTPS project origin, such as `https://your-project.supabase.co`, with no path, username/password, query, or fragment |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable key from the project's API settings |

Select **Production** and only the other environments you intentionally support. Preview deployments should use a separate staging Supabase project; otherwise they write to production data. A legacy `VITE_SUPABASE_ANON_KEY` remains supported; the publishable key takes precedence after trimming. Never use a service-role/secret key or database password. All `VITE_` values used by the frontend are public in the bundle. Environment changes require a new build/deployment.

Do not copy `.env.local` into the repository or upload local database files. No additional environment-variable names are introduced for this release.

## 5. Verify Supabase configuration

Use the dashboard for the same project as the public URL/key:

1. **Authentication → Sign In / Providers → Anonymous Sign-Ins:** enable guest identities. Actual hosted integration tests verify that the currently configured project accepts them; repeat this check if switching to another backend.
2. **SQL Editor/migration workflow:** on a fresh project, apply complete files `202610270001_quiz_rooms.sql`, `202610270002_quiz_buzzer.sql`, then `202610270003_competition.sql`, in order. Existing Phase IV/V projects need no new migration. Do not rerun or edit applied migrations, reset tables, or grant broad permissions to bypass failures.
3. **Data API/API Settings → Exposed schemas:** ensure `public` is exposed and `quiz_private` is not. Private host credentials/receipts must not become public resources.
4. **Database → Publications → supabase_realtime:** confirm `quiz_rooms`, `quiz_players`, `quiz_buzzer`, `quiz_teams`, `quiz_matches`, `quiz_competition` are included. Migrations install these; inspect settings if hosted events fail.
5. **Database/Security Advisor:** verify RLS and review findings. Local catalog assertions and hosted negative tests do not inspect every live administrative setting.
6. **Authentication → URL Configuration:** set/review Site URL as the intended final HTTPS production origin once known. Keep redirect allowlists limited to flows/origins actually used. Current anonymous sign-in uses no email/OAuth redirect callback; no new callback route, wildcard redirect, or arbitrary CORS relaxation is needed. Changing Site URL alone does not test guest authentication. [Supabase redirect URL documentation](https://supabase.com/docs/guides/auth/redirect-urls).
7. **Authentication → Rate Limits / Abuse Protection:** inspect actual anonymous-signup limits and test fresh students behind the school IP. Supabase documents a default 30 anonymous signups per IP/hour. This client does not supply CAPTCHA tokens; coordinate any future CAPTCHA enforcement with client implementation. Do not enable a CAPTCHA requirement alone. Review abuse controls before unrestricted public use. [Supabase anonymous Auth documentation](https://supabase.com/docs/guides/auth/auth-anonymous).
8. Review backups, retention, project connection/message/database quotas, and ownership access before student admission. No settings or destructive cleanup were changed during release verification.

For a deliberate custom Supabase domain, also update the CSP `connect-src` in `vercel.json` to allow that exact HTTPS/WebSocket origin and rerun static/browser checks. The default policy supports the current hosted `*.supabase.co` endpoints.

## 6. Deploy after approval

Approve the chosen commit/configuration, then select **Deploy** (or approve the intended GitHub-integrated production deployment). Record the resulting HTTPS URL and deployment ID. Verify deployment logs show successful installation, TypeScript, and Vite output into `dist/`. Do not declare production verification complete based only on a green build.

## 7. Verify backend connectivity on the deployed URL

Open a fresh independent browser session on that exact HTTPS URL. Create a host room, confirm **Connected** and the room code, and refresh. Open a separate independently created browser/private session; join by code and confirm the roster appears without refresh. Inspect browser Network/Console for Auth, RPC, Realtime, asset, or CSP failures. Public publishable keys are expected; privileged keys and session/host credentials in console logs or URLs are not.

## 8. Verify actual-device multiplayer

Use at least two separate student phones and one host. Assign teams, open a question, have both students buzz, confirm one authoritative winner and the other's lockout on every screen, award/deduct points, advance a question and a round, and finish a match. Compare frozen final results. Reconnect and start a new match to verify assignments/history persist. Follow [the complete acceptance checklist](ACCEPTANCE.md), including school Wi-Fi load and interruptions. Independent tabs are useful automated evidence but do not certify physical phones/network capacity.

## 9. Verify refreshes and deep links

Refresh `/`, `/host`, `/host/`, `/player`, `/player/`, and existing hash links. Use the original host/player tab when checking session restoration. Open the same dashboard link in a fresh browser: it must ask to host/join, not grant access through a URL or room code. Verify JavaScript/CSS are served with the correct MIME type and missing asset paths return 404.

## 10. Accept or roll back

Record acceptance outcomes, devices, participant count, and errors against the deployment/commit. Admit real students only after production-origin Auth, rate limits/abuse controls, and the club pilot pass. If a new deployment fails, use Vercel's existing deployment history to restore the last verified frontend, then diagnose. Do not reset or reverse database migrations/data as a frontend rollback. Keep the original moderator tab available: session clearing does not provide host recovery. No automatic rollback, push, tag, or release action is performed by this repository.
