// Executes the real migration and authorization checks in a disposable local
// PostgreSQL cluster. Supabase Auth and publication metadata are bootstrapped;
// this does not substitute for the separate hosted Realtime integration test.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, mkdir, mkdtemp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import { testBuzzerDatabase } from "./test-buzzer-database.mjs";
import { testCompetitionDatabase } from './test-competition-database.mjs';

const testRoot = resolve(".test-db");
await mkdir(testRoot, { recursive: true });
const databaseDir = await mkdtemp(join(testRoot, "run-"));
assert.ok(
  databaseDir.startsWith(
    testRoot + (process.platform === "win32" ? "\\" : "/"),
  ),
);
const listener = createServer();
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const postgres = new EmbeddedPostgres({
  databaseDir,
  port,
  user: "postgres",
  password: randomBytes(24).toString("hex"),
  persistent: false,
  createPostgresUser: false,
  postgresFlags: [
    "-c",
    "listen_addresses=127.0.0.1",
    "-c",
    "wal_level=logical",
  ],
  onLog: () => {},
  onError: (message) => {
    if (/error|fatal/i.test(String(message))) console.error(String(message));
  },
});
let db;
try {
  await postgres.initialise();
  await postgres.start();
  db = postgres.getPgClient();
  await db.connect();
  await db.query(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create publication supabase_realtime;
  `);
  await db.query(
    await readFile("supabase/migrations/202610270001_quiz_rooms.sql", "utf8"),
  );
  await db.query(
    await readFile("supabase/migrations/202610270002_quiz_buzzer.sql", "utf8"),
  );
  console.log("PASS migration executes in PostgreSQL");

  const host = randomUUID(),
    player = randomUUID(),
    outsider = randomUUID();
  for (const id of [host, player, outsider])
    await db.query("insert into auth.users values ($1)", [id]);
  async function user(id, operation) {
    await db.query("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      id,
    ]);
    try {
      return await operation();
    } finally {
      await db.query("reset role");
    }
  }
  async function rpc(name, args) {
    const result = await db.query(
      `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`,
      args,
    );
    return result.rows[0].value;
  }
  const token = randomBytes(32).toString("hex"),
    request = randomUUID();
  const room = await user(host, () =>
    rpc("create_quiz_room", [request, token]),
  );
  assert.match(room.code, /^[A-HJ-NP-Z2-9]{6}$/);
  const retried = await user(host, () =>
    rpc("create_quiz_room", [request, token]),
  );
  assert.equal(room.id, retried.id);
  await assert.rejects(
    user(outsider, () => rpc("create_quiz_room", [request, token])),
    /HOST_UNAUTHORIZED/,
  );
  console.log(
    "PASS random room code, idempotent creation, credential ownership",
  );

  const joined = await user(player, () =>
    rpc("join_quiz_room", [
      room.code.toLowerCase(),
      "  Alex Morgan  ",
      "Science Team",
    ]),
  );
  const duplicate = await user(player, () =>
    rpc("join_quiz_room", [room.code, "Alex Morgan", "Science Team"]),
  );
  assert.equal(joined.player.id, duplicate.player.id);
  assert.equal(joined.player.display_name, "Alex Morgan");
  let snapshot = await user(host, () => rpc("get_quiz_room", [room.id, token]));
  assert.equal(snapshot.players.length, 1);
  assert.equal(snapshot.is_host, true);
  assert.equal(snapshot.players[0].team_name, "Science Team");
  assert.equal(snapshot.players[0].user_id, undefined);
  const memberView = await user(player, () =>
    rpc("get_quiz_room", [room.id, null]),
  );
  assert.equal(memberView.is_host, false);
  console.log(
    "PASS joins, custom teams, duplicate-join idempotency, member snapshots",
  );

  const unknownCode = room.code === "ZZZZZZ" ? "YYYYYY" : "ZZZZZZ";
  await assert.rejects(
    user(outsider, () =>
      rpc("join_quiz_room", [unknownCode, "New Player", "Gold"]),
    ),
    /ROOM_NOT_FOUND/,
  );
  await assert.rejects(
    user(outsider, () => rpc("join_quiz_room", [room.code, " ", "Gold"])),
    /INVALID_INPUT/,
  );
  await assert.rejects(
    user(outsider, () => rpc("get_quiz_room", [room.id, null])),
    /NOT_A_MEMBER/,
  );
  const hidden = await user(outsider, () =>
    db.query("select * from public.quiz_rooms"),
  );
  assert.equal(hidden.rowCount, 0);
  const hiddenPlayers = await user(outsider, () =>
    db.query("select * from public.quiz_players"),
  );
  assert.equal(hiddenPlayers.rowCount, 0);
  await assert.rejects(
    user(player, () => db.query("select * from quiz_private.host_credentials")),
    /permission denied/,
  );
  await assert.rejects(
    user(player, () =>
      db.query("select quiz_private.assert_host($1,$2)", [room.id, token]),
    ),
    /permission denied/,
  );
  await assert.rejects(
    user(player, () =>
      db.query("update public.quiz_rooms set accepting_players = false"),
    ),
    /permission denied/,
  );
  await assert.rejects(
    user(player, () =>
      db.query("update public.quiz_players set display_name = 'Changed'"),
    ),
    /permission denied/,
  );
  await assert.rejects(
    user(player, () => rpc("set_quiz_room_joining", [room.id, token, false])),
    /HOST_UNAUTHORIZED/,
  );
  await assert.rejects(
    user(host, () => rpc("set_quiz_room_joining", [room.id, room.code, false])),
    /HOST_UNAUTHORIZED/,
  );
  await assert.rejects(
    user(player, () => rpc("quiz_room_heartbeat", [room.id, token])),
    /HOST_UNAUTHORIZED/,
  );
  console.log(
    "PASS room isolation, denied direct writes, hidden host secrets, denied forged host actions",
  );

  await user(host, () => rpc("set_quiz_room_joining", [room.id, token, false]));
  await assert.rejects(
    user(outsider, () => rpc("join_quiz_room", [room.code, "Other", "Gold"])),
    /ROOM_CLOSED/,
  );
  const resumed = await user(player, () =>
    rpc("join_quiz_room", [room.code, "Alex Morgan", "Science Team"]),
  );
  assert.equal(resumed.player.id, joined.player.id);
  await db.query(
    "update public.quiz_players set last_seen_at = now() - interval '2 minutes' where id = $1",
    [joined.player.id],
  );
  snapshot = await user(host, () => rpc("get_quiz_room", [room.id, token]));
  assert.equal(snapshot.players.length, 1);
  assert.ok(
    Date.parse(snapshot.server_time) -
      Date.parse(snapshot.players[0].last_seen_at) >
      75_000,
  );
  await user(player, () => rpc("quiz_room_heartbeat", [room.id, null]));
  snapshot = await user(host, () => rpc("get_quiz_room", [room.id, token]));
  assert.ok(
    Date.parse(snapshot.server_time) -
      Date.parse(snapshot.players[0].last_seen_at) <
      5_000,
  );
  assert.equal(snapshot.players[0].id, joined.player.id);
  await assert.rejects(
    user(outsider, () => rpc("quiz_room_heartbeat", [room.id, null])),
    /NOT_A_MEMBER/,
  );
  await user(host, () => rpc("set_quiz_room_joining", [room.id, token, true]));
  await user(outsider, () =>
    rpc("join_quiz_room", [room.code, "Other", "Gold"]),
  );
  const publication = await db.query(
    "select tablename from pg_publication_tables where pubname = 'supabase_realtime'",
  );
  assert.deepEqual(publication.rows.map((row) => row.tablename).sort(), [
    "quiz_buzzer",
    "quiz_players",
    "quiz_rooms",
  ]);
  await db.query("set role anon");
  await assert.rejects(
    rpc("create_quiz_room", [randomUUID(), token]),
    /permission denied/,
  );
  await db.query("reset role");
  console.log(
    "PASS host joining controls, retained offline records, reconnect heartbeats, publication, unauthenticated denial",
  );
  await testBuzzerDatabase(postgres, db);
  await db.query(await readFile('supabase/migrations/202610270003_competition.sql','utf8'));
  console.log('PASS Phase IV migration preserves populated Phase II/III rooms');
  await testCompetitionDatabase(postgres, db);
  await testBuzzerDatabase(postgres, db);
} finally {
  if (db) await db.end();
  // The only recursively removed path is the verified, newly created test
  // cluster under .test-db above. Never points at a user database.
  await postgres.stop();
}
