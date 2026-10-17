import assert from "node:assert/strict";
const origin = process.env.QUIZ_TEST_ORIGIN || "http://127.0.0.1:5173";
const signIn = await fetch(`${origin}/signin-with-chatgpt?return_to=/`, {
  redirect: "manual",
});
const cookie = signIn.headers
  .getSetCookie()
  .map((s) => s.split(";")[0])
  .join("; ");
assert.ok(
  cookie,
  "Loopback mock authentication is required; never run this script against production",
);
const request = async (body, authenticated = true, requestOrigin = origin) => {
  const response = await fetch(`${origin}/api/quiz`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: requestOrigin,
      ...(authenticated ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { error: raw };
  }
  return { status: response.status, data };
};
assert.equal(
  (await request({ action: "profile", displayName: "API Learner" }, false))
    .status,
  401,
);
assert.equal(
  (
    await request(
      { action: "profile", displayName: "API Learner" },
      true,
      "https://evil.test",
    )
  ).status,
  403,
);
assert.equal(
  (await request({ action: "profile", displayName: "API Learner" })).status,
  200,
);
const starts = await Promise.all(
  Array.from({ length: 8 }, () =>
    request({ action: "start", track: "general", date: "2026-10-15" }),
  ),
);
assert.ok(starts.every((s) => s.status === 200));
const ids = new Set(starts.map((s) => s.data.attempt.id));
assert.equal(ids.size, 1);
const id = [...ids][0];
assert.equal(
  (
    await request({
      action: "submit",
      attemptId: id,
      topic: 0,
      answers: [0, 1],
      score: 10,
      completedAt: "2000-01-01T00:00:00Z",
    })
  ).status,
  400,
);
const submissions = await Promise.all(
  Array.from({ length: 6 }, () =>
    request({ action: "submit", attemptId: id, topic: 0, answers: [0, 1] }),
  ),
);
assert.ok(submissions.every((s) => s.status === 200));
assert.equal(
  (
    await request({
      action: "submit",
      attemptId: id,
      topic: 0,
      answers: [3, 3],
    })
  ).status,
  409,
);
assert.equal(submissions[0].data.edition.topics[0].locked, true);
assert.ok(!("correct" in submissions[0].data.edition.topics[1].questions[0]));
assert.equal((await fetch(`${origin}/api/quiz?attempt=${id}`)).status, 401);
assert.equal(
  (await fetch(`${origin}/api/owner`, { headers: { cookie } })).status,
  403,
);
console.log(
  "HTTP/D1 checks passed: auth, CSRF, concurrent starts and submissions, immutable answers, no future feedback, score/timestamp injection and owner denial.",
);
const rpc = async (method, params, authenticated = false) =>
  fetch(`${origin}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin,
      ...(authenticated ? { cookie } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      ...(params ? { params } : {}),
    }),
  });
const discovery = await rpc("server/discover");
assert.equal(discovery.status, 200);
assert.deepEqual((await discovery.json()).result.supportedVersions, [
  "2026-07-28",
]);
const listed = await (await rpc("tools/list")).json();
assert.ok(listed.result.tools.some((t) => t.name === "publish_edition"));
for (const signedIn of [false, true])
  assert.equal(
    (
      await rpc(
        "tools/call",
        { name: "generation_context", arguments: {} },
        signedIn,
      )
    ).status,
    403,
  );
console.log(
  "MCP HTTP checks passed: discoverable tool metadata and owner-only operation denial for anonymous and ordinary signed-in visitors.",
);
