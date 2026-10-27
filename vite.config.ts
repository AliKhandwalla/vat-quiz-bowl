import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (key) {
    let safe = key.startsWith("sb_publishable_");
    if (!safe) {
      try {
        safe =
          JSON.parse(
            atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
          ).role === "anon";
      } catch {
        /* Invalid or privileged keys must never reach a bundle. */
      }
    }
    if (!safe)
      throw new Error(
        "Use only a browser-safe Supabase publishable/anon key. Refusing to embed an invalid or privileged key.",
      );
  }
  return { plugins: [react(), tailwindcss()] };
});
