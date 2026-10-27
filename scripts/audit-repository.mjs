// Read-only, heuristic credential scan. Never print matching credential values.
// Git history means objects reachable from local refs, not unknown remote refs.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const git = (...args) =>
  execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 });
const findings = [];
let blobs = 0;
let builtFiles = 0;
function scan(buffer, label) {
  if (buffer.includes(0)) return; // binary images are inspected separately
  const text = buffer.toString("utf8");
  const patterns = [
    ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{16,}/],
    ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    [
      "GitHub credential",
      /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})/,
    ],
    ["AWS access key", /(?:AKIA|ASIA)[A-Z0-9]{16}/],
    ["database password URL", /postgres(?:ql)?:\/\/[^\s:/]+:[^\s@]{4,}@/],
  ];
  for (const [category, pattern] of patterns)
    if (pattern.test(text)) findings.push({ label, category });
  for (const token of text.matchAll(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  )) {
    try {
      if (
        JSON.parse(Buffer.from(token[0].split(".")[1], "base64url")).role ===
        "service_role"
      )
        findings.push({ label, category: "service-role JWT" });
    } catch {
      /* not a JWT */
    }
  }
}
const files = [
  ...new Set(
    git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
      .toString()
      .split("\0")
      .filter(Boolean),
  ),
];
for (const path of files) {
  if (/(^|\/)\.env(?:\.|$)/.test(path) && path !== ".env.example")
    findings.push({ label: path, category: "tracked environment file" });
  try {
    scan(readFileSync(path), path);
  } catch {
    /* staged removal */
  }
}
const objects = git("rev-list", "--objects", "--all")
  .toString()
  .trim()
  .split("\n");
for (const entry of objects) {
  const oid = entry.split(" ")[0];
  if (git("cat-file", "-t", oid).toString().trim() !== "blob") continue;
  blobs += 1;
  const path = entry.slice(oid.length + 1);
  if (/(^|\/)\.env(?:\.|$)/.test(path) && path !== ".env.example")
    findings.push({
      label: `history ${entry}`,
      category: "environment file in history",
    });
  scan(git("cat-file", "blob", oid), `history ${entry}`);
}
if (process.argv.includes("--dist")) {
  for (const file of readdirSync("dist", {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!file.isFile()) continue;
    const path = join(file.parentPath, file.name);
    scan(readFileSync(path), `build ${path}`);
    builtFiles += 1;
  }
}
if (findings.length) {
  console.error(JSON.stringify(findings, null, 2));
  process.exitCode = 1;
} else
  console.log(
    `PASS heuristic credential scan: ${files.length} tracked/unignored paths, ${blobs} reachable Git blobs, ${builtFiles} build files; no matched privileged credentials. Binary content and personal data need human review.`,
  );
