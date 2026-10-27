// Local-only buzzer and scoring demonstration. Never sent to Supabase.
export type Team = string;
export type Player = { id: string; name: string; team: Team };
export type Game = {
  phase: "ready" | "live" | "paused";
  first: string | null;
  round: number;
  scores: Record<Team, number>;
  players: Player[];
};
export const initialGame: Game = {
  phase: "ready",
  first: null,
  round: 1,
  scores: { Blue: 0, Gold: 0 },
  players: [],
};
export type GameEvent =
  | { type: "start" | "pause" | "next" | "reset" }
  | { type: "buzz"; id: string }
  | { type: "score"; team: Team; points: number }
  | { type: "roster"; players: Player[] };
export function gameReducer(state: Game, event: GameEvent): Game {
  switch (event.type) {
    case "start":
      return { ...state, phase: "live" };
    case "pause":
      return { ...state, phase: "paused" };
    case "next":
      return { ...state, phase: "live", first: null, round: state.round + 1 };
    case "reset":
      return { ...initialGame, players: state.players };
    case "buzz":
      return state.phase === "live" &&
        !state.first &&
        state.players.some((p) => p.id === event.id)
        ? { ...state, first: event.id }
        : state;
    case "score":
      return {
        ...state,
        scores: {
          ...state.scores,
          [event.team]: (state.scores[event.team] ?? 0) + event.points,
        },
      };
    case "roster":
      return { ...state, players: event.players };
  }
}
