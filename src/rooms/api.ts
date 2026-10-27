import { configurationError, ensureGuest, supabase } from "../lib/supabase";
import type {
  LivePlayer,
  LiveRoom,
  RoomSession,
  RoomSnapshot,
  BuzzerAction,
  BuzzerState,
  BuzzResult,
  CompetitionRequest,
} from "./types";
import {
  finishCreation,
  pendingCreation,
  saveRoomSession,
  readHostSession,
} from "./storage";

function client() {
  if (!supabase) throw new Error(configurationError!);
  return supabase;
}
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  return data as T;
}
export { friendlyError } from "./errors";

export async function createRoom(): Promise<RoomSession> {
  const userId = await ensureGuest();
  const pending = pendingCreation(userId);
  const room = await rpc<LiveRoom>("create_quiz_room", {
    p_request_id: pending.requestId,
    p_host_token: pending.hostToken,
  });
  const session: RoomSession = {
    role: "host",
    roomId: room.id,
    code: room.code,
    hostToken: pending.hostToken,
  };
  saveRoomSession(session);
  finishCreation();
  return session;
}
export async function resumeOrCreateHost(): Promise<RoomSession> {
  const saved = readHostSession();
  if (!saved) return createRoom();
  // Never infer authorization from the storage descriptor or room code.
  await getSnapshot(saved);
  saveRoomSession(saved);
  return saved;
}
export async function joinRoom(
  code: string,
  name: string,
  team: string,
): Promise<RoomSession> {
  await ensureGuest();
  const result = await rpc<{ room: LiveRoom; player: LivePlayer }>(
    "join_quiz_room",
    {
      p_code: code.trim().toUpperCase(),
      p_name: name.trim(),
      p_team: team.trim(),
    },
  );
  const session: RoomSession = {
    role: "player",
    roomId: result.room.id,
    code: result.room.code,
    playerId: result.player.id,
  };
  saveRoomSession(session);
  return session;
}
export async function getSnapshot(session: RoomSession): Promise<RoomSnapshot> {
  await ensureGuest();
  return rpc<RoomSnapshot>("get_quiz_room", {
    p_room_id: session.roomId,
    p_host_token: session.role === "host" ? session.hostToken : null,
  });
}
export async function heartbeat(session: RoomSession): Promise<string> {
  await ensureGuest();
  return rpc<string>("quiz_room_heartbeat", {
    p_room_id: session.roomId,
    p_host_token: session.role === "host" ? session.hostToken : null,
  });
}
export function setAcceptingPlayers(
  session: RoomSession,
  accepting: boolean,
): Promise<LiveRoom> {
  if (session.role !== "host") throw new Error("HOST_UNAUTHORIZED");
  return rpc<LiveRoom>("set_quiz_room_joining", {
    p_room_id: session.roomId,
    p_host_token: session.hostToken,
    p_accepting: accepting,
  });
}

export function controlBuzzer(
  session: RoomSession,
  roundId: string,
  action: BuzzerAction,
): Promise<BuzzerState> {
  if (session.role !== "host") throw new Error("HOST_UNAUTHORIZED");
  return rpc<BuzzerState>("control_quiz_buzzer", {
    p_room_id: session.roomId,
    p_host_token: session.hostToken,
    p_expected_round: roundId,
    p_action: action,
  });
}
export function submitBuzz(
  session: RoomSession,
  roundId: string,
): Promise<BuzzResult> {
  if (session.role !== "player") throw new Error("NOT_A_MEMBER");
  return rpc<BuzzResult>("submit_quiz_buzz", {
    p_room_id: session.roomId,
    p_round_id: roundId,
  });
}
export function manageCompetition(
  session: RoomSession,
  request: CompetitionRequest,
): Promise<RoomSnapshot> {
  if (session.role !== "host") throw new Error("HOST_UNAUTHORIZED");
  return rpc<RoomSnapshot>("manage_quiz_competition", {
    p_room_id: session.roomId,
    p_host_token: session.hostToken,
    p_match_id: request.matchId,
    p_request_id: request.requestId,
    p_action: request.action,
    p_payload: request.payload,
  });
}
export { isDefinitiveFailure } from "./errors";
