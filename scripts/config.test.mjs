import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function config(overrides = {}) {
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {loadConfigFromFile} from 'vite'; await loadConfigFromFile({command:'build',mode:'production'});`,
    ],
    {
      env: {
        ...process.env,
        VERCEL: "",
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_PUBLISHABLE_KEY: "",
        VITE_SUPABASE_ANON_KEY: "",
        ...overrides,
      },
      encoding: "utf8",
    },
  );
}
test("build rejects privileged keys, including an unused legacy fallback", () => {
  const jwt = [
    "header",
    Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url"),
    "signature",
  ].join(".");
  for (const key of ["sb_secret_test_credential", jwt]) {
    const result = config({ VITE_SUPABASE_PUBLISHABLE_KEY: key });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing to embed/);
  }
  assert.notEqual(
    config({
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
      VITE_SUPABASE_ANON_KEY: jwt,
    }).status,
    0,
  );
});
test("Vercel build requires configured HTTPS backend, local unconfigured preview remains available", () => {
  assert.equal(config().status, 0);
  assert.notEqual(config({ VERCEL: "1" }).status, 0);
  assert.notEqual(
    config({
      VERCEL: "1",
      VITE_SUPABASE_URL: "http://example.test",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    }).status,
    0,
  );
  assert.equal(
    config({
      VERCEL: "1",
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    }).status,
    0,
  );
  const anon = [
    "header",
    Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url"),
    "signature",
  ].join(".");
  assert.equal(config({ VITE_SUPABASE_ANON_KEY: anon }).status, 0);
});
