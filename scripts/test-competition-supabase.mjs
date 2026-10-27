import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function testCompetitionSupabase({
  host,
  player,
  outsider,
  room,
  token,
  makeClient,
}) {
  const subs = [];
  const rpc = async (client, fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
  };
  const snapshot = (client) =>
    rpc(client, "get_quiz_room", {
      p_room_id: room.id,
      p_host_token: client === host ? token : null,
    });
  let view = await snapshot(host);
  assert.ok(view.competition, "Apply 202610270003_competition.sql first.");
  const request = (client, match, action, payload, key = randomUUID()) =>
    rpc(client, "manage_quiz_competition", {
      p_room_id: room.id,
      p_host_token: token,
      p_match_id: match,
      p_request_id: key,
      p_action: action,
      p_payload: payload,
    });
  const lists = [];
  async function subscribe(client) {
    const events = [];
    const channel = client
      .channel(`competition-test-${randomUUID()}`, {
        config: { postgres_changes_options: { wait: true } },
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "quiz_competition",
          filter: `room_id=eq.${room.id}`,
        },
        (p) => events.push(p.new.revision),
      );
    subs.push({ client, channel });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Competition Realtime subscription timed out")),
        20000,
      );
      channel.subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        } else if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
          clearTimeout(timer);
          reject(new Error(error?.message || status));
        }
      });
    });
    return events;
  }
  async function delivered() {
    const until = Date.now() + 15000;
    while (!lists.every((e) => e.includes(view.competition.revision))) {
      if (Date.now() > until)
        throw new Error(
          "Competition state did not reach every independent subscriber",
        );
      await new Promise((r) => setTimeout(r, 50));
    }
    for (const c of [host, player, outsider]) {
      const s = await snapshot(c);
      assert.equal(s.competition.revision, view.competition.revision);
      assert.deepEqual(s.teams, view.teams);
      assert.equal(s.match.id, view.match.id);
    }
  }
  async function act(action, payload = {}, key = randomUUID()) {
    if (["next_question", "next_round"].includes(action))
      payload = { ...payload, expected_round_id: view.buzzer.round_id };
    view = await request(host, view.match.id, action, payload, key);
    await delivered();
    return view;
  }
  try {
    lists.push(
      await subscribe(host),
      await subscribe(player),
      await subscribe(outsider),
    );
    await act("create_team", { name: "Varsity" });
    const varsity = view.teams.find((t) => t.name === "Varsity").id;
    await act("rename_team", { team_id: varsity, name: "VAT Varsity" });
    const member = view.players.find(
      (p) => p.display_name === "[Test] Alex Morgan",
    );
    assert.ok(member);
    await act("assign_player", { player_id: member.id, team_id: varsity });
    const rejoin = await rpc(player, "join_quiz_room", {
      p_code: room.code,
      p_name: member.display_name,
      p_team: "Gold",
    });
    assert.equal(rejoin.player.team_id, varsity);
    view = await snapshot(host);
    const scoreKey = randomUUID(),
      matchId = view.match.id;
    await act("score", { team_id: varsity, delta: 10 }, scoreKey);
    await act("score", { team_id: varsity, delta: 10 }, scoreKey);
    assert.equal(view.teams.find((t) => t.id === varsity).score, 10);
    await act("score", { team_id: varsity, delta: -5 });
    await act("score", { team_id: varsity, delta: -12 });
    assert.equal(view.teams.find((t) => t.id === varsity).score, -7);
    await act("score", { team_id: varsity, delta: 17 });
    const blue = view.teams.find((t) => t.name === "Blue").id,
      gold = view.teams.find((t) => t.name === "Gold").id;
    await act("score", { team_id: blue, delta: 10 });
    await act("score", { team_id: gold, delta: -5 });
    await act("set_shortcuts", { values: [20, 10, -5] });
    console.log(
      "PASS live competition: team create/rename/assignment, reconnect retention, positive/negative/custom scores, idempotency and Realtime on all clients",
    );
    for (const action of ["score", "assign_player", "end_match"])
      await assert.rejects(
        request(player, view.match.id, action, {
          team_id: varsity,
          delta: 100,
          player_id: member.id,
        }),
        /HOST_UNAUTHORIZED/,
      );
    const forbidden = await player
      .from("quiz_teams")
      .update({ score: 500 })
      .eq("id", varsity);
    assert.ok(forbidden.error);
    await rpc(host, "control_quiz_buzzer", {
      p_room_id: room.id,
      p_host_token: token,
      p_expected_round: view.buzzer.round_id,
      p_action: "start",
    });
    view = await snapshot(host);
    const buzz = await rpc(player, "submit_quiz_buzz", {
      p_room_id: room.id,
      p_round_id: view.buzzer.round_id,
    });
    assert.equal(buzz.accepted, true);
    assert.equal(buzz.buzzer.winning_team_id, varsity);
    const old = view.buzzer.round_id,
      beforeScore = view.teams.find((t) => t.id === varsity).score;
    view = await snapshot(host);
    assert.equal(view.teams.find((t) => t.id === varsity).score, beforeScore);
    const oldQuestion = view.match.question_number;
    await act("next_question");
    assert.equal(view.match.question_number, oldQuestion + 1);
    assert.equal(view.buzzer.status, "ready");
    assert.equal(view.buzzer.winning_player_id, null);
    assert.equal(
      (
        await rpc(player, "submit_quiz_buzz", {
          p_room_id: room.id,
          p_round_id: old,
        })
      ).reason,
      "stale_round",
    );
    const beforeRound = view.match.round_number;
    await act("next_round");
    assert.equal(view.match.round_number, beforeRound + 1);
    assert.equal(view.match.question_number, 1);
    console.log(
      "PASS live competition: host-only scoring, winning-team ID, no automatic points, synchronized question/round advance and stale buzz rejection",
    );
    const completed = view.match.questions_completed;
    await act("end_match");
    assert.equal(view.match.status, "ended");
    assert.equal(view.match.questions_completed, completed + 1);
    assert.ok(view.match.ended_at);
    assert.equal(
      view.match.final_results.filter((t) => t.rank === 1).length,
      2,
    );
    const final = JSON.stringify(view.match.final_results),
      endedId = view.match.id;
    assert.equal(
      (
        await rpc(player, "submit_quiz_buzz", {
          p_room_id: room.id,
          p_round_id: view.buzzer.round_id,
        })
      ).reason,
      "match_ended",
    );
    await assert.rejects(
      request(host, view.match.id, "score", { team_id: varsity, delta: 10 }),
      /MATCH_ENDED/,
    );
    await act("new_match");
    assert.equal(view.match.status, "active");
    assert.equal(view.match.question_number, 0);
    assert.equal(view.match.round_number, 1);
    assert.equal(view.match.questions_completed, 0);
    assert.equal(view.buzzer.status, "paused");
    assert.ok(view.teams.every((t) => t.score === 0));
    assert.equal(view.players.find((p) => p.id === member.id).team_id, varsity);
    assert.equal(
      JSON.stringify(view.history.find((m) => m.id === endedId).final_results),
      final,
    );
    const lateRetry = await request(
      host,
      matchId,
      "score",
      { team_id: varsity, delta: 10 },
      scoreKey,
    );
    assert.ok(lateRetry.teams.every((t) => t.score === 0));
    const recovered = makeClient();
    const { data: saved } = await player.auth.getSession();
    const { error } = await recovered.auth.setSession({
      access_token: saved.session.access_token,
      refresh_token: saved.session.refresh_token,
    });
    if (error) throw new Error(error.message);
    const restored = await snapshot(recovered);
    assert.equal(restored.match.id, view.match.id);
    assert.equal(
      restored.players.find((p) => p.id === member.id).team_id,
      varsity,
    );
    assert.deepEqual(restored.teams, view.teams);
    assert.equal(
      JSON.stringify(
        restored.history.find((m) => m.id === endedId).final_results,
      ),
      final,
    );
    console.log(
      "PASS live competition: tied final summary, ended-match locks, atomic new-match reset, immutable prior results and full reconnect recovery",
    );
  } finally {
    await Promise.allSettled(
      subs.map(({ client, channel }) => client.removeChannel(channel)),
    );
  }
}
