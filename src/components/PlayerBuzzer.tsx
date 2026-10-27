import { useEffect } from "react";
import { ShieldCheck, Zap } from "lucide-react";
import type { BuzzerState, Connection, MatchState } from "../rooms/types";

type Props = {
  state: BuzzerState | null;
  selfId: string;
  name: string;
  team: string;
  connection: Connection;
  buzzing: boolean;
  error: string;
  onBuzz: () => Promise<void>;
  match: MatchState | null;
  syncing: boolean;
};
export function PlayerBuzzer({
  state,
  selfId,
  name,
  team,
  connection,
  buzzing,
  error,
  onBuzz,
  match,
  syncing,
}: Props) {
  const ended = match?.status === "ended";
  const locked = !ended && state?.status === "locked";
  const first = locked && state.winning_player_id === selfId;
  const ready = !ended && state?.status === "ready";
  const connected = connection === "connected" && !syncing;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input,textarea,select,button,a,[role="button"]'))
      )
        return;
      event.preventDefault();
      if (!event.repeat) void onBuzz();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBuzz]);
  return (
    <section className="card player-arena">
      <div className="player-arena-top">
        <div className="identity">
          <span
            className={`player-avatar ${team.toLowerCase() === "gold" ? "gold" : "blue"}`}
          >
            {name.slice(0, 2).toUpperCase()}
          </span>
          <span>
            <strong>{name}</strong>
            <small>
              {team === "Unassigned"
                ? "Awaiting team assignment"
                : `Team ${team}`}
            </small>
          </span>
        </div>
        <span className="round-label">
          ROUND {match?.round_number ?? 1} · Q {match?.question_number || "—"}
        </span>
      </div>
      <div className="live-buzzer-notice">
        {ended
          ? "Match complete · final scores are preserved."
          : connected
            ? `Match ${match?.match_number ?? 1} · Live buzzer · first valid response accepted by the server.`
            : "Reconnecting. Buzzing stays disabled until the room state refreshes."}
      </div>
      <div className="player-state" aria-live="polite">
        <span
          className={`status-pill ${first ? "gold-pill" : locked ? "" : ready && connected ? "green" : ""}`}
        >
          <span />
          {ended
            ? "Match ended"
            : first
              ? "Buzzed First"
              : locked
                ? "Locked Out"
                : !connected
                  ? "Reconnecting"
                  : buzzing
                    ? "Buzzing"
                    : ready
                      ? "Ready"
                      : "Paused"}
        </span>
        <h2>
          {ended
            ? "Match complete."
            : first
              ? "YOU BUZZED FIRST!"
              : locked
                ? `LOCKED OUT — ${state.winning_name} buzzed first.`
                : buzzing
                  ? "Confirming your buzz…"
                  : !connected
                    ? "Connecting to your room."
                    : ready
                      ? "Know it? Show it."
                      : "Waiting for host."}
        </h2>
        <p>
          {ended
            ? "Final scores are preserved. Your host can start the next match."
            : locked
              ? `${state.winning_name} · Team ${state.winning_team} has the floor.`
              : buzzing
                ? "Your request is being checked by the server."
                : !connected
                  ? "Your last confirmed result will update when the connection returns."
                  : ready
                    ? "Tap the buzzer when you have the answer."
                    : "Your host will open buzzers for everyone."}
        </p>
      </div>
      {error && (
        <p className="buzz-error error" role="alert">
          {error}
        </p>
      )}
      <button
        className={`player-buzz ${first ? "buzz-winner" : ""} ${buzzing && !locked ? "buzz-pending" : ""}`}
        disabled={!connected || !ready || buzzing || ended}
        aria-busy={buzzing}
        aria-label={
          ended
            ? "Match ended"
            : first
              ? "You buzzed first"
              : locked
                ? "Locked out"
                : buzzing
                  ? "Buzzing"
                  : "Buzz"
        }
        onClick={() => void onBuzz()}
      >
        <Zap size={54} fill="currentColor" />
        <span>
          {ended
            ? "ENDED"
            : first
              ? "FIRST!"
              : locked
                ? "LOCKED"
                : buzzing
                  ? "BUZZING…"
                  : "BUZZ"}
        </span>
        <small>
          {first
            ? "THE FLOOR IS YOURS"
            : buzzing
              ? "AWAITING CONFIRMATION"
              : "TRUST YOUR KNOWLEDGE"}
        </small>
      </button>
      <span className="keyboard-hint">
        Tap to buzz{" "}
        <span>
          or press <kbd>space</kbd> on a keyboard
        </span>
      </span>
      <div className="player-arena-footer">
        <ShieldCheck size={15} />
        First valid buzz accepted by the server wins.
      </div>
    </section>
  );
}
