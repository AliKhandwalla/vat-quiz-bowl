// Phase IV is intentionally out of scope. Only score previews stay local.
export type Team = string;
export type Game = {
  scores: Record<Team, number>;
};
export const initialGame: Game = {
  scores: { Blue: 0, Gold: 0 },
};
export type GameEvent =
  { type: "reset" } | { type: "score"; team: Team; points: number };
export function gameReducer(state: Game, event: GameEvent): Game {
  switch (event.type) {
    case "reset":
      return initialGame;
    case "score":
      return {
        ...state,
        scores: {
          ...state.scores,
          [event.team]: (state.scores[event.team] ?? 0) + event.points,
        },
      };
  }
}
