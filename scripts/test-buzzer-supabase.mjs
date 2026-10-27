import assert from "node:assert/strict";

// Called by the existing live integration suite to reuse its independent guest
// sessions. Adds one guest, plus a restored client for the SAME player identity.
export async function testBuzzerSupabase({
  host,
  player,
  outsider,
  room,
  token,
  makeClient,
}) {
  const subscriptions = [];
  const rpc = async (client, name, args) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  };
  const snapshot = (client) =>
    rpc(client, "get_quiz_room", {
      p_room_id: room.id,
      p_host_token: client === host ? token : null,
    });
  let state = (await snapshot(host)).buzzer;
  assert.ok(
    state,
    "Apply 202610270002_quiz_buzzer.sql before the live buzzer tests.",
  );
  const control = (action) =>
    rpc(host, "control_quiz_buzzer", {
      p_room_id: room.id,
      p_host_token: token,
      p_expected_round: state.round_id,
      p_action: action,
    });
  const buzz = (client, roundId = state.round_id) =>
    rpc(client, "submit_quiz_buzz", {
      p_room_id: room.id,
      p_round_id: roundId,
    });
  async function subscribe(client) {
    const events = [];
    const channel = client
      .channel(`buzzer-test-${crypto.randomUUID()}`, {
        config: { postgres_changes_options: { wait: true } },
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "quiz_buzzer",
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => events.push(payload.new),
      );
    subscriptions.push({ client, channel, events });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              "Buzzer Realtime subscription timed out. Check publication/RLS.",
            ),
          ),
        20_000,
      );
      channel.subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        } else if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
          clearTimeout(timer);
          reject(
            new Error(
              `Buzzer subscription failed: ${error?.message || status}`,
            ),
          );
        }
      });
    });
    return events;
  }
  async function delivered(eventLists, expected) {
    const deadline = Date.now() + 15_000;
    while (
      !eventLists.every((events) =>
        events.some(
          (next) =>
            next.revision === expected.revision &&
            next.round_id === expected.round_id &&
            next.status === expected.status &&
            next.winning_player_id === expected.winning_player_id,
        ),
      )
    ) {
      if (Date.now() > deadline)
        throw new Error(
          "Not every participant received the authoritative buzzer event.",
        );
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  try {
    const eventLists = [await subscribe(host), await subscribe(player)];
    assert.equal((await buzz(player)).reason, "paused");
    await assert.rejects(buzz(outsider), /NOT_A_MEMBER/);
    for (const action of ["start", "pause", "reset"]) {
      await assert.rejects(
        rpc(player, "control_quiz_buzzer", {
          p_room_id: room.id,
          p_host_token: token,
          p_expected_round: state.round_id,
          p_action: action,
        }),
        /HOST_UNAUTHORIZED/,
      );
    }
    const forbidden = await player
      .from("quiz_buzzer")
      .update({ status: "ready" })
      .eq("room_id", room.id);
    assert.ok(forbidden.error);
    state = await control("start");
    await delivered(eventLists, state);
    const first = await buzz(player);
    assert.equal(first.accepted, true);
    state = first.buzzer;
    await delivered(eventLists, state);
    assert.equal((await buzz(player)).reason, "duplicate");
    console.log(
      "PASS live buzzer: single winner, duplicate/paused rejection, host-only operations, Realtime host/player result",
    );

    state = await control("reset");
    const pausedRound = state.round_id;
    state = await control("pause");
    assert.equal(state.round_id, pausedRound);
    assert.equal((await buzz(player)).reason, "paused");
    state = await control("start");
    assert.notEqual(state.round_id, pausedRound);
    assert.equal((await buzz(player, pausedRound)).reason, "stale_round");
    await rpc(host, "set_quiz_room_joining", {
      p_room_id: room.id,
      p_host_token: token,
      p_accepting: true,
    });
    await rpc(outsider, "join_quiz_room", {
      p_code: room.code,
      p_name: "[Test] Contender Two",
      p_team: "Gold",
    });
    const third = makeClient();
    const { error: signInError } = await third.auth.signInAnonymously();
    if (signInError) throw new Error(signInError.message);
    await rpc(third, "join_quiz_room", {
      p_code: room.code,
      p_name: "[Test] Contender Three",
      p_team: "Blue",
    });
    eventLists.push(await subscribe(outsider), await subscribe(third));
    const assignments = await snapshot(host);
    if (assignments.competition) {
      for (const p of assignments.players)
        await rpc(host, "manage_quiz_competition", {
          p_room_id: room.id,
          p_host_token: token,
          p_match_id: assignments.match.id,
          p_request_id: crypto.randomUUID(),
          p_action: "assign_player",
          p_payload: {
            player_id: p.id,
            team_id: assignments.teams.find(
              (t) =>
                t.name === (p.requested_team_name === "Gold" ? "Gold" : "Blue"),
            ).id,
          },
        });
    }

    for (const contenders of [
      [player, outsider],
      [player, outsider, third],
    ]) {
      state = await control("reset");
      await delivered(eventLists, state);
      const results = await Promise.all(
        contenders.map((client) => buzz(client)),
      );
      assert.equal(results.filter((result) => result.accepted).length, 1);
      const winner = results.find((result) => result.accepted).buzzer;
      assert.ok(
        results.every(
          (result) =>
            result.buzzer.winning_player_id === winner.winning_player_id,
        ),
      );
      state = winner;
      await delivered(eventLists, state);
      for (const client of [host, player, outsider, third]) {
        const restored = await snapshot(client);
        assert.equal(
          restored.buzzer.winning_player_id,
          state.winning_player_id,
        );
        assert.equal(restored.buzzer.status, "locked");
      }
      console.log(
        `PASS live buzzer: ${contenders.length} concurrent independent sessions, one winner delivered to ALL participants`,
      );
    }

    const { data: saved } = await player.auth.getSession();
    const recovered = makeClient();
    const { error: recoveryError } = await recovered.auth.setSession({
      access_token: saved.session.access_token,
      refresh_token: saved.session.refresh_token,
    });
    if (recoveryError) throw new Error(recoveryError.message);
    const recoveredView = await snapshot(recovered);
    assert.equal(
      recoveredView.buzzer.winning_player_id,
      state.winning_player_id,
    );
    assert.equal(recoveredView.buzzer.round_id, state.round_id);
    assert.equal(recoveredView.players.length, 3);
    eventLists.push(await subscribe(recovered));
    const outdated = state.round_id;
    state = await control("reset");
    assert.equal(state.winning_player_id, null);
    assert.equal(state.status, "ready");
    await delivered(eventLists, state);
    const late = await buzz(player, outdated);
    assert.equal(late.accepted, false);
    assert.equal(late.reason, "stale_round");
    assert.equal(late.buzzer.round_id, state.round_id);
    assert.equal(late.buzzer.winning_player_id, null);
    console.log(
      "PASS live buzzer: reconnect restores winner without duplication; reset unlocks every subscriber; old-round attempt rejected",
    );
    state = await control("pause");
  } finally {
    await Promise.allSettled(
      subscriptions.map(({ client, channel }) => client.removeChannel(channel)),
    );
  }
}
