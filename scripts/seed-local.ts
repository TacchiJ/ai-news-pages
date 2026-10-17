import "./sites-env.mjs";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fixture } from "../lib/fixtures.ts";
import { digest, normalize } from "../lib/domain.ts";

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql: string[] = [];
for (const track of ["technical", "general"] as const)
  for (const date of ["2026-10-15", "2026-10-16"]) {
    const e = fixture(track, date),
      id = `${track}:${date}`,
      content = JSON.stringify(e);
    sql.push(
      `INSERT INTO editions (id,track,date,kind,content,digest) VALUES (${[id, track, date, "fixture", content, await digest(content)].map(quote).join(",")}) ON CONFLICT(id) DO NOTHING;`,
    );
    for (const [i, t] of e.topics.entries()) {
      sql.push(
        `INSERT INTO topic_history (id,edition_id,story_key,date) VALUES (${[`${id}:${i}`, id, t.storyKey, date].map(quote).join(",")}) ON CONFLICT(id) DO NOTHING;`,
      );
      for (const q of t.questions)
        sql.push(
          `INSERT INTO question_history (fingerprint,edition_id) VALUES (${[await digest(normalize(q.prompt)), id].map(quote).join(",")}) ON CONFLICT(fingerprint) DO NOTHING;`,
        );
    }
  }
mkdirSync("private-data", { recursive: true });
writeFileSync("private-data/fixtures.sql", sql.join("\n"));
const config = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
if (!config.d1_databases?.length)
  throw new Error("Build with the DB binding first");
const result = spawnSync(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    "dist/server/wrangler.json",
    "--persist-to",
    ".wrangler/state",
    "--file",
    "private-data/fixtures.sql",
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
