// Live integration test with independent guest sessions and a real Realtime
// subscription. Requires the migration and Anonymous Sign-Ins in your project.
// Uses only browser-safe credentials. Test rooms/players are retained as evidence.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { loadEnv } from "vite";
import { createClient } from "@supabase/supabase-js";
import { testBuzzerSupabase } from "./test-buzzer-supabase.mjs";
import { testCompetitionSupabase } from "./test-competition-supabase.mjs";

const env = { ...loadEnv("development", ".", "VITE_"), ...process.env };
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!url || !key)
  throw new Error(
    "Set the browser-safe Supabase URL/key in .env.local before running integration tests.",
  );
if (
  key.startsWith("sb_secret_") ||
  (key.split(".").length === 3 &&
    JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role !== "anon")
)
  throw new Error("Only a publishable/anon key is allowed.");

function independentClient() {
  const values = new Map();
  return createClient(url, key, {
    auth: {
      storageKey: randomUUID(),
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
      },
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
    },
  });
}
const clients = [independentClient(), independentClient(), independentClient()];
const [host, player, outsider] = clients;
let channel;
let room;
const token = randomBytes(32).toString("hex");
async function rpc(client, fn, args) {
  const result = await client.rpc(fn, args);
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function eventually(predicate, label) {
  const end = Date.now() + 15_000;
  while (!predicate()) {
    if (Date.now() > end)
      throw new Error(
        `Timed out waiting for ${label}. Check Realtime publication and RLS setup.`,
      );
    await delay(100);
  }
}
try {
  const identities = [];
  for (const client of clients) {
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw new Error(`Guest sign-in failed: ${error.message}`);
    identities.push(data.user.id);
  }
  assert.equal(new Set(identities).size, 3);
  console.log("PASS independent guest sessions");
  const requestId = randomUUID();
  room = await rpc(host, "create_quiz_room", {
    p_request_id: requestId,
    p_host_token: token,
  });
  const retried = await rpc(host, "create_quiz_room", {
    p_request_id: requestId,
    p_host_token: token,
  });
  assert.equal(room.id, retried.id);
  assert.match(room.code, /^[A-HJ-NP-Z2-9]{6}$/);
  console.log(`PASS create room ${room.code}, idempotent creation`);

  const isolated = await outsider
    .from("quiz_rooms")
    .select("id")
    .eq("id", room.id);
  if (isolated.error) throw new Error(isolated.error.message);
  assert.equal(isolated.data.length, 0);
  await assert.rejects(
    rpc(outsider, "get_quiz_room", { p_room_id: room.id }),
    /NOT_A_MEMBER/,
  );
  await assert.rejects(
    rpc(outsider, "set_quiz_room_joining", {
      p_room_id: room.id,
      p_host_token: room.code,
      p_accepting: false,
    }),
    /HOST_UNAUTHORIZED/,
  );
  console.log("PASS unrelated sessions cannot read rooms or impersonate hosts");

  const events = [];
  channel = host
    .channel(`integration-${room.id}`, {
      config: { postgres_changes_options: { wait: true } },
    })
    .on("system", {}, (payload) =>
      console.log("Realtime system:", payload.status, payload.message),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "quiz_players",
        filter: `room_id=eq.${room.id}`,
      },
      (event) => events.push(event),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "quiz_rooms",
        filter: `id=eq.${room.id}`,
      },
      (event) => events.push(event),
    );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Realtime subscription timed out.")),
      15_000,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      }
      if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
        clearTimeout(timer);
        reject(new Error(`Realtime subscription failed: ${status}`));
      }
    });
  });
  const joinArgs = {
    p_code: room.code.toLowerCase(),
    p_name: "[Test] Alex Morgan",
    p_team: "Science Team",
  };
  const [first, duplicate] = await Promise.all([
    rpc(player, "join_quiz_room", joinArgs),
    rpc(player, "join_quiz_room", joinArgs),
  ]);
  assert.equal(first.player.id, duplicate.player.id);
  await eventually(
    () =>
      events.some(
        (e) => e.table === "quiz_players" && e.new?.id === first.player.id,
      ),
    "host to receive the player join",
  );
  let state = await rpc(host, "get_quiz_room", {
    p_room_id: room.id,
    p_host_token: token,
  });
  assert.equal(state.players.length, 1);
  assert.equal(
    state.players[0].team_name,
    state.competition ? "Unassigned" : "Science Team",
  );
  if (state.competition) {
    state = await rpc(host, "manage_quiz_competition", {
      p_room_id: room.id,
      p_host_token: token,
      p_match_id: state.match.id,
      p_request_id: randomUUID(),
      p_action: "assign_player",
      p_payload: {
        player_id: first.player.id,
        team_id: state.teams.find((t) => t.name === "Blue").id,
      },
    });
  }
  console.log(
    "PASS concurrent duplicate joins create one player; host receives Realtime join event",
  );

  const badCode = room.code === "ZZZZZZ" ? "YYYYYY" : "ZZZZZZ";
  await assert.rejects(
    rpc(outsider, "join_quiz_room", {
      p_code: badCode,
      p_name: "Invalid",
      p_team: "Gold",
    }),
    /ROOM_NOT_FOUND/,
  );
  await assert.rejects(
    rpc(player, "set_quiz_room_joining", {
      p_room_id: room.id,
      p_host_token: token,
      p_accepting: false,
    }),
    /HOST_UNAUTHORIZED/,
  );
  const directWrite = await player
    .from("quiz_rooms")
    .update({ accepting_players: false })
    .eq("id", room.id);
  assert.ok(directWrite.error, "Direct table updates must be denied");
  await rpc(host, "set_quiz_room_joining", {
    p_room_id: room.id,
    p_host_token: token,
    p_accepting: false,
  });
  await eventually(
    () =>
      events.some(
        (e) => e.table === "quiz_rooms" && e.new?.accepting_players === false,
      ),
    "room change event",
  );
  await assert.rejects(
    rpc(outsider, "join_quiz_room", {
      p_code: room.code,
      p_name: "New member",
      p_team: "Gold",
    }),
    /ROOM_CLOSED/,
  );
  const resumed = await rpc(player, "join_quiz_room", joinArgs);
  assert.equal(resumed.player.id, first.player.id);
  console.log(
    "PASS invalid codes, backend host authorization, live lobby state, reconnecting existing players into closed rooms",
  );

  if (process.argv.includes("--presence")) {
    console.log(
      "Checking 75-second disconnect expiry without a browser-close event…",
    );
    const start = Date.now();
    while (Date.now() - start < 80_000) {
      await rpc(host, "quiz_room_heartbeat", {
        p_room_id: room.id,
        p_host_token: token,
      });
      await delay(20_000);
    }
    state = await rpc(host, "get_quiz_room", {
      p_room_id: room.id,
      p_host_token: token,
    });
    assert.equal(state.players.length, 1);
    assert.ok(
      Date.parse(state.server_time) -
        Date.parse(state.players[0].last_seen_at) >=
        75_000,
    );
    await rpc(player, "quiz_room_heartbeat", { p_room_id: room.id });
    state = await rpc(host, "get_quiz_room", {
      p_room_id: room.id,
      p_host_token: token,
    });
    assert.equal(state.players[0].id, first.player.id);
    assert.ok(
      Date.parse(state.server_time) -
        Date.parse(state.players[0].last_seen_at) <
        5_000,
    );
    console.log(
      "PASS offline player retained after heartbeat expiry and reconnected with original player ID",
    );
  }
  await testBuzzerSupabase({
    host,
    player,
    outsider,
    room,
    token,
    makeClient: () => {
      const client = independentClient();
      clients.push(client);
      return client;
    },
  });
  await testCompetitionSupabase({
    host,
    player,
    outsider,
    room,
    token,
    makeClient: () => {
      const client = independentClient();
      clients.push(client);
      return client;
    },
  });
  console.log(
    "Live Supabase room, buzzer, and competition integration checks passed.",
  );
} finally {
  if (room)
    await host.rpc("set_quiz_room_joining", {
      p_room_id: room.id,
      p_host_token: token,
      p_accepting: false,
    });
  if (channel) await host.removeChannel(channel);
  for (const client of clients) {
    await client.removeAllChannels();
    await client.auth.signOut({ scope: "local" });
  }
}
