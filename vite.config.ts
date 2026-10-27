import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  for (const key of [
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    env.VITE_SUPABASE_ANON_KEY,
  ].filter(Boolean)) {
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
  const vercel = loadEnv(mode, ".", "VERCEL").VERCEL;
  if (vercel && (!env.VITE_SUPABASE_URL || !key))
    throw new Error(
      "Configure VITE_SUPABASE_URL and a public Supabase key in Vercel before building.",
    );
  if (vercel && new URL(env.VITE_SUPABASE_URL).protocol !== "https:")
    throw new Error("Production Supabase communication requires an HTTPS URL.");
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("/node_modules/@supabase/")) return "supabase";
            if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id))
              return "react";
          },
        },
      },
    },
  };
});
