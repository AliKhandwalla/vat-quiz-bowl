import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const rows = readdirSync("dist/assets")
  .filter((f) => f.endsWith(".js"))
  .map((file) => {
    const content = readFileSync(`dist/assets/${file}`);
    return { file, bytes: content.length, gzip: gzipSync(content).length };
  });
console.table(rows);
console.log(
  JSON.stringify({
    totalBytes: rows.reduce((n, r) => n + r.bytes, 0),
    totalGzip: rows.reduce((n, r) => n + r.gzip, 0),
    largestChunk: Math.max(...rows.map((r) => r.bytes)),
  }),
);
