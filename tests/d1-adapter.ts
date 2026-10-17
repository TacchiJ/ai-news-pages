import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

/** Actual SQLite constraints, triggers and atomic rollback, using D1's API shape. */
export function testDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${file}`, "utf8"));
  const prepare = (sql: string) => {
    let args: (string | number | null)[] = [];
    return {
      bind(...v: unknown[]) {
        args = v as typeof args;
        return this;
      },
      async first() {
        return sqlite.prepare(sql).get(...args) ?? null;
      },
      async all() {
        return { results: sqlite.prepare(sql).all(...args) };
      },
      async run() {
        return sqlite.prepare(sql).run(...args);
      },
    };
  };
  const db = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return {
    db: db as unknown as D1Database,
    sqlite,
    close: () => sqlite.close(),
  };
}
