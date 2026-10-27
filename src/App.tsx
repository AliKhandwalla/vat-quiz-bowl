import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Flag,
  GraduationCap,
  Home,
  LogIn,
  Minus,
  Monitor,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { gameReducer, initialGame } from "./demo";
import { useRoom } from "./rooms/useRoom";
import { isOnline } from "./rooms/types";

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
  const [game, dispatch] = useReducer(gameReducer, {
    ...initialGame,
    players: [],
  });
  const [room, setRoom] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState("Blue");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [help, setHelp] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
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
  const teams = Array.from(new Set(players.map((p) => p.team)));
  const scoreTeams = teams.length ? teams : ["Blue", "Gold"];
  const opponent = players.find((p) => p.id !== selfId);
  const playerName = ownPlayer?.display_name ?? name;
  const playerTeam = ownPlayer?.team_name ?? team;
  const winner = game.players.find((p) => p.id === game.first);
  const isFirst = !!selfId && game.first === selfId;
  const locked = !!game.first && !isFirst;
  const buzz = () => dispatch({ type: "buzz", id: selfId });
  useEffect(() => {
    dispatch({ type: "reset" });
  }, [live.session?.roomId]);
  useEffect(() => {
    dispatch({ type: "roster", players });
  }, [players]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        page === "player" &&
        joined &&
        event.code === "Space" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLSelectElement) &&
        !(event.target instanceof HTMLButtonElement)
      ) {
        event.preventDefault();
        dispatch({ type: "buzz", id: selfId });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, joined, selfId]);
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
                Players sync live. Buzzers and scores remain local demos.
              </span>
            </span>
            <span className="phase-label">
              PHASE 02 <span>REALTIME ROOMS</span>
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
                  Create a room and share its code. Students can join from
                  independent browsers or devices with their name and team. Room
                  membership is live; buzzer and score controls are local
                  demonstrations only. Guest and host credentials stay in
                  session storage. Reopening the same tab preserves membership.
                  Online status expires after 75 seconds without a heartbeat;
                  mobile sleep may show a player offline until they return.
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
                          Team name
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
                          Use the code shared by your host.
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
                  disabled={live.busy || live.connection !== "connected"}
                  onClick={() =>
                    void live.setJoining(!live.snapshot!.room.accepting_players)
                  }
                >
                  {live.snapshot.room.accepting_players
                    ? "Close joining"
                    : "Reopen joining"}
                </button>
              </section>
              <div className="dashboard-grid">
                <div className="dashboard-main">
                  <section className="card round-card">
                    <div className="card-heading">
                      <h2>
                        <Icon icon={Radio} /> Buzzer control{" "}
                        <span className="local-badge">LOCAL DEMO</span>
                      </h2>
                      <span
                        className={`status-pill ${game.phase === "live" ? "green" : ""}`}
                      >
                        {game.phase === "live"
                          ? "Round live"
                          : game.phase === "paused"
                            ? "Paused"
                            : "Waiting to start"}
                      </span>
                    </div>
                    <div
                      className={`buzzer-status ${winner ? "has-winner" : ""}`}
                      aria-live="polite"
                    >
                      <span className="round-label">
                        ROUND {String(game.round).padStart(2, "0")}
                      </span>
                      <span className="status-icon">
                        <Icon
                          icon={
                            winner
                              ? Trophy
                              : game.phase === "paused"
                                ? Pause
                                : Bell
                          }
                          size={35}
                        />
                      </span>
                      <h3>
                        {winner
                          ? winner.name
                          : game.phase === "live"
                            ? "The floor is open."
                            : game.phase === "paused"
                              ? "Take a breather."
                              : "Ready for the first question?"}
                      </h3>
                      <p>
                        {winner
                          ? `BUZZED FIRST · TEAM ${winner.team.toUpperCase()}`
                          : game.phase === "live"
                            ? "Buzzers are open. Let the quick thinking begin."
                            : game.phase === "paused"
                              ? "Buzzers are paused. Resume when everyone is ready."
                              : "Start the round to open the buzzers."}
                      </p>
                      {winner && (
                        <span className="first-badge">
                          <Zap size={14} /> Local demo first buzz · no result is
                          sent to other devices
                        </span>
                      )}
                    </div>
                    <div className="round-controls">
                      <button
                        className="button primary"
                        disabled={game.phase === "live"}
                        onClick={() => dispatch({ type: "start" })}
                      >
                        <Play size={17} />
                        {game.phase === "paused" ? "Resume" : "Start round"}
                      </button>
                      <button
                        className="button secondary"
                        disabled={game.phase !== "live"}
                        onClick={() => dispatch({ type: "pause" })}
                      >
                        <Pause size={17} />
                        Pause
                      </button>
                      <button
                        className="button secondary"
                        disabled={game.phase === "ready"}
                        onClick={() => dispatch({ type: "next" })}
                      >
                        <ArrowRight size={17} />
                        Next round
                      </button>
                      <button
                        className="icon-button reset-button"
                        aria-label="Reset game"
                        title="Reset game"
                        onClick={() => setResetConfirm(true)}
                      >
                        <RotateCcw size={18} />
                      </button>
                    </div>
                    {resetConfirm && (
                      <div className="confirm-reset">
                        <span>Reset scores and return to round 1?</span>
                        <button
                          className="text-button"
                          onClick={() => {
                            dispatch({ type: "reset" });
                            setResetConfirm(false);
                          }}
                        >
                          Reset game
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setResetConfirm(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </section>
                  <section className="card">
                    <div className="card-heading">
                      <h2>
                        <Icon icon={Users} /> Connected players
                      </h2>
                      <span className="count-label">
                        {
                          players.filter((p) =>
                            isOnline(p.lastSeen, live.serverNow),
                          ).length
                        }{" "}
                        online · {players.length} total
                      </span>
                    </div>
                    <div className="player-list">
                      {!players.length && (
                        <p className="empty-roster">
                          No players yet. Share your room code to get started.
                        </p>
                      )}
                      {players.map((player, i) => (
                        <div
                          className={`player-row ${player.id === game.first ? "winner-row" : ""}`}
                          key={player.id}
                        >
                          <span
                            className={`player-avatar ${player.team.toLowerCase() === "gold" ? "gold" : "blue"}`}
                          >
                            {player.name
                              .split(" ")
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join("")}
                          </span>
                          <span className="player-info">
                            <strong>
                              {player.name}
                              {player.id === selfId ? " (you)" : ""}
                            </strong>
                            <small>Team {player.team}</small>
                          </span>
                          {player.id === game.first ? (
                            <span className="first-text">
                              <Zap size={14} /> Demo buzz
                            </span>
                          ) : (
                            <span
                              className={`player-ready live-presence ${isOnline(player.lastSeen, live.serverNow) ? "online" : "offline"}`}
                            >
                              <span />
                              {isOnline(player.lastSeen, live.serverNow)
                                ? "Online"
                                : "Offline"}
                            </span>
                          )}
                          <button
                            className="simulate-button"
                            disabled={game.phase !== "live" || !!game.first}
                            onClick={() =>
                              dispatch({ type: "buzz", id: player.id })
                            }
                            aria-label={`Simulate ${player.name} buzzing`}
                          >
                            Demo buzz <Zap size={13} />
                          </button>
                          <span className="player-number">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="card-note">
                      <Sparkles size={14} /> Live roster · offline players are
                      retained. “Demo buzz” affects this tab only.
                    </div>
                  </section>
                </div>
                <aside className="dashboard-side">
                  <section className="card scoreboard">
                    <div className="card-heading">
                      <h2>
                        <Icon icon={Trophy} /> Scoreboard{" "}
                        <span className="local-badge">LOCAL</span>
                      </h2>
                    </div>
                    {scoreTeams.map((t) => (
                      <div
                        className={`score-team ${t.toLowerCase() === "gold" ? "gold" : "blue"}`}
                        key={t}
                      >
                        <div className="score-team-name">
                          <span className="team-dot" />
                          Team {t}
                          <span>
                            {game.players.filter((p) => p.team === t).length}{" "}
                            players
                          </span>
                        </div>
                        <div className="score-number">
                          {game.scores[t] ?? 0}
                          <small>POINTS</small>
                        </div>
                        <div className="score-buttons">
                          <button
                            aria-label={`Subtract 5 points from Team ${t}`}
                            onClick={() =>
                              dispatch({ type: "score", team: t, points: -5 })
                            }
                          >
                            <Minus size={14} />5
                          </button>
                          <button
                            onClick={() =>
                              dispatch({ type: "score", team: t, points: 10 })
                            }
                          >
                            <Plus size={14} />
                            10 pts
                          </button>
                          <button
                            onClick={() =>
                              dispatch({ type: "score", team: t, points: 5 })
                            }
                          >
                            <Plus size={14} />5 pts
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="card-note">
                      Local score demo · scores do not sync to other devices
                    </div>
                  </section>
                  <div className="tip-card">
                    <Icon icon={Volume2} />
                    <h3>Read. Pause. Reveal.</h3>
                    <p>
                      Round controls, buzzers, and scores are local previews.
                      Only rooms, players, joining permissions, and online
                      status are synchronized in Phase II.
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
                  <section className="card player-arena">
                    <div className="player-arena-top">
                      <div className="identity">
                        <span
                          className={`player-avatar ${playerTeam.toLowerCase() === "gold" ? "gold" : "blue"}`}
                        >
                          {playerName.slice(0, 2).toUpperCase()}
                        </span>
                        <span>
                          <strong>{playerName}</strong>
                          <small>Team {playerTeam}</small>
                        </span>
                      </div>
                      <span className="round-label">
                        ROUND {String(game.round).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="local-demo-notice">
                      Local buzzer demo · your buzz is not sent to the host.
                    </div>
                    <div className="player-state" aria-live="polite">
                      <span
                        className={`status-pill ${isFirst ? "gold-pill" : locked ? "" : game.phase === "live" ? "green" : ""}`}
                      >
                        <span />
                        {isFirst
                          ? "Buzzed First"
                          : locked
                            ? "Locked Out"
                            : game.phase === "paused"
                              ? "Paused"
                              : "Ready"}
                      </span>
                      <h2>
                        {isFirst
                          ? "You’re first. Make it count!"
                          : locked
                            ? `${winner?.name} got there first.`
                            : game.phase === "live"
                              ? "Know it? Show it."
                              : game.phase === "paused"
                                ? "A moment to regroup."
                                : "Your next moment is coming."}
                      </h2>
                      <p>
                        {isFirst
                          ? "Your team has the floor. Give your answer to the moderator."
                          : locked
                            ? "Hang tight. Your buzzer will unlock next round."
                            : game.phase === "live"
                              ? "Tap the buzzer when you have the answer."
                              : "Waiting for the moderator to open the buzzers."}
                      </p>
                    </div>
                    <button
                      className={`player-buzz ${isFirst ? "buzz-winner" : ""}`}
                      disabled={game.phase !== "live" || !!game.first}
                      onClick={buzz}
                    >
                      <Zap size={54} fill="currentColor" />
                      <span>
                        {isFirst ? "FIRST!" : locked ? "LOCKED" : "BUZZ"}
                      </span>
                      <small>
                        {isFirst
                          ? "THE FLOOR IS YOURS"
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
                      Local buzzer preview. Live room membership.
                    </div>
                  </section>
                  <aside>
                    <section className="card player-summary">
                      <h2>
                        <Trophy size={20} /> Local score preview
                      </h2>
                      {scoreTeams.map((t) => (
                        <div key={t}>
                          <span>
                            <span
                              className={`team-dot ${t.toLowerCase() === "gold" ? "gold" : "blue"}`}
                            />
                            Team {t}
                            {playerTeam === t && <small>YOU</small>}
                          </span>
                          <strong>{game.scores[t] ?? 0}</strong>
                        </div>
                      ))}
                    </section>
                    <section className="tip-card demo-controls">
                      <span className="eyebrow muted">
                        <Sparkles size={13} /> LOCAL DEMO CONTROLS
                      </span>
                      <h3>Try the whole experience.</h3>
                      <p>
                        These previews affect only your browser. Live host
                        buzzer controls and scoring are reserved for a later
                        phase.
                      </p>
                      <button
                        className="button secondary"
                        disabled={game.phase === "live" && !game.first}
                        onClick={() =>
                          dispatch({
                            type:
                              game.phase === "paused" && !game.first
                                ? "start"
                                : game.phase === "ready"
                                  ? "start"
                                  : "next",
                          })
                        }
                      >
                        <Play size={16} />
                        {game.phase === "ready"
                          ? "Open buzzers"
                          : game.phase === "paused" && !game.first
                            ? "Resume round"
                            : "Next round"}
                      </button>
                      <button
                        className="text-button"
                        disabled={
                          !opponent || game.phase !== "live" || !!game.first
                        }
                        onClick={() =>
                          opponent &&
                          dispatch({ type: "buzz", id: opponent.id })
                        }
                      >
                        Simulate another player <Zap size={15} />
                      </button>
                    </section>
                  </aside>
                </div>
              )}
            </>
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
