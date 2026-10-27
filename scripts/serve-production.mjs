// Local QA only: serve dist with the checked-in aliases and security headers.
// This verifies the static artifact; it is not a Vercel deployment emulator.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const config = JSON.parse(await readFile("vercel.json", "utf8"));
const root = resolve("dist");
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const server = createServer(async (req, res) => {
  for (const header of config.headers[0].headers)
    res.setHeader(header.key, header.value);
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const route =
      config.rewrites.find((r) => r.source === pathname)?.destination ??
      pathname;
    const path = resolve(root, "." + (route === "/" ? "/index.html" : route));
    if (!path.startsWith(root + sep) || !(await stat(path)).isFile())
      throw new Error("Not found");
    res.setHeader(
      "Content-Type",
      mime[extname(path)] ?? "application/octet-stream",
    );
    res.end(await readFile(path));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});
server.listen(4173, "127.0.0.1", () =>
  console.log("Production QA: http://127.0.0.1:4173"),
);
