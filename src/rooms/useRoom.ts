import { useCallback, useEffect, useRef, useState } from "react";
import { configurationError, supabase } from "../lib/supabase";
import * as api from "./api";
import { readRoomSession, saveRoomSession } from "./storage";
import { HEARTBEAT_MS } from "./types";
import type { Connection, RoomSession, RoomSnapshot } from "./types";

export function useRoom() {
  const [session, setSession] = useState<RoomSession | null>(() =>
    readRoomSession(),
  );
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [connection, setConnection] = useState<Connection>("idle");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const actionRunning = useRef(false);

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
    const tick = setInterval(() => setClock(Date.now()), 5_000);
    return () => clearInterval(tick);
  }, []);

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
    let subscribed = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    setConnection(navigator.onLine ? "connecting" : "offline");

    async function refresh() {
      if (disposed) return;
      if (fetching) {
        fetchAgain = true;
        return;
      }
      fetching = true;
      try {
        const next = await api.getSnapshot(session!);
        if (disposed) return;
        setSnapshot(next);
        setServerOffset(Date.parse(next.server_time) - Date.now());
        setClock(Date.now());
        setError("");
        if (subscribed) setConnection("connected");
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
        subscribed = status === "SUBSCRIBED";
        if (subscribed) {
          setConnection("connected");
          void pulse();
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
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
      setError("");
      try {
        const next = await operation();
        if (next) {
          setSnapshot(null);
          setSession(next);
        }
        return true;
      } catch (failure) {
        setError(api.friendlyError(failure));
        return false;
      } finally {
        actionRunning.current = false;
        setBusy(false);
      }
    },
    [],
  );

  return {
    session,
    snapshot,
    connection,
    error,
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
        setSnapshot((current) => (current ? { ...current, room } : null));
      }),
    reconnect: () => setRetry((value) => value + 1),
    forget: () => {
      saveRoomSession(null);
      setSession(null);
      setSnapshot(null);
      setError("");
    },
  };
}
