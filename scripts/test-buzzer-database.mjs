import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

export async function testBuzzerDatabase(postgres, admin) {
  const connections = [];
  async function connection(id) {
    const db = postgres.getPgClient();
    await db.connect();
    connections.push(db);
    await db.query(
      "select set_config('application_name', 'vat-buzzer-test', false)",
    );
    await db.query("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      id,
    ]);
    return db;
  }
  async function actor(name) {
    const id = randomUUID();
    await admin.query("insert into auth.users values ($1)", [id]);
    return { id, name, db: await connection(id) };
  }
  async function rpc(actor, fn, args) {
    return (
      await actor.db.query(
        `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`,
        args,
      )
    ).rows[0].value;
  }
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function blocked(count) {
    const end = Date.now() + 8_000;
    while (Date.now() < end) {
      await admin.query('select pg_stat_clear_snapshot()');
      const result = await admin.query(
        "select count(*)::integer as count from pg_stat_activity where application_name = 'vat-buzzer-test' and wait_event_type = 'Lock'",
      );
      if (result.rows[0].count >= count) return;
      await delay(10);
    }
    throw new Error(
      `Expected ${count} genuinely concurrent, row-lock-blocked requests`,
    );
  }
  try {
    const host = await actor("Host"),
      outsider = await actor("Outsider");
    const players = [];
    for (let i = 0; i < 8; i++) players.push(await actor(`Player ${i + 1}`));
    const token = randomBytes(32).toString("hex");
    const room = await rpc(host, "create_quiz_room", [randomUUID(), token]);
    for (const player of players) {
      const joined = await rpc(player, "join_quiz_room", [
        room.code,
        player.name,
        players.indexOf(player) % 2 ? "Gold" : "Blue",
      ]);
      player.playerId = joined.player.id;
    }
    const snapshot = (actor) =>
      rpc(actor, "get_quiz_room", [room.id, actor === host ? token : null]);
    const initial = await snapshot(host);
    if (initial.competition) {
      for (let i=0;i<players.length;i++) {
        const team=initial.teams.find(t=>t.name===(i%2?'Gold':'Blue'));
        await rpc(host,'manage_quiz_competition',[room.id,token,initial.match.id,randomUUID(),'assign_player',{player_id:players[i].playerId,team_id:team.id}]);
      }
    }
    let state = (await snapshot(host)).buzzer;
    const control = (action) =>
      rpc(host, "control_quiz_buzzer", [
        room.id,
        token,
        state.round_id,
        action,
      ]);
    const buzz = (player, roundId = state.round_id) =>
      rpc(player, "submit_quiz_buzz", [room.id, roundId]);

    assert.equal(state.status, "paused");
    assert.equal(state.round_number, 0);
    assert.equal((await buzz(players[0])).reason, "paused");
    const initialRound = state.round_id;
    state = await control("start");
    assert.notEqual(state.round_id, initialRound);
    assert.equal(state.round_number, 1);
    assert.equal(state.status, "ready");
    const won = await buzz(players[0]);
    assert.equal(won.accepted, true);
    assert.equal(won.buzzer.winning_player_id, players[0].playerId);
    assert.equal(won.buzzer.winning_name, players[0].name);
    assert.ok(won.buzzer.winning_at);
    assert.equal((await buzz(players[0])).reason, "duplicate");
    assert.equal((await buzz(players[1])).reason, "locked");
    state = won.buzzer;
    await assert.rejects(control("pause"), /ROUND_LOCKED/);
    await rpc(players[0], "join_quiz_room", [
      room.code,
      "Renamed after winning",
      "Different team",
    ]);
    assert.equal((await snapshot(host)).buzzer.winning_name, "Player 1");
    assert.equal((await snapshot(host)).buzzer.winning_team, "Blue");
    console.log(
      "PASS buzzer: initial paused, single winner, duplicate/late rejection, frozen winner identity",
    );

    const oldRound = state.round_id;
    state = await control("reset");
    assert.equal(state.status, "ready");
    assert.equal(state.winning_player_id, null);
    assert.notEqual(state.round_id, oldRound);
    assert.equal((await buzz(players[1], oldRound)).reason, "stale_round");
    const pausedId = state.round_id;
    state = await control("pause");
    assert.equal(state.status, "paused");
    assert.equal(state.round_id, pausedId);
    assert.equal((await buzz(players[0])).accepted, false);
    state = await control("start");
    assert.notEqual(state.round_id, pausedId);
    assert.equal((await buzz(players[0], pausedId)).reason, "stale_round");
    console.log(
      "PASS buzzer: reset/start advance IDs, pause preserves ID, stale and paused attempts cannot win",
    );

    // Hold the row until EVERY contender is demonstrably waiting on a DB lock.
    // These are separate PostgreSQL connections, not serialized calls on one client.
    for (const count of [2, 8]) {
      state = await control("reset");
      await admin.query("begin");
      await admin.query(
        "select room_id from public.quiz_buzzer where room_id = $1 for update",
        [room.id],
      );
      const pending = Promise.all(
        players.slice(0, count).map((player) => buzz(player)),
      );
      void pending.catch(() => {});
      try {
        await blocked(count);
      } finally {
        await admin.query("commit");
      }
      const results = await pending;
      assert.equal(results.filter((result) => result.accepted).length, 1);
      const winningId = results.find((result) => result.accepted).buzzer
        .winning_player_id;
      assert.ok(
        results.every(
          (result) => result.buzzer.winning_player_id === winningId,
        ),
      );
      state = (await snapshot(host)).buzzer;
      assert.equal(state.winning_player_id, winningId);
      console.log(
        `PASS buzzer: ${count} simultaneous requests on separate DB connections, exactly one accepted`,
      );
    }

    // Queue a reset FIRST, then an old-round buzz behind the same held row lock.
    // A request started before the reset must see the updated row after waiting.
    state = await control("reset");
    const delayedId = state.round_id;
    await admin.query("begin");
    await admin.query(
      "select room_id from public.quiz_buzzer where room_id = $1 for update",
      [room.id],
    );
    const resetPending = control("reset");
    void resetPending.catch(() => {});
    await blocked(1);
    const oldPending = buzz(players[0], delayedId);
    void oldPending.catch(() => {});
    try {
      await blocked(2);
    } finally {
      await admin.query("commit");
    }
    state = await resetPending;
    const delayed = await oldPending;
    assert.equal(delayed.accepted, false);
    assert.equal(delayed.reason, "stale_round");
    assert.equal(delayed.buzzer.round_id, state.round_id);
    assert.equal(delayed.buzzer.winning_player_id, null);
    const retryReset = await Promise.allSettled([
      rpc(host, "control_quiz_buzzer", [
        room.id,
        token,
        state.round_id,
        "reset",
      ]),
      rpc(host, "control_quiz_buzzer", [
        room.id,
        token,
        state.round_id,
        "reset",
      ]),
    ]);
    assert.equal(
      retryReset.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.match(
      retryReset.find((result) => result.status === "rejected").reason.message,
      /STALE_ROUND/,
    );
    state = (await snapshot(host)).buzzer;
    console.log(
      "PASS buzzer: delayed pre-reset request rejected after waiting; duplicate host requests cannot double-advance",
    );

    for (const action of ["start", "pause", "reset"]) {
      await assert.rejects(
        rpc(players[0], "control_quiz_buzzer", [
          room.id,
          token,
          state.round_id,
          action,
        ]),
        /HOST_UNAUTHORIZED/,
      );
    }
    await assert.rejects(
      rpc(host, "control_quiz_buzzer", [
        room.id,
        room.code,
        state.round_id,
        "reset",
      ]),
      /HOST_UNAUTHORIZED/,
    );
    await assert.rejects(buzz(outsider), /NOT_A_MEMBER/);
    await assert.rejects(buzz(host), /NOT_A_MEMBER/);
    await assert.rejects(
      players[0].db.query(
        "update public.quiz_buzzer set status = 'paused' where room_id = $1",
        [room.id],
      ),
      /permission denied/,
    );
    await assert.rejects(
      players[0].db.query(
        "update public.quiz_buzzer set winning_player_id = $1 where room_id = $2",
        [players[1].playerId, room.id],
      ),
      /permission denied/,
    );
    await assert.rejects(
      rpc(players[0], "submit_quiz_buzz", [
        room.id,
        state.round_id,
        players[1].playerId,
      ]),
      /does not exist/,
    );
    const hidden = await outsider.db.query(
      "select * from public.quiz_buzzer where room_id = $1",
      [room.id],
    );
    assert.equal(hidden.rowCount, 0);
    await admin.query("set role anon");
    await assert.rejects(
      admin.query("select public.submit_quiz_buzz($1, $2)", [
        room.id,
        state.round_id,
      ]),
      /permission denied/,
    );
    await admin.query("reset role");
    console.log(
      "PASS buzzer security: host-only controls, no impersonation, no direct writes, outsiders and anon denied",
    );

    const final = await buzz(players[3]);
    assert.equal(final.accepted, true);
    await players[0].db.end();
    connections.splice(connections.indexOf(players[0].db), 1);
    players[0].db = await connection(players[0].id);
    const restored = await snapshot(players[0]);
    assert.equal(restored.players.length, players.length);
    assert.equal(restored.buzzer.round_id, final.buzzer.round_id);
    assert.equal(
      restored.buzzer.winning_player_id,
      final.buzzer.winning_player_id,
    );
    assert.equal(restored.buzzer.status, "locked");
    console.log(
      "PASS buzzer: reconnected participant reads the same authoritative round and winner",
    );
  } finally {
    await admin.query("rollback");
    await admin.query("reset role");
    await Promise.allSettled(connections.map((db) => db.end()));
  }
}
