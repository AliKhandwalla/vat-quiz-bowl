import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Flag,
  GraduationCap,
  Home,
  LogIn,
  Monitor,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Scoreboard,
  TeamManager,
  MatchControls,
  MatchSummary,
  MatchHistory,
} from "./components/Competition";
import { useRoom } from "./rooms/useRoom";
import { isOnline } from "./rooms/types";
import { HostBuzzer } from "./components/HostBuzzer";
import { PlayerBuzzer } from "./components/PlayerBuzzer";

type Page = "home" | "host" | "player";
const pageFromHash = (): Page =>
  location.hash === "#/host"
    ? "host"
    : location.hash === "#/player"
      ? "player"
      : "home";
const Icon = ({
  icon: Component,
  size = 20,
}: {
  icon: LucideIcon;
  size?: number;
}) => <Component size={size} strokeWidth={1.8} aria-hidden="true" />;

export default function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const live = useRoom();
  const [dismissedSummary, setDismissedSummary] = useState<string | null>(null);
  const [room, setRoom] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState("Blue");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [help, setHelp] = useState(false);
  const joinRef = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const listener = () => setPage(pageFromHash());
    window.addEventListener("hashchange", listener);
    return () => {
      window.removeEventListener("hashchange", listener);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);
  const navigate = (next: Page) => {
    location.hash = next === "home" ? "/" : `/${next}`;
    setPage(next);
    window.scrollTo(0, 0);
  };
  const roomCode = live.snapshot?.room.code ?? live.session?.code ?? "------";
  const selfId = live.session?.role === "player" ? live.session.playerId : "";
  const ownPlayer = live.snapshot?.players.find((p) => p.id === selfId);
  const joined = !!ownPlayer;
  const players = useMemo(
    () =>
      live.snapshot?.players.map((p) => ({
        id: p.id,
        name: p.display_name,
        team: p.team_name,
        lastSeen: p.last_seen_at,
      })) ?? [],
    [live.snapshot?.players],
  );
  const teams = live.snapshot?.teams ?? [];
  const match = live.snapshot?.match ?? null;
  const active = match?.status === "active";
  const mutationDisabled =
    live.busy ||
    !!live.pendingRequest ||
    live.competitionSyncing ||
    live.connection !== "connected" ||
    !live.snapshot?.competition;
  const winnerTeamId =
    live.snapshot?.buzzer?.winning_team_id ??
    live.snapshot?.players.find(
      (p) => p.id === live.snapshot?.buzzer?.winning_player_id,
    )?.team_id;
  const shortcuts = live.snapshot?.competition?.scoring_shortcuts ?? [
    10, 5, -5,
  ];
  const playerName = ownPlayer?.display_name ?? name;
  const playerTeam = ownPlayer?.team_name ?? team;
  const buzzer = live.snapshot?.buzzer ?? null;
  const winner =
    buzzer?.status === "locked"
      ? {
          id: buzzer.winning_player_id,
          name: buzzer.winning_name,
          team: buzzer.winning_team,
        }
      : null;
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(`Room code: ${roomCode}. Select and copy it manually.`);
    }
  }
  async function hostGame() {
    setError("");
    if (live.session?.role === "host") {
      navigate("host");
      return;
    }
    if (await live.create()) navigate("host");
  }
  async function join() {
    if (!/^[A-Z2-9]{6}$/.test(room.trim().toUpperCase())) {
      setError("Enter the six-character code shared by your host.");
      joinRef.current?.focus();
      return;
    }
    if (!name.trim() || !team.trim()) {
      setError("Enter your display name and team name to join.");
      return;
    }
    setError("");
    if (await live.join(room, name, team)) navigate("player");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="#/" className="brand" aria-label="VAT Quiz Bowl home">
          <span className="brand-mark">
            <GraduationCap size={26} />
          </span>
          <span>
            VAT<span className="brand-sub">QUIZ BOWL</span>
          </span>
        </a>
        <div className="sidebar-rule" />
        <div className="nav-caption">THE COMPETITION HUB</div>
        <nav aria-label="Main navigation">
          {(
            [
              { id: "home", title: "Overview", icon: Home },
              { id: "host", title: "Host dashboard", icon: Monitor },
              { id: "player", title: "Player dashboard", icon: Zap },
            ] as const
          ).map((item) => (
            <a
              key={item.id}
              href={`#/${item.id === "home" ? "" : item.id}`}
              aria-current={page === item.id ? "page" : undefined}
              className={`nav-item ${page === item.id ? "active" : ""}`}
            >
              <Icon icon={item.icon} />
              <span>{item.title}</span>
              {page === item.id && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="club-card">
            <span className="club-icon">
              <Icon icon={Trophy} />
            </span>
            <strong>One team. Every answer.</strong>
            <p>
              A little knowledge.
              <br />A lot of possibility.
            </p>
            <span className="mini-stars">✦ &nbsp; ✦ &nbsp; ✦</span>
          </div>
          <button className="help-button" onClick={() => setHelp(!help)}>
            <Icon icon={CircleHelp} /> How it works <ChevronRight size={16} />
          </button>
          <div className="sidebar-credit">
            VILLAGE ACADEMIC TEAM<span>Think fast. Think together.</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>
              {page === "home"
                ? "Overview"
                : page === "host"
                  ? "Host dashboard"
                  : "Player dashboard"}
            </strong>
          </span>
          <div className="topbar-right">
            <span className="demo-pill">
              <span />{" "}
              {live.session
                ? live.connection === "connected"
                  ? "Live room"
                  : "Reconnecting"
                : "Multiplayer rooms"}
            </span>
            <span className="avatar">VA</span>
          </div>
        </header>
        <main>
          <div className="demo-banner">
            <span>
              <Icon icon={Sparkles} size={16} />
              <strong>Live rooms. Familiar competition.</strong>
              <span className="banner-detail">
                {" "}
                Live teams, scores, questions, and buzzers.
              </span>
            </span>
            <span className="phase-label">
              PHASE 04 <span>COMPETITION MANAGEMENT</span>
            </span>
          </div>
          {(live.configurationError || live.error || error) && (
            <section className="connection-notice" role="alert">
              <div>{error || live.error || live.configurationError}</div>
              {live.session && (
                <button
                  className="text-button"
                  disabled={live.busy}
                  onClick={live.reconnect}
                >
                  Retry connection
                </button>
              )}
            </section>
          )}
          {live.snapshot && !live.snapshot.competition && (
            <section className="connection-notice" role="alert">
              Competition controls require the Phase IV migration:
              supabase/migrations/202610270003_competition.sql. Apply it in
              Supabase SQL Editor and retry.
            </section>
          )}
          {live.session?.role === "host" &&
            live.pendingRequest &&
            !live.busy && (
              <section className="connection-notice" role="status">
                <span>
                  {live.busy ? "Saving" : "Confirm saved action"}:{" "}
                  {live.pendingRequest.action.replaceAll("_", " ")}. A retry
                  will not count it twice.
                </span>
                <button
                  className="button secondary small"
                  disabled={live.busy || live.connection !== "connected"}
                  onClick={() => void live.retryCompetition()}
                >
                  Retry saved action
                </button>
              </section>
            )}
          {page !== "home" &&
            match?.status === "ended" &&
            dismissedSummary !== match.id &&
            (live.snapshot?.is_host || joined) && (
              <MatchSummary
                match={match}
                disabled={mutationDisabled}
                onDismiss={() => setDismissedSummary(match.id)}
                onNewMatch={
                  live.snapshot?.is_host
                    ? () => void live.mutate("new_match")
                    : undefined
                }
              />
            )}
          {live.snapshot && !buzzer && (
            <section className="connection-notice" role="alert">
              Live buzzers require the Phase III migration. Apply
              supabase/migrations/202610270002_quiz_buzzer.sql in the Supabase
              SQL Editor, then retry the connection.
            </section>
          )}
          {live.session && (
            <section className="room-live-strip" aria-live="polite">
              <span className={`connection-indicator ${live.connection}`} />
              <span>
                {live.connection === "connected"
                  ? "Connected"
                  : live.connection === "offline"
                    ? "Offline"
                    : "Connecting / retrying"}{" "}
                · Room <strong>{roomCode}</strong> ·{" "}
                {live.session.role === "host"
                  ? "Host session"
                  : "Player session"}
              </span>
              {live.snapshot && (
                <span className="room-open-label">
                  {live.snapshot.room.accepting_players
                    ? "Joining open"
                    : "Joining closed"}{" "}
                  ·{" "}
                  {
                    players.filter((p) => isOnline(p.lastSeen, live.serverNow))
                      .length
                  }{" "}
                  online
                </span>
              )}
            </section>
          )}
          {help && (
            <section className="help-panel">
              <div>
                <strong>From question to quick thinking.</strong>
                <p>
                  Create a room and share its code. Assign players to teams,
                  open a question, and judge each answer before adding or
                  deducting points. Next Question advances the question and
                  safely resets buzzers. Next Round starts question 1 of a new
                  competition round. End Match freezes the standings; Start New
                  Match resets scores and counters while retaining teams and
                  players.
                </p>
              </div>
              <button className="text-button" onClick={() => setHelp(false)}>
                Close
              </button>
            </section>
          )}
          {page === "home" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <span /> THE VILLAGE ACADEMIC TEAM
                  </div>
                  <h1>
                    Great minds.
                    <br />
                    Quick reflexes.
                    <br />
                    <span>Game on.</span>
                  </h1>
                  <p>
                    Your team's next great round starts here.
                    <br className="desktop-break" /> Host a room, grab your
                    buzzer, and put your
                    <br className="desktop-break" /> knowledge to the test.
                  </p>
                  <div className="hero-actions">
                    <button
                      className="button primary"
                      disabled={live.busy}
                      onClick={() => void hostGame()}
                    >
                      <Icon icon={Monitor} size={18} />
                      {live.busy ? "Connecting…" : "Host a Game"}
                      <ArrowRight size={17} />
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => {
                        document.getElementById("join-room")?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                        joinRef.current?.focus();
                      }}
                    >
                      Join a Game
                      <ArrowDown size={17} />
                    </button>
                  </div>
                  <div className="hero-footnote">
                    <ShieldCheck size={15} /> Built for teamwork. Ready for a
                    challenge.
                  </div>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <span className="art-star star-one">✦</span>
                  <span className="art-star star-two">✧</span>
                  <div className="art-label">
                    <span /> KNOWLEDGE MEETS COMPETITION
                  </div>
                  <div className="buzzer-plinth">
                    <div className="buzzer-base">
                      <div className="buzzer-ring">
                        <div className="buzzer-top">
                          <Zap
                            size={69}
                            fill="currentColor"
                            strokeWidth={1.2}
                          />
                        </div>
                      </div>
                      <span className="buzzer-led" />
                    </div>
                    <div className="plinth-shadow" />
                  </div>
                  <div className="floating-tag fast-tag">
                    <span className="tag-icon">
                      <Zap size={18} />
                    </span>
                    <span>
                      <strong>Think fast.</strong>
                      <small>Make your moment count.</small>
                    </span>
                  </div>
                  <div className="floating-tag ready-tag">
                    <span className="ready-light" />
                    <span>Ready when you are.</span>
                  </div>
                  <div className="art-caption">
                    THE NEXT ANSWER COULD BE YOURS.
                  </div>
                </div>
              </section>
              <section className="quick-start">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow muted">TAKE YOUR PLACE</span>
                    <h2>Every great round starts somewhere.</h2>
                  </div>
                  <span className="section-note">
                    Your room. Your team. Your moment.
                  </span>
                </div>
                <div className="entry-grid">
                  <article className="card host-entry">
                    <span className="square-icon blue">
                      <Icon icon={Monitor} size={24} />
                    </span>
                    <h3>Lead the competition.</h3>
                    <p>
                      Set the pace, manage the buzzers, and keep
                      <br className="desktop-break" /> every point in play.
                    </p>
                    <button
                      className="text-button"
                      disabled={live.busy}
                      onClick={() => void hostGame()}
                    >
                      Open host dashboard <ArrowRight size={17} />
                    </button>
                    <span className="entry-watermark">
                      <Flag size={108} />
                    </span>
                  </article>
                  <article className="card join-entry" id="join-room">
                    <div className="join-heading">
                      <span className="square-icon gold">
                        <Icon icon={LogIn} size={24} />
                      </span>
                      <div>
                        <h3>Got a room code?</h3>
                        <p>Your seat at the buzzer is waiting.</p>
                      </div>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void join();
                      }}
                    >
                      <div className="join-inputs">
                        <label>
                          Room code
                          <input
                            ref={joinRef}
                            value={room}
                            onChange={(e) => {
                              setRoom(e.target.value.toUpperCase());
                              setError("");
                            }}
                            placeholder="ABC234"
                            maxLength={6}
                            autoComplete="off"
                            aria-describedby="join-hint"
                          />
                        </label>
                        <label>
                          Your name
                          <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Alex Morgan"
                            maxLength={40}
                            autoComplete="given-name"
                          />
                        </label>
                        <label>
                          Team preference
                          <input
                            value={team}
                            onChange={(e) => setTeam(e.target.value)}
                            placeholder="e.g. Blue"
                            maxLength={32}
                            required
                            autoComplete="off"
                          />
                        </label>
                      </div>
                      <div className="join-footer">
                        <small id="join-hint">
                          Team assignments are made by your host.
                        </small>
                        <button
                          type="submit"
                          disabled={live.busy}
                          className="button primary small"
                        >
                          {live.busy ? "Joining…" : "Join room"}{" "}
                          <ArrowRight size={16} />
                        </button>
                      </div>
                      {(error || live.error) && (
                        <p className="error" aria-live="polite">
                          {error || live.error}
                        </p>
                      )}
                    </form>
                  </article>
                </div>
              </section>
              <section className="values-strip">
                <div>
                  <Icon icon={Zap} />
                  <span>
                    <strong>Every second counts</strong>
                    <small>A clear buzz. A fair first answer.</small>
                  </span>
                </div>
                <div>
                  <Icon icon={Users} />
                  <span>
                    <strong>Better as a team</strong>
                    <small>Individual knowledge. Collective wins.</small>
                  </span>
                </div>
                <div>
                  <Icon icon={BookOpen} />
                  <span>
                    <strong>Curiosity wins here</strong>
                    <small>One question closer to something new.</small>
                  </span>
                </div>
              </section>
            </>
          )}
          {page === "host" && !live.snapshot?.is_host && (
            <section className="card player-join">
              <span className="square-icon blue">
                <Icon icon={Monitor} size={26} />
              </span>
              <h2>
                {live.session?.role === "host"
                  ? "Restoring your host session."
                  : "Take the moderator’s seat."}
              </h2>
              <p>
                {live.session?.role === "host"
                  ? "Connecting to your saved room. You can retry if the connection was interrupted."
                  : "Create a live room to invite players. Moderator controls require the original host credential."}
              </p>
              <button
                className="button primary"
                disabled={live.busy}
                onClick={() =>
                  live.session?.role === "host"
                    ? live.reconnect()
                    : void hostGame()
                }
              >
                {live.session?.role === "host"
                  ? "Retry connection"
                  : "Host a Game"}{" "}
                <ArrowRight size={18} />
              </button>
              {live.session && (
                <button
                  className="text-button new-session-button"
                  onClick={() => {
                    live.forget();
                    navigate("home");
                  }}
                >
                  Return to overview and clear saved room
                </button>
              )}
            </section>
          )}
          {page === "host" && live.snapshot?.is_host && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow muted">
                    YOU'RE IN THE MODERATOR'S SEAT
                  </div>
                  <h1>
                    Host dashboard<span className="title-dot">.</span>
                  </h1>
                  <p>A fair start. A clear winner. You're in control.</p>
                </div>
                <button
                  className="room-badge"
                  onClick={copyCode}
                  aria-label={`Copy room code ${roomCode}`}
                >
                  <span>
                    ROOM CODE<strong>{roomCode}</strong>
                  </span>
                  {copied ? <Check size={19} /> : <Copy size={19} />}
                </button>
              </div>
              <section className="room-management card">
                <span>
                  <ShieldCheck size={17} />
                  <strong>
                    {live.snapshot.room.accepting_players
                      ? "Room is open for joining"
                      : "New players cannot join"}
                  </strong>
                  <small>Live host control · verified by the server</small>
                </span>
                <button
                  className="button secondary"
                  disabled={mutationDisabled || !active}
                  onClick={() =>
                    void live.setJoining(!live.snapshot!.room.accepting_players)
                  }
                >
                  {live.snapshot.room.accepting_players
                    ? "Close joining"
                    : "Reopen joining"}
                </button>
              </section>
              {match && (
                <MatchControls
                  match={match}
                  disabled={mutationDisabled}
                  onAction={live.mutate}
                  onSummary={() => setDismissedSummary(null)}
                />
              )}
              <div className="dashboard-grid">
                <div className="dashboard-main">
                  <HostBuzzer
                    state={buzzer}
                    connection={live.connection}
                    busy={mutationDisabled || !active}
                    match={match}
                    onNextQuestion={() => live.mutate("next_question")}
                    onControl={live.control}
                  />
                  <TeamManager
                    teams={teams}
                    players={live.snapshot.players}
                    serverNow={live.serverNow}
                    disabled={mutationDisabled || !active}
                    onAction={live.mutate}
                  />
                </div>
                <aside className="dashboard-side">
                  <Scoreboard
                    teams={teams}
                    players={live.snapshot.players}
                    shortcuts={shortcuts}
                    winnerTeamId={winnerTeamId}
                    winnerName={winner?.name}
                    responseKey={`${match?.id}:${buzzer?.round_id}:${winner?.id}`}
                    disabled={mutationDisabled || !active}
                    onAction={live.mutate}
                  />
                  <div className="tip-card">
                    <Icon icon={Volume2} />
                    <h3>Read. Pause. Reveal.</h3>
                    <p>
                      A buzz identifies the first accepted response. The host
                      judges the answer and chooses the team and score
                      adjustment. Nothing is awarded automatically.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}
          {page === "player" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow muted">
                    YOUR KNOWLEDGE. YOUR MOMENT.
                  </div>
                  <h1>
                    Player dashboard<span className="title-dot">.</span>
                  </h1>
                  <p>Stay sharp. Listen closely. Make your buzz count.</p>
                </div>
                <span className="demo-pill">
                  <span />
                  Room {roomCode}
                </span>
              </div>
              {joined && match?.status === "ended" && (
                <MatchControls
                  match={match}
                  disabled={mutationDisabled}
                  onSummary={() => setDismissedSummary(null)}
                />
              )}
              {!joined ? (
                <section className="card player-join">
                  <span className="square-icon blue">
                    <Icon icon={LogIn} size={26} />
                  </span>
                  <h2>Take your place at the buzzer.</h2>
                  <p>
                    Join from the overview with your host’s room code, display
                    name, and team name.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => {
                      navigate("home");
                      setTimeout(() => {
                        document
                          .getElementById("join-room")
                          ?.scrollIntoView({ behavior: "smooth" });
                        joinRef.current?.focus();
                      }, 50);
                    }}
                  >
                    Join a Game <ArrowRight size={18} />
                  </button>
                </section>
              ) : (
                <div className="player-layout">
                  <PlayerBuzzer
                    state={buzzer}
                    selfId={selfId}
                    name={playerName}
                    team={playerTeam}
                    connection={live.connection}
                    buzzing={live.buzzing}
                    error={live.buzzError}
                    match={match}
                    syncing={live.competitionSyncing}
                    onBuzz={live.buzz}
                  />
                  <aside>
                    <Scoreboard
                      teams={teams}
                      players={live.snapshot!.players}
                      shortcuts={shortcuts}
                      disabled={true}
                    />
                    <section className="tip-card live-room-help">
                      <span className="eyebrow muted">
                        <Zap size={13} /> LIVE BUZZER
                      </span>
                      <h3>Listen. Think. Buzz.</h3>
                      <p>
                        One winner is accepted by the server. The host opens a
                        question to unlock every buzzer. Network arrival order
                        can differ from physical press order.
                      </p>
                      <button
                        className="button secondary"
                        onClick={() => void live.refresh()}
                      >
                        Refresh room state <RotateCcw size={15} />
                      </button>
                    </section>
                  </aside>
                </div>
              )}
            </>
          )}

          {page !== "home" && (live.snapshot?.is_host || joined) && (
            <MatchHistory
              matches={(live.snapshot?.history || []).filter(
                (m) => m.id !== match?.id,
              )}
            />
          )}
          <footer>
            <span>
              <GraduationCap size={17} /> VAT Quiz Bowl{" "}
              <span className="footer-divider">/</span>{" "}
              <span>Village Academic Team</span>
            </span>
            <span>
              Made for the love of learning.
              <span className="footer-spark">✦</span>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
