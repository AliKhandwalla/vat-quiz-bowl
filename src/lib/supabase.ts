import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

function validateConfig(): string | null {
  if (!url || !key)
    return "Live rooms need Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local, apply the migration, and restart Vite. See README.md.";
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error();
    if (key.startsWith("sb_secret_")) throw new Error();
    if (!key.startsWith("sb_publishable_")) {
      const payload = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.role !== "anon") throw new Error();
    }
    // Credentials intentionally live only for this browser tab/session.
    sessionStorage.setItem("vat.storage-check", "1");
    sessionStorage.removeItem("vat.storage-check");
    return null;
  } catch {
    return "Supabase configuration or browser session storage is unavailable. Use a valid project URL and a browser-safe publishable/anon key, and allow session storage. Never use a secret or service-role key.";
  }
}

export const configurationError = validateConfig();
// A distinct storage key also isolates supabase-js's auth BroadcastChannel.
// Sharing that channel would let one independent tab's guest session replace
// the other tab's Realtime JWT even though sessionStorage itself is isolated.
function guestStorageKey() {
  let id = sessionStorage.getItem("vat.auth-tab-id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("vat.auth-tab-id", id);
  }
  return `vat.guest-auth.${id}`;
}
export const supabase = !configurationError
  ? createClient(url!, key!, {
      auth: {
        storage: sessionStorage,
        storageKey: guestStorageKey(),
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
    })
  : null;

let signIn: Promise<string> | null = null;
export async function ensureGuest(): Promise<string> {
  if (!supabase) throw new Error(configurationError!);
  if (signIn) return signIn;
  signIn = (async () => {
    const { data: current, error } = await supabase!.auth.getSession();
    if (error) throw error;
    if (current.session) return current.session.user.id;
    const { data, error: signInError } =
      await supabase!.auth.signInAnonymously();
    if (signInError) throw signInError;
    return data.user!.id;
  })();
  try {
    return await signIn;
  } finally {
    signIn = null;
  }
}
