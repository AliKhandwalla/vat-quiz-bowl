import type { CompetitionRequest, RoomSession } from "./types";

const ACTIVE_KEY = "vat.active-room.v2";
const HOST_KEY = "vat.host-room.v2";
export function readRoomSession(key = ACTIVE_KEY): RoomSession | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null");
    if (
      !value ||
      typeof value.roomId !== "string" ||
      typeof value.code !== "string"
    )
      return null;
    if (value.role === "host" && /^[0-9a-f]{64}$/.test(value.hostToken))
      return value;
    if (value.role === "player" && typeof value.playerId === "string")
      return value;
  } catch {
    /* A malformed saved session does not authorize access. */
  }
  return null;
}
export function saveRoomSession(value: RoomSession | null) {
  if (value) {
    sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(value));
    if (value.role === "host")
      sessionStorage.setItem(HOST_KEY, JSON.stringify(value));
  } else {
    sessionStorage.removeItem(ACTIVE_KEY);
    sessionStorage.removeItem(HOST_KEY);
  }
}
export function readHostSession() {
  const saved = readRoomSession(HOST_KEY);
  return saved?.role === "host" ? saved : null;
}

// Retain the request and credential before submitting: retrying a lost HTTP
// response returns the same room instead of creating an orphan or losing host access.
export function pendingCreation(userId: string): {
  requestId: string;
  hostToken: string;
} {
  const key = "vat.pending-room.v2";
  const cached = sessionStorage.getItem(key);
  if (cached) {
    try {
      const value = JSON.parse(cached);
      if (
        value.userId === userId &&
        typeof value.requestId === "string" &&
        /^[0-9a-f]{64}$/.test(value.hostToken)
      )
        return value;
    } catch {
      /* Replace invalid local data. */
    }
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const value = {
    userId,
    requestId: crypto.randomUUID(),
    hostToken: Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
  };
  sessionStorage.setItem(key, JSON.stringify(value));
  return value;
}
export function finishCreation() {
  sessionStorage.removeItem("vat.pending-room.v2");
}
export function readCompetitionRequest(
  roomId: string | undefined,
): CompetitionRequest | null {
  if (!roomId) return null;
  try {
    const value = JSON.parse(
      sessionStorage.getItem(`vat.competition-request.${roomId}`) || "null",
    );
    return value?.roomId === roomId &&
      typeof value.requestId === "string" &&
      typeof value.matchId === "string" &&
      typeof value.action === "string" &&
      value.payload &&
      typeof value.payload === "object"
      ? value
      : null;
  } catch {
    return null;
  }
}
export function saveCompetitionRequest(value: CompetitionRequest) {
  sessionStorage.setItem(
    `vat.competition-request.${value.roomId}`,
    JSON.stringify(value),
  );
}
export function clearCompetitionRequest(roomId: string) {
  sessionStorage.removeItem(`vat.competition-request.${roomId}`);
}
