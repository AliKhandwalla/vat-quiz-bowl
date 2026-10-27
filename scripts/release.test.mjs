import { test } from "node:test";
import assert from "node:assert/strict";
import { readPublicConfiguration } from "../src/lib/publicConfig.ts";
import { friendlyError } from "../src/rooms/errors.ts";
import {
  readRoomSession,
  readCompetitionRequest,
  pendingCreation,
  finishCreation,
} from "../src/rooms/storage.ts";

const env = {
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
};
test("build/browser config consistently trims values, prefers publishable keys and normalizes the origin", () => {
  const config = readPublicConfiguration(
    {
      ...env,
      VITE_SUPABASE_URL: " https://example.supabase.co/ ",
      VITE_SUPABASE_PUBLISHABLE_KEY: " sb_publishable_fixture ",
      VITE_SUPABASE_ANON_KEY: "sb_publishable_legacy",
    },
    { required: true, https: true },
  );
  assert.deepEqual(config, {
    url: env.VITE_SUPABASE_URL,
    key: env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
});
test("malformed origins and embedded credentials are rejected without echoing supplied values", () => {
  for (const url of [
    "not-a-url",
    "ftp://example.test",
    "https://user:private-value@example.test",
    "https://example.test/api",
    "https://example.test?token=private-value",
    "https://example.test#private-value",
    "http://example.test",
    "http://localhost:54321",
  ]) {
    assert.throws(
      () =>
        readPublicConfiguration(
          { ...env, VITE_SUPABASE_URL: url },
          { https: true },
        ),
      (error) =>
        /HTTPS project origin/.test(error.message) &&
        !error.message.includes("private-value"),
    );
  }
  assert.equal(
    readPublicConfiguration({
      ...env,
      VITE_SUPABASE_URL: "http://localhost:54321",
    }).url,
    "http://localhost:54321",
  );
});
test("configuration distinguishes missing settings from invalid/privileged keys", () => {
  assert.equal(readPublicConfiguration({}), null);
  assert.throws(
    () => readPublicConfiguration({}, { required: true }),
    /Live rooms need/,
  );
  assert.throws(
    () =>
      readPublicConfiguration({
        ...env,
        VITE_SUPABASE_ANON_KEY: "sb_" + "secret_not_for_browsers",
      }),
    /Refusing to embed/,
  );
  assert.throws(
    () =>
      readPublicConfiguration({
        ...env,
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_",
      }),
    /Refusing to embed/,
  );
  assert.equal(
    readPublicConfiguration({
      ...env,
      VITE_SUPABASE_PUBLISHABLE_KEY: "  ",
      VITE_SUPABASE_ANON_KEY: "sb_publishable_fallback",
    }).key,
    "sb_publishable_fallback",
  );
});
test("auth, room, membership, rate limits and offline failures have actionable messages", () => {
  assert.match(friendlyError(new Error("JWT expired")), /no longer authorized/);
  assert.match(
    friendlyError({ message: "HOST_UNAUTHORIZED" }),
    /original host session/,
  );
  assert.match(friendlyError({ message: "NOT_A_MEMBER" }), /join again/);
  assert.match(
    friendlyError(new Error("Anonymous sign-ins are disabled")),
    /Enable Anonymous/,
  );
  assert.match(
    friendlyError(new Error("Rate limit exceeded")),
    /Too many new sessions/,
  );
  assert.match(
    friendlyError({ message: "ROOM_NOT_FOUND" }),
    /six-character code/,
  );
  assert.match(
    friendlyError({ message: "ROOM_CLOSED" }),
    /not accepting new players/,
  );
  assert.match(
    friendlyError(new Error("unrelated internal detail"), false),
    /Connection interrupted/,
  );
  assert.doesNotMatch(
    friendlyError(new Error("unexpected database detail")),
    /unexpected database detail/,
  );
});
test("corrupt saved identities fail closed; room creation retry credentials survive an ambiguous response", () => {
  const values = new Map();
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  );
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
      removeItem: (k) => values.delete(k),
    },
  });
  try {
    values.set("vat.active-room.v2", "broken JSON");
    assert.equal(readRoomSession(), null);
    values.set(
      "vat.active-room.v2",
      JSON.stringify({
        roomId: "r",
        code: "ABC234",
        role: "host",
        hostToken: "guess",
      }),
    );
    assert.equal(readRoomSession(), null);
    values.set("vat.competition-request.r", "broken JSON");
    assert.equal(readCompetitionRequest("r"), null);
    const first = pendingCreation("guest-a");
    assert.match(first.hostToken, /^[a-f0-9]{64}$/);
    assert.deepEqual(pendingCreation("guest-a"), first);
    assert.notEqual(pendingCreation("guest-b").hostToken, first.hostToken);
    finishCreation();
    assert.notEqual(pendingCreation("guest-a").requestId, first.requestId);
  } finally {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else delete globalThis.sessionStorage;
  }
});
