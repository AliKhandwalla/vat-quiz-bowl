import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newestBuzzer,
  mergeSnapshot,
  mergeBuzzer,
} from "../src/rooms/state.ts";

const state = (revision, round = "round-1", status = "ready") => ({
  room_id: "room-a",
  round_id: round,
  revision,
  status,
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
