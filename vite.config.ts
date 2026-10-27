import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readPublicConfiguration } from "./src/lib/publicConfig";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  const vercel = loadEnv(mode, ".", "VERCEL").VERCEL;
  readPublicConfiguration(env, {
    required: vercel === "1",
    https: mode === "production",
  });
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
