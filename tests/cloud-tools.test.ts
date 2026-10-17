import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./d1-adapter.ts";
import { QuizStore } from "../lib/store.ts";
import { callCloudTool, requireCloudOwner } from "../lib/cloud-tools.ts";
import { fixture } from "../lib/fixtures.ts";
import type { Edition } from "../lib/domain.ts";

const weekday = new Date("2026-10-16T11:00:00Z");
test("cloud publishing requires the configured owner, not just visitor sign-in", () => {
  for (const [user, owner] of [
    [undefined, undefined],
    ["visitor", undefined],
    ["visitor", "owner"],
  ])
    assert.throws(() => requireCloudOwner(user, owner), /owner/);
  assert.doesNotThrow(() => requireCloudOwner("owner", "owner"));
});
test("generation context returns only missing tracks and does no weekend work", async () => {
  const { db, close } = testDatabase(),
    store = new QuizStore(db);
  try {
    const weekend = (await callCloudTool(
      store,
      "generation_context",
      {},
      new Date("2026-10-17T11:00:00Z"),
    )) as { due: boolean; missingTracks: string[] };
    assert.equal(weekend.due, false);
    assert.deepEqual(weekend.missingTracks, []);
    assert.equal((await store.all("SELECT * FROM runs")).length, 0);
    await store.publish(fixture("technical"), true);
    const context = (await callCloudTool(
      store,
      "generation_context",
      {},
      weekday,
    )) as {
      missingTracks: string[];
      budget: { authorized: boolean; creditCapEnforced: boolean };
    };
    assert.deepEqual(context.missingTracks, ["general"]);
    assert.equal(context.budget.authorized, true);
    assert.equal(context.budget.creditCapEnforced, false);
    await callCloudTool(store, "generation_context", {}, weekday);
    assert.equal((await store.all("SELECT * FROM runs")).length, 1);
  } finally {
    close();
  }
});
test("cloud readback excludes answer keys and history preserves previous questions", async () => {
  const { db, close } = testDatabase(),
    store = new QuizStore(db);
  try {
    const e = fixture("technical");
    const published = await store.publish(e, true);
    const read = (await callCloudTool(
      store,
      "read_edition",
      { editionId: published.id },
      weekday,
    )) as { digest: string };
    assert.equal(read.digest, published.digest);
    assert.ok(!JSON.stringify(read).includes('"correct":'));
    const history = (await callCloudTool(
      store,
      "story_history",
      { storyKey: e.topics[0].storyKey },
      weekday,
    )) as { topics: { questions: string[] }[] }[];
    assert.equal(
      history[0].topics[0].questions[0],
      e.topics[0].questions[0].prompt,
    );
    await assert.rejects(() =>
      callCloudTool(
        store,
        "publish_edition",
        { edition: e, editorialApproved: false },
        weekday,
      ),
    );
    await assert.rejects(
      () =>
        callCloudTool(store, "read_edition", { editionId: "missing" }, weekday),
      /not found/,
    );
  } finally {
    close();
  }
});
test("cloud outcome refuses false completion, unknown usage stays unknown", async () => {
  const { db, close } = testDatabase(),
    store = new QuizStore(db);
  try {
    await assert.rejects(
      () =>
        callCloudTool(
          store,
          "record_generation_outcome",
          { date: "2026-10-16", status: "completed", code: "published" },
          weekday,
        ),
      /Both researched tracks/,
    );
    await callCloudTool(
      store,
      "record_generation_outcome",
      { date: "2026-10-16", status: "delayed", code: "insufficient-evidence" },
      weekday,
    );
    assert.equal(
      (
        await store.one<{ actual_credits: number | null }>(
          "SELECT actual_credits FROM runs",
        )
      )?.actual_credits,
      null,
    );
    await assert.rejects(
      () =>
        callCloudTool(
          store,
          "record_generation_outcome",
          {
            date: "2026-10-16",
            status: "completed",
            code: "validation-failed",
          },
          weekday,
        ),
      /Completion/,
    );
    await assert.rejects(
      () =>
        callCloudTool(
          store,
          "record_generation_outcome",
          { date: "2026-10-17", status: "failed", code: "writer-failed" },
          new Date("2026-10-17T11:00:00Z"),
        ),
      /weekday/,
    );
  } finally {
    close();
  }
});
test("cloud publication uses the shared evidence writer and exact retries/readback are repeat-safe", async () => {
  const { db, close } = testDatabase(),
    store = new QuizStore(db);
  try {
    const editions: Edition[] = [fixture("technical"), fixture("general")];
    const evidence = editions
      .flatMap((e) => e.topics.map((t) => t.sources[0].evidence))
      .join(" ");
    await store.execute(
      "INSERT INTO source_cache (url,title,published_date,retrieved_at,content,digest) VALUES (?,?,?,?,?,?)",
      "https://openai.com/news/",
      "Synthetic test cache",
      "2026-10-16",
      new Date().toISOString(),
      evidence,
      "test-only",
    );
    for (const e of editions) {
      e.kind = "researched";
      for (const t of e.topics) t.sources[0].url = "https://openai.com/news/";
      const args = { edition: e, editorialApproved: true };
      const result = (await callCloudTool(
        store,
        "publish_edition",
        args,
        weekday,
      )) as { id: string; digest: string; created: boolean };
      assert.equal(result.created, true);
      const retry = (await callCloudTool(
        store,
        "publish_edition",
        args,
        weekday,
      )) as { created: boolean };
      assert.equal(retry.created, false);
      const read = (await callCloudTool(
        store,
        "read_edition",
        { editionId: result.id },
        weekday,
      )) as { digest: string };
      assert.equal(read.digest, result.digest);
    }
    await callCloudTool(
      store,
      "record_generation_outcome",
      {
        date: "2026-10-16",
        status: "completed",
        code: "published",
        actualCredits: 12.5,
      },
      weekday,
    );
    assert.equal(
      (
        await store.one<{ actual_credits: number }>(
          "SELECT actual_credits FROM runs",
        )
      )?.actual_credits,
      12.5,
    );
  } finally {
    close();
  }
});
