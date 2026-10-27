import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
export async function testCompetitionDatabase(postgres, admin) {
  const connections = [];
  async function actor(id = randomUUID()) {
    await admin.query(
      "insert into auth.users values ($1) on conflict do nothing",
      [id],
    );
    const db = postgres.getPgClient();
    await db.connect();
    connections.push(db);
    await db.query("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    return { id, db };
  }
  const rpc = async (who, fn, args) =>
    (
      await who.db.query(
        `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`,
        args,
      )
    ).rows[0].value;
  try {
    const host = await actor(),
      player = await actor(),
      outsider = await actor(),
      host2 = await actor(host.id),
      token = randomBytes(32).toString("hex");
    const room = await rpc(host, "create_quiz_room", [randomUUID(), token]);
    const joined = await rpc(player, "join_quiz_room", [
      room.code,
      "Alex",
      "Gold",
    ]);
    assert.equal(joined.player.team_id, null);
    assert.equal(joined.player.requested_team_name, "Gold");
    const snapshot = (who) =>
      rpc(who, "get_quiz_room", [
        room.id,
        who === host || who === host2 ? token : null,
      ]);
    let view = await snapshot(host);
    const mutate = (who, match, action, payload, key = randomUUID()) =>
      rpc(who, "manage_quiz_competition", [
        room.id,
        token,
        match,
        key,
        action,
        payload,
      ]);
    async function act(action, payload = {}, key = randomUUID()) {
      if (["next_question", "next_round"].includes(action))
        payload = { ...payload, expected_round_id: view.buzzer.round_id };
      view = await mutate(host, view.match.id, action, payload, key);
      return view;
    }
    const blue = view.teams.find((t) => t.name === "Blue").id,
      gold = view.teams.find((t) => t.name === "Gold").id;
    const score = (id) => view.teams.find((t) => t.id === id).score;
    assert.ok(view.teams.every((t) => t.score === 0));
    await act("create_team", { name: "Green" });
    const green = view.teams.find((t) => t.name === "Green").id;
    await act("rename_team", { team_id: blue, name: "A Team" });
    await act("assign_player", { player_id: joined.player.id, team_id: blue });
    assert.equal(view.players[0].team_name, "A Team");
    const rejoin = await rpc(player, "join_quiz_room", [
      room.code,
      "Alex",
      "Gold",
    ]);
    assert.equal(rejoin.player.id, joined.player.id);
    assert.equal(rejoin.player.team_id, blue);
    await act("assign_player", { player_id: joined.player.id, team_id: green });
    await assert.rejects(
      act("remove_team", { team_id: green }),
      /TEAM_NOT_EMPTY/,
    );
    await act("assign_player", { player_id: joined.player.id, team_id: blue });
    await act("score", { team_id: green, delta: 5 });
    await assert.rejects(
      act("remove_team", { team_id: green }),
      /TEAM_HAS_SCORE/,
    );
    await act("score", { team_id: green, delta: -5 });
    await act("remove_team", { team_id: green });
    assert.ok(!view.teams.some((t) => t.id === green));
    await assert.rejects(
      act("create_team", { name: "a team" }),
      /TEAM_NAME_TAKEN/,
    );
    console.log(
      "PASS competition: team create/rename/assign/archive; reconnect preserves host assignment",
    );
    const key = randomUUID(),
      matchId = view.match.id;
    await act("score", { team_id: blue, delta: 10 }, key);
    await act("score", { team_id: blue, delta: 10 }, key);
    assert.equal(score(blue), 10);
    await assert.rejects(
      act("score", { team_id: blue, delta: 5 }, key),
      /REQUEST_CONFLICT/,
    );
    await act("score", { team_id: blue, delta: -5 });
    await act("score", { team_id: blue, delta: -12 });
    assert.equal(score(blue), -7);
    assert.equal(view.teams[0].id, gold);
    for (const delta of [0, 1.2, 10001, "10"])
      await assert.rejects(
        act("score", { team_id: blue, delta }),
        /INVALID_SCORE/,
      );
    await act("score", { team_id: blue, delta: 17 });
    await Promise.all([
      mutate(host, matchId, "score", { team_id: blue, delta: 5 }),
      mutate(host2, matchId, "score", { team_id: blue, delta: 5 }),
    ]);
    view = await snapshot(host);
    assert.equal(score(blue), 20);
    await act("score", { team_id: gold, delta: 20 });
    await act("set_shortcuts", { values: [15, 10, -5] });
    assert.deepEqual(view.competition.scoring_shortcuts, [15, 10, -5]);
    await assert.rejects(
      act("set_shortcuts", { values: [10, 0, -5] }),
      /INVALID_SCORE/,
    );
    console.log(
      "PASS competition: awards/deductions/negative scores, validation, shortcuts, duplicate and concurrent scoring",
    );
    await rpc(host, "control_quiz_buzzer", [
      room.id,
      token,
      view.buzzer.round_id,
      "start",
    ]);
    view = await snapshot(host);
    assert.equal(view.match.question_number, 1);
    const win = await rpc(player, "submit_quiz_buzz", [
      room.id,
      view.buzzer.round_id,
    ]);
    assert.equal(win.accepted, true);
    assert.equal(win.buzzer.winning_team_id, blue);
    view = await snapshot(host);
    assert.equal(score(blue), 20);
    const old = view.buzzer.round_id;
    await act("next_question");
    assert.equal(view.match.question_number, 2);
    assert.equal(view.match.questions_completed, 1);
    assert.equal(view.buzzer.status, "ready");
    assert.equal(view.buzzer.winning_player_id, null);
    assert.equal(
      (await rpc(player, "submit_quiz_buzz", [room.id, old])).reason,
      "stale_round",
    );
    await act("next_round");
    assert.equal(view.match.round_number, 2);
    assert.equal(view.match.question_number, 1);
    assert.equal(view.match.questions_completed, 2);
    const expected = view.buzzer.round_id;
    const outcomes = await Promise.allSettled([
      mutate(host, matchId, "next_question", { expected_round_id: expected }),
      mutate(host2, matchId, "next_question", { expected_round_id: expected }),
    ]);
    assert.equal(outcomes.filter((v) => v.status === "fulfilled").length, 1);
    assert.match(
      outcomes.find((v) => v.status === "rejected").reason.message,
      /STALE_ROUND/,
    );
    view = await snapshot(host);
    console.log(
      "PASS competition: counters, safe buzzer resets, no automatic points, stale buzz and concurrent advance rejection",
    );
    for (const [action, payload] of [
      ["score", { team_id: blue, delta: 10 }],
      ["assign_player", { player_id: joined.player.id, team_id: gold }],
      ["end_match", {}],
    ])
      await assert.rejects(
        mutate(player, matchId, action, payload),
        /HOST_UNAUTHORIZED/,
      );
    await assert.rejects(
      player.db.query("update public.quiz_teams set score=100"),
      /permission denied/,
    );
    await assert.rejects(
      player.db.query("update public.quiz_players set team_id=$1", [gold]),
      /permission denied/,
    );
    await assert.rejects(
      host.db.query("update public.quiz_matches set question_number=99"),
      /permission denied/,
    );
    await assert.rejects(
      player.db.query("select quiz_private.control_buzzer_v3($1,$2,$3,$4)", [
        room.id,
        token,
        view.buzzer.round_id,
        "reset",
      ]),
      /permission denied/,
    );
    for (const table of ["quiz_teams", "quiz_matches", "quiz_competition"])
      assert.equal(
        (
          await outsider.db.query(
            `select * from public.${table} where room_id=$1`,
            [room.id],
          )
        ).rowCount,
        0,
      );
    console.log(
      "PASS competition security: host-only operations, direct writes/private wrappers denied, RLS room isolation",
    );
    const completed = view.match.questions_completed,
      oldAtEnd = view.buzzer.round_id;
    await act("end_match");
    assert.equal(view.match.status, "ended");
    assert.equal(view.match.questions_completed, completed + 1);
    assert.ok(view.match.ended_at);
    assert.ok(
      view.match.final_results.every((t) => t.rank === 1 && t.score === 20),
    );
    const final = JSON.stringify(view.match.final_results),
      endedId = view.match.id;
    assert.equal(
      (await rpc(player, "submit_quiz_buzz", [room.id, oldAtEnd])).reason,
      "match_ended",
    );
    await assert.rejects(
      act("score", { team_id: blue, delta: 10 }),
      /MATCH_ENDED/,
    );
    await assert.rejects(
      rpc(host, "control_quiz_buzzer", [
        room.id,
        token,
        view.buzzer.round_id,
        "start",
      ]),
      /MATCH_ENDED/,
    );
    await assert.rejects(
      rpc(outsider, "join_quiz_room", [room.code, "Late", "Blue"]),
      /MATCH_ENDED/,
    );
    assert.equal(
      (await rpc(player, "join_quiz_room", [room.code, "Alex", "Gold"])).player
        .team_id,
      blue,
    );
    await act("new_match");
    assert.notEqual(view.match.id, endedId);
    assert.equal(view.match.match_number, 2);
    assert.equal(view.match.round_number, 1);
    assert.equal(view.match.question_number, 0);
    assert.equal(view.match.questions_completed, 0);
    assert.equal(view.buzzer.status, "paused");
    assert.ok(view.teams.every((t) => t.score === 0));
    assert.equal(view.players[0].team_id, blue);
    assert.deepEqual(view.competition.scoring_shortcuts, [15, 10, -5]);
    assert.equal(
      JSON.stringify(view.history.find((m) => m.id === endedId).final_results),
      final,
    );
    await assert.rejects(
      mutate(host, endedId, "score", { team_id: blue, delta: 10 }),
      /STALE_MATCH/,
    );
    const retryOld = await mutate(
      host,
      endedId,
      "score",
      { team_id: blue, delta: 10 },
      key,
    );
    assert.ok(retryOld.teams.every((t) => t.score === 0));
    await act("rename_team", { team_id: blue, name: "New match name" });
    assert.equal(
      JSON.stringify(view.history.find((m) => m.id === endedId).final_results),
      final,
    );
    const restored = await snapshot(player);
    assert.equal(restored.players.length, 1);
    assert.equal(restored.players[0].team_id, blue);
    assert.equal(restored.match.id, view.match.id);
    console.log(
      "PASS competition: atomic end/tied results, ended restrictions, new-match reset, immutable history, retained teams/players and reconnect",
    );
  } finally {
    await Promise.allSettled(connections.map((c) => c.end()));
  }
}
