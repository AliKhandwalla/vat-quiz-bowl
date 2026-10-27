import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Faults affect only these SDK clients. Real SQL commits and recovery reads
// still use the configured backend; no project/network settings are changed.
export async function testNetworkSupabase({
  host,
  player,
  room,
  token,
  makeClient,
}) {
  let fault = "none";
  const transport = async (input, init) => {
    if (fault === "offline")
      throw new TypeError("Injected network interruption");
    const response = await fetch(input, init);
    if (fault === "lose-reply" && String(input).includes("/rpc/")) {
      assert.ok(
        response.ok,
        "Real backend must commit successfully before reply is discarded",
      );
      await response.arrayBuffer();
      throw new TypeError("Injected lost response after commit");
    }
    return response;
  };
  async function restore(original) {
    const client = makeClient(transport);
    const { data } = await original.auth.getSession();
    const result = await client.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    assert.equal(result.error, null);
    return client;
  }
  const recoveredPlayer = await restore(player);
  const recoveredHost = await restore(host);
  const snapshot = async () => {
    const result = await host.rpc("get_quiz_room", {
      p_room_id: room.id,
      p_host_token: token,
    });
    assert.equal(result.error, null);
    return result.data;
  };
  const before = await snapshot();
  const opened = await host.rpc("control_quiz_buzzer", {
    p_room_id: room.id,
    p_host_token: token,
    p_expected_round: before.buzzer.round_id,
    p_action: "reset",
  });
  assert.equal(opened.error, null);
  fault = "offline";
  const failedRead = await recoveredPlayer.rpc("get_quiz_room", {
    p_room_id: room.id,
  });
  assert.ok(failedRead.error);
  fault = "lose-reply";
  const attempt = { p_room_id: room.id, p_round_id: opened.data.round_id };
  const lost = await recoveredPlayer.rpc("submit_quiz_buzz", attempt);
  assert.ok(lost.error);
  fault = "none";
  const current = await recoveredPlayer.rpc("get_quiz_room", {
    p_room_id: room.id,
  });
  assert.equal(current.error, null);
  const identity = (await player.auth.getSession()).data.session.user.id;
  // Snapshots intentionally omit auth user IDs, so obtain the retained player
  // through the already-authorized table SELECT for this membership.
  const row = await player
    .from("quiz_players")
    .select("id")
    .eq("room_id", room.id)
    .eq("user_id", identity)
    .single();
  assert.equal(row.error, null);
  assert.equal(current.data.buzzer.winning_player_id, row.data.id);
  assert.equal(current.data.players.length, before.players.length);
  const duplicate = await recoveredPlayer.rpc("submit_quiz_buzz", attempt);
  assert.equal(duplicate.error, null);
  assert.equal(duplicate.data.accepted, false);
  assert.equal(duplicate.data.reason, "duplicate");
  const score = {
    p_room_id: room.id,
    p_host_token: token,
    p_match_id: current.data.match.id,
    p_request_id: randomUUID(),
    p_action: "score",
    p_payload: { team_id: current.data.teams[0].id, delta: 10 },
  };
  const initialPoints = current.data.teams[0].score;
  fault = "lose-reply";
  assert.ok((await recoveredHost.rpc("manage_quiz_competition", score)).error);
  fault = "none";
  assert.equal(
    (await recoveredHost.rpc("manage_quiz_competition", score)).error,
    null,
  );
  const confirmed = await snapshot();
  assert.equal(
    confirmed.teams.find((t) => t.id === score.p_payload.team_id).score,
    initialPoints + 10,
  );
  console.log(
    "PASS network fault injection: failed read, committed buzz with lost reply, authoritative recovery without duplicate players/winners, committed score with lost reply retried exactly once",
  );
}
