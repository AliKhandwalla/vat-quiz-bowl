import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Flag,
  History,
  Plus,
  Settings2,
  Trophy,
  Users,
} from "lucide-react";
import { rankTeams } from "../rooms/leaderboard";
import { isOnline } from "../rooms/types";
import type {
  CompetitionAction,
  FinalResult,
  LivePlayer,
  LiveTeam,
  MatchState,
} from "../rooms/types";

export type CompetitionHandler = (
  action: CompetitionAction,
  payload?: Record<string, unknown>,
) => Promise<boolean>;
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

export function Scoreboard({
  teams,
  players,
  shortcuts,
  winnerTeamId,
  winnerName,
  responseKey,
  disabled,
  onAction,
}: {
  teams: LiveTeam[];
  players: LivePlayer[];
  shortcuts: number[];
  winnerTeamId?: string | null;
  winnerName?: string | null;
  responseKey?: string;
  disabled: boolean;
  onAction?: CompetitionHandler;
}) {
  const [selected, setSelected] = useState(
    winnerName ? winnerTeamId || "" : teams[0]?.id || "",
  );
  const [custom, setCustom] = useState("");
  const [localError, setLocalError] = useState("");
  const [draft, setDraft] = useState(shortcuts.map(String));
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    if (winnerName) setSelected(winnerTeamId || "");
  }, [winnerTeamId, winnerName, responseKey]);
  useEffect(() => {
    if (!teams.some((t) => t.id === selected)) {
      const fallback = winnerName
        ? teams.find((t) => t.id === winnerTeamId)?.id || ""
        : teams[0]?.id || "";
      if (selected !== fallback) setSelected(fallback);
    }
  }, [teams, selected, winnerName, winnerTeamId]);
  useEffect(() => setDraft(shortcuts.map(String)), [shortcuts.join(",")]);
  const standings = rankTeams(teams);
  const tied = (rank: number) =>
    standings.filter((t) => t.rank === rank).length > 1;
  async function adjust(delta: number) {
    if (
      !selected ||
      !Number.isInteger(delta) ||
      delta === 0 ||
      Math.abs(delta) > 10000
    ) {
      setLocalError(
        "Choose a team and a nonzero whole number between −10,000 and +10,000.",
      );
      return;
    }
    setLocalError("");
    if (onAction && (await onAction("score", { team_id: selected, delta })))
      setCustom("");
  }
  return (
    <section className="card scoreboard competition-scoreboard">
      <div className="card-heading">
        <h2>
          <Trophy size={18} /> Live leaderboard
        </h2>
        <span className="live-badge">LIVE</span>
      </div>
      {onAction && (
        <div className="score-response">
          <label>
            Score this response
            <select
              aria-label="Scoring team"
              value={selected}
              disabled={disabled || !teams.length}
              onChange={(e) => setSelected(e.target.value)}
            >
              {!!teams.length && (
                <option value="" disabled>
                  Choose a team
                </option>
              )}
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              {!teams.length && <option value="">Create a team first</option>}
            </select>
          </label>
          <small>
            {winnerName
              ? winnerTeamId
                ? `Buzzer: ${winnerName}. Choose another team to override.`
                : `${winnerName} has no assigned team. Assign one or choose a scoring team.`
              : "The host awards points. A buzz never adds points automatically."}
          </small>
          <div className="live-score-shortcuts">
            {shortcuts.map((n, i) => (
              <button
                className="button secondary"
                key={i}
                disabled={disabled || !selected}
                onClick={() => void adjust(n)}
                aria-label={`Adjust selected team by ${signed(n)} points`}
              >
                {signed(n)}
              </button>
            ))}
          </div>
          <form
            className="custom-score"
            onSubmit={(e) => {
              e.preventDefault();
              void adjust(Number(custom));
            }}
          >
            <label>
              Custom adjustment
              <input
                aria-label="Custom score adjustment"
                type="number"
                step="1"
                min="-10000"
                max="10000"
                value={custom}
                placeholder="e.g. −15"
                disabled={disabled}
                onChange={(e) => setCustom(e.target.value)}
              />
            </label>
            <button
              className="button primary small"
              disabled={disabled || !custom || !selected}
            >
              Apply
            </button>
          </form>
          {localError && (
            <p className="error" role="alert">
              {localError}
            </p>
          )}
        </div>
      )}
      {!standings.length && (
        <p className="empty-roster">
          No teams yet. The host can add them below.
        </p>
      )}
      {standings.map((team, index) => (
        <div
          className={`score-team ${index % 2 ? "gold" : "blue"}`}
          key={team.team_id}
        >
          <div className="score-team-name">
            <span className="team-dot" />
            <strong>{team.name}</strong>
            <span
              className="rank-label"
              title={
                tied(team.rank)
                  ? `Tied for rank ${team.rank}`
                  : `Rank ${team.rank}`
              }
            >
              {tied(team.rank) ? "T" : "#"}
              {team.rank}
            </span>
          </div>
          <div className="score-number">
            <output aria-label={`${team.name} score`}>{team.score}</output>
            <small>POINTS</small>
          </div>
          <div className="team-member-count">
            {players.filter((p) => p.team_id === team.team_id).length} members
          </div>
        </div>
      ))}
      {onAction && (
        <div className="scoring-settings">
          <button
            className="text-button"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Settings2 size={14} />
            Scoring shortcuts
          </button>
          {settingsOpen && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const values = draft.map(Number);
                if (
                  values.some(
                    (v) =>
                      !Number.isInteger(v) || v === 0 || Math.abs(v) > 10000,
                  )
                ) {
                  setLocalError(
                    "Each shortcut must be a nonzero whole number between −10,000 and +10,000.",
                  );
                  return;
                }
                setLocalError("");
                if (await onAction("set_shortcuts", { values }))
                  setSettingsOpen(false);
              }}
            >
              <div className="shortcut-settings">
                {draft.map((value, i) => (
                  <label key={i}>
                    Shortcut {i + 1}
                    <input
                      type="number"
                      step="1"
                      min="-10000"
                      max="10000"
                      aria-label={`Shortcut ${i + 1}`}
                      value={value}
                      onChange={(e) =>
                        setDraft(
                          draft.map((n, j) => (j === i ? e.target.value : n)),
                        )
                      }
                      disabled={disabled}
                    />
                  </label>
                ))}
              </div>
              <button className="button secondary small" disabled={disabled}>
                Save shortcuts
              </button>
            </form>
          )}
        </div>
      )}
      <div className="card-note">
        {onAction
          ? "Club scoring shortcuts · custom rules welcome."
          : "Scores and rankings update automatically."}
      </div>
    </section>
  );
}

