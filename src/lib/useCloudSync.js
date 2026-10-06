import { useEffect, useRef, useState } from "react";
import { cloudConfigured, getCloudClient } from "./cloud";
import { CloudSync } from "./cloud-sync";
import { statePatch, hasPatch } from "./sync-merge";

export function useCloudSync({ state, setState, loaded, saveBlocked }) {
  const [client, setClient] = useState(null);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(cloudConfigured ? "Connecting…" : "Sync setup pending");
  const latest = useRef(state);
  const engine = useRef(null);
  const previous = useRef(state);

  useEffect(() => { latest.current = state; }, [state]);
  useEffect(() => {
    if (!cloudConfigured) return;
    let cancelled = false;
    let subscription;
    getCloudClient().then(async (value) => {
      if (cancelled) return;
      setClient(value);
      subscription = value.auth.onAuthStateChange((_event, session) => {
        if (!cancelled) setUser(session?.user || null);
      }).data.subscription;
      const { data } = await value.auth.getSession();
      if (!cancelled) setUser(data.session?.user || null);
    }).catch(() => { if (!cancelled) setStatus("Sync setup needs attention"); });
    return () => { cancelled = true; subscription?.unsubscribe(); };
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (!loaded || saveBlocked || !client || !userId) return;
    const sync = new CloudSync({ client, userId,
      getState: () => latest.current,
      onState: (value) => {
        latest.current = value;
        setState((current) => JSON.stringify(current) === JSON.stringify(value) ? current : value);
      }, onStatus: setStatus,
    });
    engine.current = sync;
    void sync.sync();
    const poll = setInterval(() => { if (!document.hidden) void sync.sync(); }, 15000);
    const refresh = () => { if (!document.hidden) void sync.sync(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      sync.stop(); engine.current = null;
      clearInterval(poll);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [client, userId, loaded, saveBlocked, setState]);

  useEffect(() => {
    const dirty = hasPatch(statePatch(previous.current, state));
    previous.current = state;
    if (!dirty || !engine.current) return;
    const timer = setTimeout(() => void engine.current?.sync(), 600);
    return () => clearTimeout(timer);
  }, [state]);

  return { client, user, configured: cloudConfigured,
    status: user ? status : (client ? "Sign in to sync devices" : status),
    syncNow: () => engine.current?.sync(),
  };
}
