export type PublicEnvironment = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

export const missingConfiguration =
  "Live rooms need Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, apply the migrations, and rebuild or restart Vite. See README.md.";

// Shared by Vite and the browser. Never include a supplied value in errors.
export function readPublicConfiguration(
  env: PublicEnvironment,
  { required = false, https = false } = {},
): { url: string; key: string } | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const keys = [
    env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim(),
    env.VITE_SUPABASE_ANON_KEY?.trim(),
  ].filter((value): value is string => !!value);
  for (const key of keys) {
    let safe = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
    if (!safe) {
      try {
        safe =
          key.split(".").length === 3 &&
          JSON.parse(
            atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
          ).role === "anon";
      } catch {
        /* Invalid and privileged keys cannot enter a production bundle. */
      }
    }
    if (!safe)
      throw new Error(
        "Use only a browser-safe Supabase publishable/anon key. Refusing to embed an invalid or privileged key.",
      );
  }
  let parsed: URL | undefined;
  if (url) {
    try {
      parsed = new URL(url);
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
        parsed.hostname,
      );
      if (
        (parsed.protocol !== "https:" &&
          !(parsed.protocol === "http:" && loopback && !https)) ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash ||
        parsed.pathname !== "/"
      )
        throw new Error();
    } catch {
      throw new Error(
        "Use a Supabase HTTPS project origin without credentials, paths, query parameters, or fragments. HTTP is supported only for local development on loopback.",
      );
    }
  }
  if (!parsed || !keys.length) {
    if (required) throw new Error(missingConfiguration);
    return null;
  }
  return { url: parsed.origin, key: keys[0] };
}
