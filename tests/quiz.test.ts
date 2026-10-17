import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./d1-adapter.ts";
import { QuizStore } from "../lib/store.ts";
import { fixture } from "../lib/fixtures.ts";
import {
  validateEdition,
  publicEdition,
  generationDue,
  torontoDate,
  generationStatus,
} from "../lib/domain.ts";
import { runGeneration } from "../lib/pipeline.ts";
import {
  requireSameOrigin,
  readJson,
  secretEquals,
  ownerAuthority,
} from "../lib/security.ts";

test("owner identity and service publishing are separately authorized", async () => {
  const request = new Request("https://quiz.test/api/owner");
  await assert.rejects(() => ownerAuthority(request, {}), /authorization/);
  await assert.rejects(
    () => ownerAuthority(request, { userId: "visitor", ownerId: "owner" }),
    /authorization/,
  );
  assert.equal(
    await ownerAuthority(request, { userId: "owner", ownerId: "owner" }),
    "owner",
  );
  const config = {
    ownerId: "owner",
    publisherToken: "development-only-credential",
  };
  const service = new Request("https://quiz.test/api/owner", {
    method: "POST",
    headers: { authorization: "Bearer development-only-credential" },
  });
  assert.equal(await ownerAuthority(service, config), "publishing-service");
  await assert.rejects(
    () =>
      ownerAuthority(
        new Request(service, { headers: { authorization: "Bearer wrong" } }),
        config,
      ),
    /authorization/,
  );
  await assert.rejects(
    () =>
      ownerAuthority(
        new Request("https://quiz.test/api/owner", {
          method: "POST",
          headers: {
            origin: "https://evil.test",
            "content-type": "application/json",
          },
        }),
        { userId: "owner", ownerId: "owner" },
      ),
    /origin/,
  );
});

test("SQL ranking uses absolute completion time and deterministic identical timestamps", async () => {
  const { store, sqlite, close } = await setup();
  let clock = "2026-10-17T09:00:00.000Z";
  sqlite.function("strftime", { varargs: true }, () => clock);
  try {
    await store.saveProfile("b", "Bea");
    await store.saveProfile("c", "Cy");
    const a = await store.start("a", "technical:2026-10-16");
    clock = "2026-10-17T10:00:00.000Z";
    const b = await store.start("b", a.edition_id),
      c = await store.start("c", a.edition_id);
    clock = "2026-10-17T10:05:00.000Z";
    await complete(store, "b", b.id);
    await complete(store, "c", c.id);
    clock = "2026-10-17T10:06:00.000Z";
    await complete(store, "a", a.id);
    const board = await store.leaderboard(a.edition_id, "a");
    assert.deepEqual(
      board.rows.map((r) => r.id),
      [b.id, c.id].sort().concat(a.id),
    );
    assert.equal(board.rank, 3);
    assert.equal(board.participantCount, 3);
  } finally {
    close();
  }
});

async function setup() {
  const adapter = testDatabase(),
    store = new QuizStore(adapter.db);
  await store.publish(fixture("technical"), true);
  await store.saveProfile("a", "Ada");
  return { ...adapter, store };
}
async function complete(
  store: QuizStore,
  user: string,
  id: string,
  answers = [0, 1],
) {
  for (let i = 0; i < 5; i++) await store.submit(user, id, i, answers);
  return store.attemptState(user, id);
}

