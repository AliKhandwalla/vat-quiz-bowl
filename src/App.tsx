import { useEffect, useMemo, useReducer, useRef, useState } from "react";
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
  Minus,
  Monitor,
  Plus,
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
  const [game, dispatch] = useReducer(gameReducer, initialGame);
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
  const teams = Array.from(new Set(players.map((p) => p.team)));
  const scoreTeams = teams.length ? teams : ["Blue", "Gold"];
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
  useEffect(() => {
    dispatch({ type: "reset" });
  }, [live.session?.roomId]);
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
                Live rooms and buzzers. Scores remain a local preview.
              </span>
            </span>
            <span className="phase-label">
              PHASE 03 <span>REALTIME BUZZERS</span>
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
                  Create a room and share its code. Students join with their
                  name and team. Start opens a new round; Pause disables
                  buzzing. Next question and Reset clear the winner and open a
                  new round. The first valid buzz accepted by the server wins
                  and locks everyone else out. Scores remain local previews.
                  Refreshing restores authoritative room and buzzer state.
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
                  <HostBuzzer
                    state={buzzer}
                    connection={live.connection}
                    busy={live.busy}
                    onControl={live.control}
                  />
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
                          className={`player-row ${player.id === winner?.id ? "winner-row" : ""}`}
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
                          {player.id === winner?.id ? (
                            <span className="first-text">
                              <Zap size={14} /> First buzz
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

                          <span className="player-number">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="card-note">
                      <Sparkles size={14} /> Live roster · offline players are
                      retained. Winner results synchronize across this room.
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
                            {players.filter((p) => p.team === t).length} players
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
                      Buzzers and round controls are live. The server accepts
                      one valid winner per round. Scores remain a local preview
                      until a later phase.
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
                  <PlayerBuzzer
                    state={buzzer}
                    selfId={selfId}
                    name={playerName}
                    team={playerTeam}
                    connection={live.connection}
                    buzzing={live.buzzing}
                    error={live.buzzError}
                    onBuzz={live.buzz}
                  />
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
                    <section className="tip-card live-room-help">
                      <span className="eyebrow muted">
                        <Zap size={13} /> LIVE BUZZER
                      </span>
                      <h3>Listen. Think. Buzz.</h3>
                      <p>
                        One winner is accepted by the server. The host opens a
                        new round to unlock every buzzer. Network arrival order
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
