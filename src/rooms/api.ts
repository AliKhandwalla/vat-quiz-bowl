import { configurationError, ensureGuest, supabase } from "../lib/supabase";
import type { LivePlayer, LiveRoom, RoomSession, RoomSnapshot } from "./types";
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
export function friendlyError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : String(error);
  if (message.includes("ROOM_NOT_FOUND"))
    return "That room code was not found. Check the six-character code with your host.";
  if (message.includes("ROOM_CLOSED"))
    return "This room is not accepting new players. Ask your host to reopen joining.";
  if (message.includes("HOST_UNAUTHORIZED"))
    return "Host authorization failed. Only the original host session can change this room.";
  if (
    message.includes("NOT_A_MEMBER") ||
    message.includes("AUTH_REQUIRED") ||
    /JWT|refresh.token|session.*expired/i.test(message)
  )
    return "Your room session is no longer authorized. Return to the overview to join again. Host access requires the original browser session.";
  if (message.includes("INVALID_INPUT"))
    return "Enter a six-character room code, a name (1–40 characters), and a team name (1–32 characters).";
  if (/anonymous.*(disabled|not allowed)/i.test(message))
    return "Guest sessions are disabled in Supabase. Enable Anonymous Sign-Ins in the project Auth settings.";
  if (
    /function.*(not find|not exist)|schema cache|relation.*not exist/i.test(
      message,
    )
  )
    return "The Supabase room migration is missing or unavailable. Apply the SQL migration in supabase/migrations, then retry.";
  if (
    message.includes("Live rooms need") ||
    message.includes("Supabase configuration")
  )
    return message;
  if (
    !navigator.onLine ||
    /fetch|network|timeout|abort|load failed/i.test(message)
  )
    return "Connection interrupted. Check your internet connection and retry. Your saved room session will be reused.";
  return "We could not complete that room request. Please retry. If it continues, ask the host to check the Supabase setup.";
}

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
