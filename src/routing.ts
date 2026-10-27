export type Page = "home" | "host" | "player";

// Keep existing shared hash links; also accept refreshable Vercel path aliases.
export function resolvePage(pathname: string, hash: string): Page {
  const route = hash ? hash.slice(1) : pathname;
  if (route === "/host" || route === "/host/") return "host";
  if (route === "/player" || route === "/player/") return "player";
  return "home";
}
