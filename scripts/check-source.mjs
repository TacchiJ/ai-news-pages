import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Scan the intended Git file list, including ignored-file mistakes in the index.
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const forbidden = files.filter(
  (f) =>
    /(^|\/)(private-data|node_modules|\.wrangler|test-results|dist)\//.test(
      f,
    ) ||
    /^\.env(?!\.example$)/.test(f) ||
    /^\.dev\.vars/.test(f) ||
    /\.(draft|answers|evidence)\.json$/.test(f) ||
    /\.(sqlite|pem|key)(?:$|\.)/.test(f),
);
const patterns = [
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
for (const f of files) {
  if (f === "package-lock.json") continue;
  const contents = readFileSync(f, "utf8");
  if (patterns.some((re) => re.test(contents))) forbidden.push(f);
  if (f.endsWith(".json")) {
    try {
      const value = JSON.parse(contents);
      if (value?.kind === "researched" && Array.isArray(value?.topics))
        forbidden.push(f);
    } catch {
      /* Non-JSON fixture formats are reviewed manually. */
    }
  }
}
if (forbidden.length) {
  console.error("Source safety check failed for paths:", ...new Set(forbidden));
  process.exitCode = 1;
} else
  console.log(
    `Source safety check passed (${files.length} files). Synthetic fixture answers are intentional; review all staged content manually before pushing.`,
  );
