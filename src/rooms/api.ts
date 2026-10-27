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
export function friendlyError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : String(error);
  if (message.includes("ROOM_NOT_FOUND"))
    return "That room code was not found. Check the six-character code with your host.";
  if (message.includes("COMPETITION_MIGRATION_REQUIRED"))
    return "Apply the Phase IV migration (202610270003_competition.sql) in Supabase SQL Editor, then retry.";
  if (message.includes("PENDING_COMPETITION_ACTION"))
    return "Resolve the saved action with “Retry saved action” before making another change. It will not be counted twice.";
  if (message.includes("WAIT_FOR_SYNC"))
    return "Wait for the live room to finish updating, then try again.";
  if (message.includes("MATCH_ENDED"))
    return "This match has ended. Final scores are read-only. The host can start a new match.";
  if (message.includes("MATCH_STILL_ACTIVE"))
    return "End the active match before starting another.";
  if (message.includes("STALE_MATCH"))
    return "The match changed. Your action was not applied to the new match. Review the current dashboard.";
  if (message.includes("TEAM_NAME_TAKEN"))
    return "That team name is already in use in this room.";
  if (message.includes("INVALID_TEAM_NAME"))
    return "Enter a team name between 1 and 32 characters.";
  if (message.includes("TEAM_NOT_EMPTY"))
    return "Reassign every player on this team before removing it.";
  if (message.includes("TEAM_HAS_SCORE"))
    return "A team with points cannot be removed during this match. Keep it for the final standings.";
  if (
    message.includes("TEAM_NOT_FOUND") ||
    message.includes("PLAYER_NOT_FOUND")
  )
    return "That team or player is no longer available. Refresh the room and try again.";
  if (message.includes("INVALID_SCORE"))
    return "Use a nonzero whole-number adjustment between −10,000 and +10,000.";
  if (message.includes("SCORE_LIMIT"))
    return "This adjustment would exceed the supported score range (−1 billion to +1 billion).";
  if (message.includes("REQUEST_CONFLICT"))
    return "This saved request does not match the original action. Refresh the room before continuing.";
  if (message.includes("INVALID_COMPETITION_INPUT"))
    return "Check the team, player, and whole-number values, then try again.";
  if (message.includes("ROOM_CLOSED"))
    return "This room is not accepting new players. Ask your host to reopen joining.";
  if (message.includes("BUZZER_MIGRATION_REQUIRED"))
    return "The Phase III buzzer migration is required. Apply supabase/migrations/202610270002_quiz_buzzer.sql in the Supabase SQL Editor, then retry.";
  if (message.includes("STALE_ROUND"))
    return "The round changed before this action arrived. The latest state is being refreshed; review it before trying again.";
  if (message.includes("ROUND_LOCKED"))
    return "A player has already buzzed first. Start the next question to clear the winner.";
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