function TeamRow({
  team,
  members,
  disabled,
  onAction,
}: {
  team: LiveTeam;
  members: LivePlayer[];
  disabled: boolean;
  onAction: CompetitionHandler;
}) {
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(team.name);
  useEffect(() => setName(team.name), [team.name]);
  return (
    <div className="managed-team">
      <div>
        {editing ? (
          <form
            className="rename-team"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await onAction("rename_team", {
                  team_id: team.id,
                  name: name.trim(),
                })
              )
                setEditing(false);
            }}
          >
            <input
              aria-label={`Rename ${team.name}`}
              value={name}
              maxLength={32}
              required
              disabled={disabled}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              className="icon-button"
              aria-label={`Save team name ${team.name}`}
              disabled={disabled}
            >
              <Check size={15} />
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </form>
        ) : (
          <strong>{team.name}</strong>
        )}
        <p>
          {members.length
            ? members.map((p) => p.display_name).join(" · ")
            : "No members"}
        </p>
      </div>
      <div className="team-row-actions">
        {!editing && (
          <button
            className="text-button"
            disabled={disabled}
            onClick={() => setEditing(true)}
          >
            Rename
          </button>
        )}
        <button
          className="text-button"
          disabled={disabled || !!members.length || team.score !== 0}
          title={
            members.length
              ? "Reassign members first"
              : team.score !== 0
                ? "Keep scored teams until the match finishes"
                : "Remove empty team"
          }
          onClick={() => void onAction("remove_team", { team_id: team.id })}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
