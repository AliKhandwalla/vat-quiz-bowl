import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const config = JSON.parse(await readFile("vercel.json", "utf8"));
const origin = "http://127.0.0.1:4173";
for (const path of ["/", ...config.rewrites.map((r) => r.source)]) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get("content-type"), /text\/html/);
  for (const h of config.headers[0].headers)
    assert.equal(response.headers.get(h.key), h.value);
  assert.match(await response.text(), /<div id="root"><\/div>/);
}
assert.equal((await fetch(origin + "/assets/missing.js")).status, 404);
const html = await (await fetch(origin)).text();
for (const asset of html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)) {
  const response = await fetch(origin + asset[1]);
  assert.equal(response.status, 200, asset[1]);
  assert.doesNotMatch(response.headers.get("content-type"), /text\/html/);
}
console.log(
  "PASS static production artifact: home + four dashboard aliases, security headers, referenced assets, missing assets return 404",
);
