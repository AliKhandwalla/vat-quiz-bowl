# Real VAT session acceptance checklist

Run on the final deployed HTTPS URL before public use. Record date, app commit/deployment, Supabase project, host browser, student device/browser models, school network, participant count, and any failures. Use synthetic student names until privacy/retention policy is agreed. The checks below are **manual work still required**, not claimed completed by the automated suite.

## Full match

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Host opens a fresh independent browser session and selects Host a Game. | One room is created, six-character code displayed, connected status, initial paused match. Refresh retains host authority. |
| 2 | Intended number of students join from separate phones/browsers using the code and distinct names. | Everyone appears automatically with preference and online status; new members are unassigned. No refresh needed. Invalid code produces a clear error. Repeat submission/refresh creates no extra membership for the same identity. |
| 3 | Host creates/renames teams and assigns students. | Every device shows the assigned team and leaderboard. Students cannot assign themselves through the API. |
| 4 | Host opens buzzers. | All students show Ready for the same round/question. The large touch button fits the phone without horizontal scrolling. Keyboard focus is visible. |
| 5 | Several students press together; include touch, mouse, Space, and rapid repeat presses. | Exactly one server-accepted winner; no duplicate action or visual winner chosen before confirmation. Space in name/input/select controls does not buzz. |
| 6 | Compare all screens. | Winner's name/team and locked-out states agree on every participant; no automatic points. Account for network arrival order differing from physical press order. |
| 7 | Host awards +10, deducts −5, applies a custom integer, and overrides scoring team once. | Each intended adjustment applies once. Try a disallowed decimal/over-limit value; it should be rejected clearly. |
| 8 | Compare leaderboard on all phones. | Same points, correct descending ranks and ties, no stale score on refresh. |
| 9 | Host advances a question, then a round; also pause/reset once. | Correct counters, all buzzers unlocked only when open, old winner cleared, paused presses rejected, reset remains the same question. |
| 10 | Host ends match and confirms. | Joining closes; buzzing/scoring/team mutation disable; final question is counted once. |
| 11 | Compare summaries, then start a new match. | All devices display identical frozen final scores/ranks/time. New match scores/counters reset, assignments remain, previous result stays unchanged. |
| 12 | Refresh/reconnect host and students, including the ended summary and new match. | Original tab sessions retain identity and team; authoritative state/winner/history return; no duplicate players. Closing/clearing a session is intentionally not account recovery. |

## Network, mobile, and security checks

- On one actual phone, disable Wi-Fi/mobile data mid-question. Retain the last confirmed result, show understandable disconnection feedback, and prevent unconfirmed/offline interactions from appearing accepted. Let the host advance while it is offline; restore network and verify it receives the latest question and winner. Repeat with a score response lost and the host's saved-action retry; points must not double.
- Suspend a student tab/lock the phone for more than 75 seconds. Verify retained offline membership, correct team after return, and automatic state recovery. Repeat after a school Wi-Fi roam/drop and after a long idle period.
- Test portrait and landscape at small phone, large phone, tablet, and desktop sizes; actual iOS Safari and Android Chrome. Confirm no horizontal scrolling, readable winner/lockout text, easy tapping, keyboard-only navigation, visible focus, and useful status announcements with the school's screen reader.
- Navigate repeatedly between existing hash pages; refresh `/host`, `/player`, and trailing-slash aliases. Check browser Network/Console for repeated sockets, auth failures, unexpected requests, CSP errors, or leaked credentials. A public publishable/anon key in a bundle is expected; a service-role/secret key is not.
- Use an unrelated signed guest: try reading the private room before joining, direct DML, host control using the room code, and score/match RPCs. All must be denied. Joining an open room using its code intentionally grants member access; the code never grants host rights. Close joining and confirm existing members can reconnect while new ones cannot join.
- Run at expected full-club size and duration on school Wi-Fi, including all fresh signups behind the shared IP. Record join failures, approximate winner-delivery time, Realtime connections/message usage and database utilization in Supabase. Do not infer capacity from the small automated contention tests.

## Owner sign-off before public use

- [ ] Final-domain anonymous Auth and Vercel env/route/security-header checks pass.
- [ ] School shared-IP signup capacity and anonymous/room creation abuse controls resolved; CAPTCHA configuration matches implemented client support.
- [ ] Full match, physical-device network interruption, background/reconnect, and class-sized pilot pass.
- [ ] Supabase Security Advisor, private schema exposure, backups, quotas, and data retention reviewed.
- [ ] Historical repository screenshots and student names reviewed for publication privacy.
- [ ] Session-only host recovery limitation explained to moderators; keep the original host tab available.
