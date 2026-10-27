export type LiveRoom = {
  id: string;
  code: string;
  accepting_players: boolean;
  created_at: string;
  host_last_seen_at: string;
};
export type LivePlayer = {
  id: string;
  room_id: string;
  display_name: string;
  team_name: string;
  last_seen_at: string;
  created_at: string;
};
export type RoomSession = { roomId: string; code: string } & (
  { role: "host"; hostToken: string } | { role: "player"; playerId: string }
);
export type RoomSnapshot = {
  room: LiveRoom;
  players: LivePlayer[];
  server_time: string;
  is_host: boolean;
};
export type Connection =
  "idle" | "connecting" | "connected" | "reconnecting" | "offline";
export const HEARTBEAT_MS = 20_000;
export const ONLINE_WINDOW_MS = 75_000;
export function isOnline(timestamp: string, serverNow: number): boolean {
  return serverNow - Date.parse(timestamp) < ONLINE_WINDOW_MS;
}
