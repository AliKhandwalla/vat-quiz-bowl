import { createClient } from "@supabase/supabase-js";
import { missingConfiguration, readPublicConfiguration } from "./publicConfig";

function initializeSupabase() {
  try {
    // Read only the documented variables: passing import.meta.env wholesale
    // would make unrelated VITE_* values eligible for bundle inclusion.
    const config = readPublicConfiguration(
      {
        VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env
          .VITE_SUPABASE_PUBLISHABLE_KEY,
        VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      { https: import.meta.env.PROD },
    );
    if (!config) return { client: null, error: missingConfiguration };
    // Credentials intentionally live only for this browser tab/session.
    sessionStorage.setItem("vat.storage-check", "1");
    sessionStorage.removeItem("vat.storage-check");
    // Distinct keys isolate storage and the SDK auth BroadcastChannel so
    // independent tabs cannot replace one another's guest identity.
    let id = sessionStorage.getItem("vat.auth-tab-id");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("vat.auth-tab-id", id);
    }
    const client = createClient(config.url, config.key, {
      auth: {
        storage: sessionStorage,
        storageKey: `vat.guest-auth.${id}`,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal ?? AbortSignal.timeout(15_000),
          }),
      },
    });
    return { client, error: null };
  } catch {
    // SDK, storage, crypto and configuration failures leave the app renderable.
    return {
      client: null,
      error:
        "Supabase configuration or browser session storage is unavailable. Use a valid HTTPS project origin and a browser-safe publishable/anon key, allow session storage, and reload. Never use a secret or service-role key.",
    };
  }
}
export const { client: supabase, error: configurationError } =
  initializeSupabase();

let signIn: Promise<string> | null = null;
export async function ensureGuest(): Promise<string> {
  if (!supabase) throw new Error(configurationError!);
  if (signIn) return signIn;
  signIn = (async () => {
    const { data: current, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (current.session) return current.session.user.id;
    const { data, error: signInError } =
      await supabase.auth.signInAnonymously();
    if (signInError) throw signInError;
    if (!data.user) throw new Error("AUTH_REQUIRED");
    return data.user.id;
  })();
  try {
    return await signIn;
  } finally {
    signIn = null;
  }
}
