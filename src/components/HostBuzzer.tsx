import { useState } from "react";
import {
  ArrowRight,
  Bell,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Trophy,
  Zap,
} from "lucide-react";
import type { BuzzerAction, BuzzerState, Connection } from "../rooms/types";

type Props = {
  state: BuzzerState | null;
  connection: Connection;
  busy: boolean;
  onControl: (action: BuzzerAction) => Promise<boolean>;
};
export function HostBuzzer({ state, connection, busy, onControl }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const locked = state?.status === "locked";
  const ready = state?.status === "ready";
  const disabled = !state || connection !== "connected" || busy;
  return (
    <section className="card round-card">
      <div className="card-heading">
        <h2>
          <Radio size={18} /> Buzzer control{" "}
          <span className="live-badge">LIVE</span>
        </h2>
        <span
          className={`status-pill ${ready ? "green" : locked ? "gold-pill" : ""}`}
        >
          {locked ? "Locked" : ready ? "Ready · buzzers open" : "Paused"}
        </span>
      </div>
      <div
        className={`buzzer-status ${locked ? "has-winner" : ""}`}
        aria-live="polite"
      >
        <span className="round-label">
          ROUND {String(state?.round_number ?? 0).padStart(2, "0")}
        </span>
        <span className="status-icon">
          {locked ? (
            <Trophy size={35} />
          ) : ready ? (
            <Bell size={35} />
          ) : (
            <Pause size={35} />
          )}
        </span>
        <h3>
          {locked
            ? `${state.winning_name} — ${state.winning_team} buzzed first.`
            : ready
              ? "The floor is open."
              : "Ready for the next question?"}
        </h3>
        <p>
          {!state
            ? "Apply the Phase III migration to enable live buzzers."
            : locked
              ? "This is the first valid buzz accepted by the server."
              : ready
                ? "Buzzers are open for every player in this room."
                : "Buzzers are paused. Start a new round when everyone is ready."}
        </p>
        {locked && (
          <span className="first-badge">
            <Zap size={14} /> All other buzzers are locked until the next
            question.
          </span>
        )}
      </div>
      <div className="round-controls">
        <button
          className="button primary"
          disabled={disabled}
          onClick={() => void onControl("start")}
        >
          <Play size={17} />
          Start round
        </button>
        <button
          className="button secondary"
          disabled={disabled || !ready}
          onClick={() => void onControl("pause")}
        >
          <Pause size={17} />
          Pause
        </button>
        <button
          className="button secondary"
          disabled={disabled}
          onClick={() => void onControl("reset")}
        >
          <ArrowRight size={17} />
          Next question
        </button>
        <button
          className="icon-button reset-button"
          disabled={disabled}
          aria-label="Reset buzzers"
          title="Reset buzzers"
          onClick={() => setConfirmReset(true)}
        >
          <RotateCcw size={18} />
        </button>
      </div>
      {confirmReset && (
        <div className="confirm-reset">
          <span>Clear the winner and open a new round?</span>
          <button
            className="text-button"
            disabled={disabled}
            onClick={async () => {
              if (await onControl("reset")) setConfirmReset(false);
            }}
          >
            Reset buzzers
          </button>
          <button
            className="text-button"
            onClick={() => setConfirmReset(false)}
          >
            Cancel
          </button>
        </div>
      )}
      <div className="card-note">
        Start, next question, and reset open a new round. Pause preserves the
        current round.
      </div>
    </section>
  );
}
