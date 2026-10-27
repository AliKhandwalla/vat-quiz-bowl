import { useCallback, useEffect, useRef, useState } from "react";
import { configurationError, supabase } from "../lib/supabase";
import * as api from "./api";
import {
  readRoomSession,
  saveRoomSession,
  readCompetitionRequest,
  saveCompetitionRequest,
  clearCompetitionRequest,
} from "./storage";
import { HEARTBEAT_MS } from "./types";
import type {
  BuzzerAction,
  BuzzerState,
  Connection,
  RoomSession,
  RoomSnapshot,
  CompetitionAction,
  CompetitionRequest,
} from "./types";
import { mergeBuzzer, mergeSnapshot } from "./state";
import { createRecoveryGate } from "./recovery";

export function useRoom() {
  const [session, setSession] = useState<RoomSession | null>(() =>
    readRoomSession(),
  );
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [connection, setConnection] = useState<Connection>("idle");
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [buzzError, setBuzzError] = useState("");
  const [buzzing, setBuzzing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [competitionSyncing, setCompetitionSyncing] = useState(false);
  const [pendingRequest, setPendingRequest] =
    useState<CompetitionRequest | null>(() =>
      readCompetitionRequest(session?.roomId),
    );
  const pendingRef = useRef(pendingRequest);
  const targetCompetitionRevision = useRef(0);
  const [retry, setRetry] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const actionRunning = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const buzzFlight = useRef<symbol | null>(null);
  const currentSession = useRef(session);
  currentSession.current = session;
  const currentSnapshot = useRef(snapshot);
  currentSnapshot.current = snapshot;

  useEffect(() => {
    const saved = readCompetitionRequest(session?.roomId);
    pendingRef.current = saved;
    setPendingRequest(saved);
    targetCompetitionRevision.current = 0;
    setCompetitionSyncing(false);
  }, [session?.roomId, session?.role]);
  useEffect(() => {
    if (
      (snapshot?.competition?.revision ?? 0) >=
      targetCompetitionRevision.current
    )
      setCompetitionSyncing(false);
  }, [snapshot?.competition?.revision]);

  useEffect(() => {
    // A new authoritative round can accept a new attempt even if an old HTTP
    // response is still in flight. That old response cannot unlock/overwrite it.
    buzzFlight.current = null;
    setBuzzing(false);
    setBuzzError("");
  }, [session?.roomId, session?.role, snapshot?.buzzer?.round_id]);

  useEffect(() => {
    if (session?.role !== "host") return;
    try {
      saveRoomSession(session);
    } catch {
      setError(
        "Browser session storage is unavailable. Keep this tab open to preserve your host access.",
      );
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const tick = setInterval(() => setClock(Date.now()), 5_000);
    return () => clearInterval(tick);
  }, [session]);

  useEffect(() => {
    if (!session || !supabase) {
      setSnapshot(null);
      setConnection("idle");
      return;
    }
    const client = supabase;
    let disposed = false;
    let fetching = false;
    let fetchAgain = false;
    let pulsing = false;
    const recovery = createRecoveryGate();
    let debounce: ReturnType<typeof setTimeout> | undefined;
    setConnection(navigator.onLine ? "connecting" : "offline");

    async function refresh() {
      if (disposed) return;
      if (fetching) {
        fetchAgain = true;
        return;
      }
      fetching = true;
      const ticket = recovery.beginRead();
      try {
        const next = await api.getSnapshot(session!);
        if (disposed) return;
        setSnapshot((previous) => mergeSnapshot(previous, next));
        if (
          (next.competition?.revision ?? 0) >= targetCompetitionRevision.current
        )
          setCompetitionSyncing(false);
        setServerOffset(Date.parse(next.server_time) - Date.now());
        setClock(Date.now());
        if (recovery.canConnect(ticket, navigator.onLine)) {
          setError("");
          setConnection("connected");
        }
      } catch (failure) {
        if (!disposed) {
          setError(api.friendlyError(failure));
          setConnection(navigator.onLine ? "reconnecting" : "offline");
        }
      } finally {
        fetching = false;
        if (fetchAgain && !disposed) {
          fetchAgain = false;
          void refresh();
        }
      }
    }
    refreshRef.current = refresh;
    function queueRefresh() {
      clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), 100);
    }
    async function pulse() {
      if (disposed || pulsing) return;
      if (!navigator.onLine) {
        setConnection("offline");
        return;
      }
      pulsing = true;
      try {
        const time = await api.heartbeat(session!);
        if (!disposed) {
          setServerOffset(Date.parse(time) - Date.now());
          await refresh();
        }
      } catch (failure) {
        if (!disposed) {
          setConnection(navigator.onLine ? "reconnecting" : "offline");
          setError(api.friendlyError(failure));
        }
      } finally {
        pulsing = false;
      }
    }

    // Subscribe before the snapshot; fetching again on SUBSCRIBED closes the
    // gap between the initial HTTP read and websocket subscription readiness.
    const channel = client
      .channel(`quiz-room:${session.roomId}`, {
        config: { postgres_changes_options: { wait: true } },
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "quiz_competition",
          filter: `room_id=eq.${session.roomId}`,
        },
        (payload) => {
          if (disposed) return;
          const value = payload.new as { revision?: number };
          if (
            (value.revision ?? 0) <=
            (currentSnapshot.current?.competition?.revision ?? -1)
          )
            return;
          targetCompetitionRevision.current = Math.max(
            targetCompetitionRevision.current,
            value.revision ?? 0,
          );
          setCompetitionSyncing(true);
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "quiz_buzzer",
          filter: `room_id=eq.${session.roomId}`,
        },
        (payload) => {
          if (disposed) return;
          const state = payload.new as BuzzerState;
          if (
            state.room_id === session.roomId &&
            typeof state.revision === "number"
          ) {
            // Critical buzzer events are applied immediately. Roster snapshots
            // remain debounced; no extra delay is added to winner delivery.
            setSnapshot((previous) => mergeBuzzer(previous, state));
          } else queueRefresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "quiz_players",
          filter: `room_id=eq.${session.roomId}`,
        },
        queueRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "quiz_rooms",
          filter: `id=eq.${session.roomId}`,
        },
        queueRefresh,
      )
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          recovery.subscribe();
          // Do not re-enable a retained/stale buzzer before the recovery read.
          void refresh();
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          recovery.invalidate();
          setConnection(navigator.onLine ? "reconnecting" : "offline");
          setError(
            "Live updates disconnected. Reconnecting automatically; room snapshots continue to refresh.",
          );
        }
      });
    void pulse();
    // Fallback snapshots also repair missed websocket events. Stale timestamps
    // expire even without a disconnect event or a database cleanup process.
    const interval = setInterval(() => void pulse(), HEARTBEAT_MS);
    const offline = () => {
      recovery.invalidate();
      setConnection("offline");
      setError("You are offline. Reconnect to restore live room updates.");
    };
    const online = () => {
      if (!disposed) setRetry((value) => value + 1);
    };
    const visible = () => {
      if (document.visibilityState === "visible") void pulse();
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      recovery.dispose();
      if (refreshRef.current === refresh) refreshRef.current = async () => {};
      clearInterval(interval);
      clearTimeout(debounce);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
      void client.removeChannel(channel);
    };
  }, [session, retry]);

  const run = useCallback(
    async (operation: () => Promise<RoomSession | void>) => {
      if (actionRunning.current) return false;
      actionRunning.current = true;
      setBusy(true);
      setActionError("");
      try {
        const next = await operation();
        if (next) {
          setSnapshot(null);
          setSession(next);
        }
        return true;
      } catch (failure) {
        setActionError(api.friendlyError(failure));
        return false;
      } finally {
        actionRunning.current = false;
        setBusy(false);
      }
    },
    [],
  );

  async function buzz() {
    const state = snapshot?.buzzer;
    if (
      !session ||
      session.role !== "player" ||
      !state ||
      state.status !== "ready" ||
      connection !== "connected" ||
      competitionSyncing ||
      snapshot?.match?.status !== "active" ||
      buzzFlight.current
    )
      return;
    const flight = Symbol("buzz");
    buzzFlight.current = flight;
    setBuzzing(true);
    setBuzzError("");
    try {
      const result = await api.submitBuzz(session, state.round_id);
      if (currentSession.current?.roomId !== session.roomId) return;
      setSnapshot((previous) => mergeBuzzer(previous, result.buzzer));
      if (buzzFlight.current === flight && !result.accepted) {
        if (result.reason === "stale_round")
          setBuzzError(
            "That attempt belonged to an earlier round. Check the current state before buzzing again.",
          );
        if (result.reason === "paused")
          setBuzzError("Buzzers are paused. Waiting for host.");
        if (result.reason === "match_ended") {
          setBuzzError("The match has ended.");
          void refreshRef.current();
        }
      }
    } catch (failure) {
      if (buzzFlight.current === flight) {
        setBuzzError(
          `${api.friendlyError(failure)} Your buzz was not confirmed; refreshing the server state.`,
        );
        void refreshRef.current();
      }
    } finally {
      if (buzzFlight.current === flight) {
        buzzFlight.current = null;
        setBuzzing(false);
      }
    }
  }

  async function control(action: BuzzerAction) {
    const state = snapshot?.buzzer;
    const success = await run(async () => {
      if (!session) throw new Error("HOST_UNAUTHORIZED");
      if (!state) throw new Error("BUZZER_MIGRATION_REQUIRED");
      const next = await api.controlBuzzer(session, state.round_id, action);
      setSnapshot((previous) => mergeBuzzer(previous, next));
    });
    if (!success) void refreshRef.current();
    return success;
  }

  async function executeCompetition(request: CompetitionRequest) {
    if (!session) throw new Error("HOST_UNAUTHORIZED");
    try {
      const next = await api.manageCompetition(session, request);
      clearCompetitionRequest(request.roomId);
      pendingRef.current = null;
      setPendingRequest(null);
      setSnapshot((previous) =>
        previous?.room.id === next.room.id
          ? mergeSnapshot(previous, next)
          : previous,
      );
    } catch (failure) {
      if (api.isDefinitiveFailure(failure)) {
        clearCompetitionRequest(request.roomId);
        pendingRef.current = null;
        setPendingRequest(null);
      }
      void refreshRef.current();
      throw failure;
    }
  }
  function mutate(
    action: CompetitionAction,
    payload: Record<string, unknown> = {},
  ) {
    return run(async () => {
      if (!session || session.role !== "host")
        throw new Error("HOST_UNAUTHORIZED");
      if (pendingRef.current) throw new Error("PENDING_COMPETITION_ACTION");
      if (!snapshot?.competition || !snapshot.match)
        throw new Error("COMPETITION_MIGRATION_REQUIRED");
      if (connection !== "connected" || competitionSyncing)
        throw new Error("WAIT_FOR_SYNC");
      const request: CompetitionRequest = {
        roomId: session.roomId,
        matchId: snapshot.match.id,
        requestId: crypto.randomUUID(),
        action,
        payload: ["next_question", "next_round"].includes(action)
          ? { ...payload, expected_round_id: snapshot.buzzer?.round_id }
          : payload,
      };
      saveCompetitionRequest(request);
      pendingRef.current = request;
      setPendingRequest(request);
      await executeCompetition(request);
    });
  }

  return {
    session,
    snapshot,
    connection,
    error: actionError || error,
    buzz,
    buzzing,
    buzzError,
    control,
    mutate,
    pendingRequest,
    competitionSyncing,
    retryCompetition: () =>
      run(async () => {
        if (pendingRef.current) await executeCompetition(pendingRef.current);
      }),
    refresh: () => refreshRef.current(),
    busy,
    configurationError,
    serverNow: clock + serverOffset,
    create: () => run(api.resumeOrCreateHost),
    join: (code: string, name: string, team: string) =>
      run(() => api.joinRoom(code, name, team)),
    setJoining: (accepting: boolean) =>
      run(async () => {
        if (!session) throw new Error("HOST_UNAUTHORIZED");
        const room = await api.setAcceptingPlayers(session, accepting);
        setSnapshot((current) =>
          current?.room.id === room.id ? { ...current, room } : current,
        );
      }),
    reconnect: () => setRetry((value) => value + 1),
    forget: () => {
      saveRoomSession(null);
      setSession(null);
      setSnapshot(null);
      setError("");
      setActionError("");
    },
  };
}
