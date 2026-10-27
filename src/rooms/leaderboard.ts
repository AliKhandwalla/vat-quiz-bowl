import type { FinalResult, LiveTeam } from "./types";
export function rankTeams(teams: LiveTeam[]): FinalResult[] {
  const sorted = [...teams].sort(
    (a, b) =>
      b.score - a.score ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
  let rank = 1;
  return sorted.map((team, index) => {
    if (index === 0 || team.score !== sorted[index - 1].score) rank = index + 1;
    return { team_id: team.id, name: team.name, score: team.score, rank };
  });
}
