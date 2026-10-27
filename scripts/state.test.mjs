import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newestBuzzer,
  mergeSnapshot,
  mergeBuzzer,
} from "../src/rooms/state.ts";
import { rankTeams } from "../src/rooms/leaderboard.ts";
import { isDefinitiveFailure } from "../src/rooms/errors.ts";
import { createRecoveryGate } from "../src/rooms/recovery.ts";
import { resolvePage } from "../src/routing.ts";

test("offline and channel loss prevent delayed reads from restoring connected state", () => {
  const gate = createRecoveryGate();
  const beforeSubscription = gate.beginRead();
  gate.subscribe();
  assert.equal(gate.canConnect(beforeSubscription, true), false);
  const connectedRead = gate.beginRead();
  assert.equal(gate.canConnect(connectedRead, true), true);
  assert.equal(gate.canConnect(connectedRead, false), false);
  gate.invalidate();
  assert.equal(gate.canConnect(connectedRead, true), false);
  const whileDisconnected = gate.beginRead();
  assert.equal(gate.canConnect(whileDisconnected, true), false);
  gate.subscribe();
  assert.equal(gate.canConnect(whileDisconnected, true), false);
  const recoveredRead = gate.beginRead();
  assert.equal(gate.canConnect(recoveredRead, true), true);
  gate.dispose();
  assert.equal(gate.canConnect(recoveredRead, true), false);
  gate.subscribe();
  assert.equal(gate.canConnect(gate.beginRead(), true), false);
});

test("path aliases refresh into dashboards and existing hash navigation takes priority", () => {
  for (const page of ["host", "player"]) {
    assert.equal(resolvePage(`/${page}`, ""), page);
    assert.equal(resolvePage(`/${page}/`, ""), page);
    assert.equal(resolvePage("/", `#/${page}`), page);
    assert.equal(resolvePage(`/${page}`, "#/"), "home");
  }
  assert.equal(resolvePage("/unknown", ""), "home");
  assert.equal(resolvePage("/host", "#/player"), "player");
});

const state = (revision, round = "round-1", status = "ready") => ({
  room_id: "room-a",
  round_id: round,
  revision,
  status,
});
test("unknown network/gateway failures preserve idempotent requests; SQL rejections are definitive", () => {
  for (const code of ["", "502", "ETIMEDOUT", "ECONNRESET"])
    assert.equal(isDefinitiveFailure({ code }), false);
  for (const code of ["P0001", "42501", "22023", "PGRST301"])
    assert.equal(isDefinitiveFailure({ code }), true);
  assert.equal(isDefinitiveFailure(new TypeError("Failed to fetch")), false);
});
test("late HTTP snapshot cannot erase a newer Realtime winner", () => {
  const current = {
    room: { id: "room-a" },
    buzzer: state(2, "round-1", "locked"),
  };
  const old = {
    room: { id: "room-a" },
    buzzer: state(1),
    players: ["updated roster"],
  };
  const merged = mergeSnapshot(current, old);
  assert.equal(merged.buzzer.status, "locked");
  assert.deepEqual(merged.players, old.players);
});
test("a delayed winning RPC response cannot overwrite a newer round", () => {
  const current = { room: { id: "room-a" }, buzzer: state(3, "round-2") };
  assert.equal(
    mergeBuzzer(current, state(2, "round-1", "locked")).buzzer.round_id,
    "round-2",
  );
});
test("latest revision unlocks correctly and old room events are ignored", () => {
  const current = {
    room: { id: "room-a" },
    buzzer: state(2, "round-1", "locked"),
  };
  assert.equal(
    mergeBuzzer(current, state(3, "round-2")).buzzer.status,
    "ready",
  );
  assert.equal(
    mergeBuzzer(current, { ...state(100), room_id: "room-b" }),
    current,
  );
  assert.equal(mergeBuzzer(null, state(1)), null);
  assert.equal(newestBuzzer(null, state(1)).revision, 1);
});
test("older competition snapshot cannot reset scores, match status, or team assignments", () => {
  const newer = {
    room: { id: "room-a" },
    buzzer: state(5),
    competition: { revision: 10 },
    match: { id: "match-2", status: "active" },
    teams: [{ id: "blue", score: 20 }],
    players: [{ id: "p", team_id: "blue" }],
    history: [{ id: "match-1" }],
  };
  const older = {
    room: { id: "room-a" },
    buzzer: state(4),
    competition: { revision: 9 },
    match: { id: "match-1", status: "ended" },
    teams: [{ id: "blue", score: 0 }],
    players: [{ id: "p", team_id: null }],
    history: [],
  };
  const merged = mergeSnapshot(newer, older);
  assert.deepEqual(merged.teams, newer.teams);
  assert.deepEqual(merged.players, newer.players);
  assert.deepEqual(merged.match, newer.match);
  assert.deepEqual(merged.history, newer.history);
});
test("leaderboard sorts negative scores and uses competition tie ranks", () => {
  const teams = [
    { id: "c", name: "Green", score: -5 },
    { id: "b", name: "Gold", score: 10 },
    { id: "a", name: "Blue", score: 10 },
  ];
  const ranked = rankTeams(teams);
  assert.deepEqual(
    ranked.map((t) => t.rank),
    [1, 1, 3],
  );
  assert.deepEqual(
    ranked.map((t) => t.name),
    ["Blue", "Gold", "Green"],
  );
  assert.equal(teams[0].name, "Green");
});