export function TeamManager({
  teams,
  players,
  serverNow,
  disabled,
  onAction,
}: {
  teams: LiveTeam[];
  players: LivePlayer[];
  serverNow: number;
  disabled: boolean;
  onAction: CompetitionHandler;
}) {
  const [name, setName] = useState("");
  return (
    <section className="card team-manager">
      <div className="card-heading">
        <h2>
          <Users size={18} /> Teams & players
        </h2>
        <span className="count-label">
          {players.filter((p) => isOnline(p.last_seen_at, serverNow)).length}{" "}
          online · {players.length} total
        </span>
      </div>
      <form
        className="create-team"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onAction("create_team", { name: name.trim() })) setName("");
        }}
      >
        <label>
          New team
          <input
            aria-label="New team name"
            placeholder="e.g. Varsity"
            value={name}
            maxLength={32}
            required
            disabled={disabled}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          className="button secondary small"
          disabled={disabled || !name.trim()}
        >
          <Plus size={15} />
          Add team
        </button>
      </form>
      <div className="managed-teams">
        {teams.map((team) => (
          <TeamRow
            key={team.id}
            team={team}
            members={players.filter((p) => p.team_id === team.id)}
            disabled={disabled}
            onAction={onAction}
          />
        ))}
      </div>
      <div className="player-list">
        {!players.length && (
          <p className="empty-roster">
            Share the room code to invite your players.
          </p>
        )}
        {players.map((player) => (
          <div className="player-row" key={player.id}>
            <span
              className={`player-avatar ${player.team_name.toLowerCase() === "gold" ? "gold" : "blue"}`}
            >
              {player.display_name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span className="player-info">
              <strong>{player.display_name}</strong>
              <small>
                {isOnline(player.last_seen_at, serverNow)
                  ? "Online"
                  : "Offline"}
                {!player.team_id && player.requested_team_name
                  ? ` · prefers ${player.requested_team_name}`
                  : ""}
              </small>
            </span>
            <label className="assignment-label">
              Assigned team
              <select
                aria-label={`Team for ${player.display_name}`}
                value={player.team_id || ""}
                disabled={disabled}
                onChange={(e) =>
                  void onAction("assign_player", {
                    player_id: player.id,
                    team_id: e.target.value || null,
                  })
                }
              >
                <option value="">Unassigned</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>
      <div className="card-note">
        Only the host assigns teams. Offline members keep their assignments.
      </div>
    </section>
  );
}

export function MatchControls({
  match,
  disabled,
  onAction,
  onSummary,
}: {
  match: MatchState;
  disabled: boolean;
  onAction?: CompetitionHandler;
  onSummary: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [match.id]);
  return (
    <section className="card match-controls">
      <div className="match-overview">
        <span className="square-icon gold">
          <Flag size={22} />
        </span>
        <div>
          <span className="eyebrow muted">
            MATCH {match.match_number} ·{" "}
            {match.status === "active" ? "IN PLAY" : "COMPLETE"}
          </span>
          <h2>
            Round {match.round_number}{" "}
            <span>Question {match.question_number || "—"}</span>
          </h2>
          <small>{match.questions_completed} questions completed</small>
        </div>
      </div>
      <div className="match-actions">
        {match.status === "ended" ? (
          <>
            <button className="button secondary" onClick={onSummary}>
              View summary
            </button>
            {onAction && (
              <button
                className="button primary"
                disabled={disabled}
                onClick={() => void onAction("new_match")}
              >
                Start new match
                <ArrowRight size={15} />
              </button>
            )}
          </>
        ) : (
          onAction && (
            <>
              <button
                className="button secondary"
                disabled={disabled}
                onClick={() => void onAction("next_round")}
              >
                Next round
              </button>
              <button
                className="button secondary end-match"
                disabled={disabled}
                onClick={() => setConfirm(!confirm)}
              >
                End match
              </button>
            </>
          )
        )}
      </div>
      {confirm && match.status === "active" && onAction && (
        <div className="confirm-reset match-confirm">
          <span>Finish this question and freeze the final scores?</span>
          <button
            className="text-button"
            disabled={disabled}
            onClick={async () => {
              if (await onAction("end_match")) setConfirm(false);
            }}
          >
            Confirm end match
          </button>
          <button className="text-button" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
function FinalStandings({ results }: { results: FinalResult[] }) {
  return (
    <div className="final-standings">
      {results.map((t) => (
        <div key={t.team_id}>
          <span className="rank-label">
            {results.filter((r) => r.rank === t.rank).length > 1 ? "T" : "#"}
            {t.rank}
          </span>
          <strong>{t.name}</strong>
          <output>
            {t.score}
            <small> pts</small>
          </output>
        </div>
      ))}
      {!results.length && <p>No teams were registered for this match.</p>}
    </div>
  );
}
export function MatchSummary({
  match,
  onDismiss,
  onNewMatch,
  disabled,
}: {
  match: MatchState;
  onDismiss: () => void;
  onNewMatch?: () => void;
  disabled: boolean;
}) {
  const results = match.final_results || [],
    winners = results.filter((t) => t.rank === 1);
  return (
    <section
      className="card match-summary"
      aria-label={`Match ${match.match_number} summary`}
    >
      <div className="summary-heading">
        <span className="square-icon gold">
          <Trophy size={26} />
        </span>
        <div>
          <span className="eyebrow muted">
            MATCH {match.match_number} COMPLETE
          </span>
          <h2>
            {winners.length > 1
              ? "Tied winners"
              : winners.length
                ? "Winning team"
                : "Match complete"}
          </h2>
          <p>{winners.map((t) => t.name).join(" · ")}</p>
        </div>
      </div>
      <FinalStandings results={results} />
      <div className="summary-meta">
        <span>{match.questions_completed} questions completed</span>
        <span>
          Completed{" "}
          {match.ended_at ? new Date(match.ended_at).toLocaleString() : "—"}
        </span>
      </div>
      <div className="summary-actions">
        <button className="button secondary" onClick={onDismiss}>
          Return to dashboard
        </button>
        {onNewMatch && (
          <button
            className="button primary"
            disabled={disabled}
            onClick={onNewMatch}
          >
            Start new match
            <ArrowRight size={15} />
          </button>
        )}
      </div>
    </section>
  );
}
export function MatchHistory({ matches }: { matches: MatchState[] }) {
  return matches.length ? (
    <details className="card match-history">
      <summary>
        <History size={17} />
        Previous match results <span>{matches.length}</span>
      </summary>
      {matches.map((match) => (
        <details key={match.id}>
          <summary>
            Match {match.match_number} · {match.questions_completed} questions ·{" "}
            {new Date(match.ended_at!).toLocaleString()}
          </summary>
          <FinalStandings results={match.final_results || []} />
        </details>
      ))}
    </details>
  ) : null;
}
