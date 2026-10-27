import type { BuzzerState, RoomSnapshot } from "./types";

// Realtime, HTTP snapshots, and RPC replies can arrive in any order.
// The server's per-room revision is the ordering authority, not arrival time.
export function newestBuzzer(
  previous: BuzzerState | null | undefined,
  incoming: BuzzerState,
): BuzzerState {
  return previous?.room_id === incoming.room_id &&
    previous.revision > incoming.revision
    ? previous
    : incoming;
}
export function mergeSnapshot(
  previous: RoomSnapshot | null,
  incoming: RoomSnapshot,
): RoomSnapshot {
  if (!incoming.buzzer || previous?.room.id !== incoming.room.id)
    return incoming;
  return {
    ...incoming,
    buzzer: newestBuzzer(previous.buzzer, incoming.buzzer),
    ...(previous.competition &&
    incoming.competition &&
    previous.competition.revision > incoming.competition.revision
      ? {
          competition: previous.competition,
          match: previous.match,
          teams: previous.teams,
          history: previous.history,
          players: previous.players,
        }
      : {}),
  };
}
export function mergeBuzzer(
  previous: RoomSnapshot | null,
  incoming: BuzzerState,
): RoomSnapshot | null {
  if (!previous || previous.room.id !== incoming.room_id) return previous;
  return { ...previous, buzzer: newestBuzzer(previous.buzzer, incoming) };
}