test("edition validation enforces five topics, ten questions, evidence and unique choices", () => {
  const e = fixture("technical");
  assert.equal(e.topics.length, 5);
  assert.equal(e.topics.flatMap((t) => t.questions).length, 10);
  for (const mutate of [
    (x: typeof e) => x.topics.pop(),
    (x: typeof e) => x.topics[0].questions.pop(),
    (x: typeof e) => x.topics[0].questions[0].sourceIndices.push(99),
    (x: typeof e) =>
      (x.topics[0].questions[0].choices[1] =
        x.topics[0].questions[0].choices[0]),
    (x: typeof e) => (x.topics[0].announcedDate = "2099-01-01"),
    (x: typeof e) => (x.topics[1].storyKey = x.topics[0].storyKey),
  ]) {
    const bad = structuredClone(e);
    mutate(bad);
    assert.throws(() => validateEdition(bad));
  }
});
test("unlocked responses contain no keys, explanations or evidence", () => {
  const e = fixture("technical"),
    unlocked = JSON.stringify(publicEdition(e));
  for (const key of [
    '"correct":',
    '"explanations":',
    '"evidence":',
    '"sourceIndices":',
    '"selected":',
  ])
    assert.ok(!unlocked.includes(key));
  const p = publicEdition(e, [{ topic: 0, a0: 3, a1: 1 }]);
  assert.equal(p.topics[0].questions[0].correct, 0);
  assert.equal(p.topics[0].questions[0].selected, 3);
  assert.ok(!("correct" in p.topics[1].questions[0]));
});
test("publication is atomic, immutable and idempotent", async () => {
  const { store, close } = await setup();
  try {
    assert.equal(
      (await store.publish(fixture("technical"), true)).created,
      false,
    );
    const changed = fixture("technical");
    changed.topics[0].title += " revised";
    await assert.rejects(() => store.publish(changed, true), /immutable/);
    const duplicate = fixture("general");
    duplicate.topics[0].storyKey = fixture("technical").topics[0].storyKey;
    await assert.rejects(
      () => store.publish(duplicate, true),
      /Publication rejected/,
    );
    assert.equal(await store.edition("general", duplicate.date), null);
    assert.equal(
      (await store.all("SELECT * FROM question_history")).length,
      10,
    );
    const invalid = fixture("general");
    invalid.topics.pop();
    await assert.rejects(() => store.publish(invalid, true));
  } finally {
    close();
  }
});
test("tracks and archived first attempts remain independent", async () => {
  const { store, close } = await setup();
  try {
    await store.publish(fixture("general"), true);
    const technical = await store.start("a", "technical:2026-10-16"),
      general = await store.start("a", "general:2026-10-16");
    assert.notEqual(technical.id, general.id);
    assert.equal(technical.kind, "ranked");
    await complete(store, "a", technical.id);
    assert.equal(
      (await store.leaderboard("technical:2026-10-16", "a")).rank,
      1,
    );
    assert.equal(
      (await store.leaderboard("general:2026-10-16", "a")).participantCount,
      0,
    );
    assert.deepEqual(await store.bests("a", "general"), {
      first: null,
      practice: null,
    });
  } finally {
    close();
  }
});
test("concurrent starts and duplicate submissions preserve the first attempt", async () => {
  const { store, close } = await setup();
  try {
    const attempts = await Promise.all(
      Array.from({ length: 12 }, () =>
        store.start("a", "technical:2026-10-16"),
      ),
    );
    assert.equal(new Set(attempts.map((a) => a.id)).size, 1);
    const id = attempts[0].id;
    await assert.rejects(
      () => store.submit("a", id, 1, [0, 1]),
      /next unanswered/,
    );
    await Promise.all(
      Array.from({ length: 8 }, () => store.submit("a", id, 0, [0, 1])),
    );
    assert.equal((await store.submissions(id)).length, 1);
    await assert.rejects(() => store.submit("a", id, 0, [1, 1]), /locked/);
    assert.equal((await store.start("a", "technical:2026-10-16")).id, id);
    assert.equal(
      (await store.attemptState("a", id)).edition.topics[0].locked,
      true,
    );
    await assert.rejects(() => store.ownedAttempt("other", id), /not found/);
    await assert.rejects(
      () => store.start("a", "technical:2026-10-16", crypto.randomUUID()),
      /Complete/,
    );
  } finally {
    close();
  }
});
test("simultaneous conflicting submissions lock exactly one pair", async () => {
  const { store, close } = await setup();
  try {
    const a = await store.start("a", "technical:2026-10-16");
    const result = await Promise.allSettled([
      store.submit("a", a.id, 0, [0, 1]),
      store.submit("a", a.id, 0, [2, 3]),
    ]);
    assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal((await store.submissions(a.id)).length, 1);
  } finally {
    close();
  }
});
test("practice does not replace first score; personal bests remain separate", async () => {
  const { store, close } = await setup();
  try {
    const first = await store.start("a", "technical:2026-10-16");
    await complete(store, "a", first.id, [3, 3]);
    const key = crypto.randomUUID();
    const practice = await store.start("a", first.edition_id, key);
    assert.equal(practice.kind, "practice");
    assert.equal(
      (await store.start("a", first.edition_id, key)).id,
      practice.id,
    );
    await complete(store, "a", practice.id);
    const board = await store.leaderboard(first.edition_id, "a");
    assert.equal(board.participantCount, 1);
    assert.equal(board.rows[0].score, 0);
    assert.deepEqual(await store.bests("a", "technical"), {
      first: 0,
      practice: 10,
    });
    assert.equal((await store.start("a", first.edition_id)).id, first.id);
  } finally {
    close();
  }
});
test("server completion timestamp and database answers are immutable", async () => {
  const { store, sqlite, close } = await setup();
  try {
    const a = await store.start("a", "technical:2026-10-16");
    assert.throws(
      () =>
        sqlite
          .prepare("UPDATE attempts SET completed_at=? WHERE id=?")
          .run("2000-01-01T00:00:00Z", a.id),
      /immutable/,
    );
    for (let i = 0; i < 4; i++) await store.submit("a", a.id, i, [0, 1]);
    assert.equal((await store.ownedAttempt("a", a.id)).completed_at, null);
    const last = await store.submit("a", a.id, 4, [0, 1]);
    assert.match(last.attempt.completedAt!, /^\d{4}-.*Z$/);
    await store.submit("a", a.id, 4, [0, 1]);
    assert.equal(
      (await store.ownedAttempt("a", a.id)).completed_at,
      last.attempt.completedAt,
    );
    assert.throws(
      () =>
        sqlite
          .prepare("UPDATE submissions SET a0=2 WHERE attempt_id=?")
          .run(a.id),
      /locked/,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM attempts WHERE id=?").run(a.id),
      /immutable/,
    );
  } finally {
    close();
  }
});
test("SQL leaderboard uses score descending and excludes private identity fields", async () => {
  const { store, close } = await setup();
  try {
    await store.saveProfile("b", "Bea");
    const a = await store.start("a", "technical:2026-10-16"),
      b = await store.start("b", a.edition_id);
    await complete(store, "b", b.id, [3, 3]);
    await complete(store, "a", a.id);
    const board = await store.leaderboard(a.edition_id, "a");
    assert.equal(board.rows[0].displayName, "Ada");
    assert.equal(board.rows[0].score, 10);
    assert.ok(!JSON.stringify(board).includes("user_id"));
    assert.ok(!JSON.stringify(board).includes("email"));
  } finally {
    close();
  }
});
test("audited corrections consistently regrade ranked and practice attempts", async () => {
  const { store, sqlite, close } = await setup();
  try {
    const a = await store.start("a", "technical:2026-10-16");
    await complete(store, "a", a.id);
    const p = await store.start("a", a.edition_id, crypto.randomUUID());
    await complete(store, "a", p.id);
    const completion = (await store.ownedAttempt("a", a.id)).completed_at;
    await store.addCorrection(
      a.edition_id,
      0,
      0,
      2,
      "Corrected with accessible supporting evidence.",
      "https://example.com/",
      "Editorial review found ambiguity",
      "owner",
    );
    assert.equal((await store.attemptState("a", a.id)).attempt.score, 9);
    assert.equal((await store.attemptState("a", p.id)).attempt.score, 9);
    assert.deepEqual(await store.bests("a", "technical"), {
      first: 9,
      practice: 9,
    });
    assert.equal((await store.leaderboard(a.edition_id, "a")).rows[0].score, 9);
    assert.equal(
      (await store.ownedAttempt("a", a.id)).completed_at,
      completion,
    );
    assert.equal(
      (await store.attemptState("a", a.id)).edition.topics[0].questions[0]
        .correct,
      2,
    );
    assert.throws(() => sqlite.exec("DELETE FROM corrections"), /append only/);
  } finally {
    close();
  }
});
test("Toronto weekday scheduling handles DST and weekday holidays", () => {
  assert.equal(torontoDate(new Date("2026-10-17T02:00:00Z")), "2026-10-16");
  for (const iso of [
    "2026-03-06T12:00:00Z",
    "2026-03-09T11:00:00Z",
    "2026-10-30T11:00:00Z",
    "2026-11-02T12:00:00Z",
    "2026-12-25T12:00:00Z",
  ])
    assert.equal(generationDue(new Date(iso)), true, iso);
  for (const iso of [
    "2026-03-09T10:59:00Z",
    "2026-11-02T11:59:00Z",
    "2026-10-17T11:00:00Z",
    "2026-10-18T11:00:00Z",
  ])
    assert.equal(generationDue(new Date(iso)), false, iso);
});
test("uncapped cloud work is authorized; server requests only record setup and weekends do nothing", async () => {
  const { store, close } = await setup();
  try {
    assert.equal(generationStatus.authorized, true);
    assert.equal(generationStatus.creditCapEnforced, false);
    assert.equal(generationStatus.dailyCreditLimit, null);
    for (let i = 0; i < 3; i++)
      assert.equal(
        (await runGeneration(store, new Date("2026-10-16T11:00:00Z")))
          .paidCalls,
        0,
      );
    assert.equal((await store.all("SELECT * FROM runs")).length, 1);
    assert.equal(
      (await runGeneration(store, new Date("2026-10-16T11:00:00Z"))).status,
      "cloud-task-required",
    );
    assert.equal(
      (await runGeneration(store, new Date("2026-10-17T11:00:00Z"))).status,
      "outside-window",
    );
    const run = await store.one<{ actual_credits: number | null }>(
      "SELECT actual_credits FROM runs",
    );
    assert.equal(run?.actual_credits, null);
    assert.equal(await store.edition("technical", "2026-10-15"), null);
  } finally {
    close();
  }
});
test("security rejects cross-origin requests, oversized JSON and wrong secrets", async () => {
  assert.throws(
    () =>
      requireSameOrigin(
        new Request("https://quiz.test/api", {
          method: "POST",
          headers: {
            origin: "https://evil.test",
            "content-type": "application/json",
          },
        }),
      ),
    /origin/,
  );
  assert.throws(
    () =>
      requireSameOrigin(
        new Request("https://quiz.test/api", {
          method: "POST",
          headers: {
            origin: "https://quiz.test",
            "content-type": "text/plain",
          },
        }),
      ),
    /JSON/,
  );
  await assert.rejects(
    () =>
      readJson(
        new Request("https://quiz.test/api", {
          method: "POST",
          body: "x".repeat(200001),
        }),
      ),
    /large/,
  );
  assert.equal(await secretEquals("right", "right"), true);
  assert.equal(await secretEquals("wrong", "right"), false);
});
