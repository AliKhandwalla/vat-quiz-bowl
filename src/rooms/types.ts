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
  team_id: string | null;
  requested_team_name: string | null;
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
  buzzer: BuzzerState | null;
  competition: CompetitionState | null;
  match: MatchState | null;
  teams: LiveTeam[];
  history: MatchState[];
};
export type BuzzerState = {
  room_id: string;
  round_id: string;
  round_number: number;
  revision: number;
  status: "ready" | "paused" | "locked";
  winning_player_id: string | null;
  winning_at: string | null;
  winning_name: string | null;
  winning_team: string | null;
  winning_team_id: string | null;
};
export type BuzzerAction = "start" | "pause" | "reset";
export type BuzzResult = {
  accepted: boolean;
  reason:
    | "accepted"
    | "stale_round"
    | "paused"
    | "duplicate"
    | "locked"
    | "match_ended";
  buzzer: BuzzerState;
};
export type LiveTeam = {
  id: string;
  room_id: string;
  name: string;
  score: number;
  archived_at: string | null;
  created_at: string;
};
export type FinalResult = {
  team_id: string;
  name: string;
  score: number;
  rank: number;
};
export type MatchState = {
  id: string;
  room_id: string;
  match_number: number;
  status: "active" | "ended";
  round_number: number;
  question_number: number;
  questions_completed: number;
  started_at: string;
  ended_at: string | null;
  final_results: FinalResult[] | null;
};
export type CompetitionState = {
  room_id: string;
  current_match_id: string;
  revision: number;
  scoring_shortcuts: number[];
};
export type CompetitionAction =
  | "create_team"
  | "rename_team"
  | "assign_player"
  | "remove_team"
  | "score"
  | "set_shortcuts"
  | "next_question"
  | "next_round"
  | "end_match"
  | "new_match";
export type CompetitionRequest = {
  roomId: string;
  matchId: string;
  requestId: string;
  action: CompetitionAction;
  payload: Record<string, unknown>;
};
export type Connection =
  "idle" | "connecting" | "connected" | "reconnecting" | "offline";
export const HEARTBEAT_MS = 20_000;
export const ONLINE_WINDOW_MS = 75_000;
export function isOnline(timestamp: string, serverNow: number): boolean {
  return serverNow - Date.parse(timestamp) < ONLINE_WINDOW_MS;
}
