import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.QUIZ_TEST_ORIGIN || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHANNEL }
    : {}),
});
mkdirSync("test-results", { recursive: true });
const failures = [],
  checks = [];
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
    }),
    page = await context.newPage();
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto(origin);
  await page
    .getByRole("heading", { name: "Stay curious. Stay current." })
    .waitFor();
  await page.getByText("Weekends are for catching up.").waitFor();
  checks.push("Weekend unavailable state");
  await page.screenshot({
    path: "test-results/desktop-home.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "The archive", exact: true }).click();
  await page.locator(".archive-card").filter({ hasText: /16/ }).first().click();
  await page
    .getByText("Synthetic learning scenarios. This is not researched news.")
    .waitFor();
  await page.getByRole("link", { name: "Sign in to begin" }).click();
  await page.waitForURL(/track=technical/);
  await page.getByRole("link", { name: "Sign out", exact: true }).waitFor();
  const displayName = page.getByLabel("Choose your public display name");
  if (await displayName.count()) {
    await displayName.fill("UI Learner");
    await page.getByRole("button", { name: "Save & begin" }).click();
  } else
    await page
      .getByRole("button", {
        name: /Begin this edition|Resume \/ view first attempt/,
      })
      .click();
  const results = page.getByRole("heading", {
    name: "A little sharper already.",
  });
  await page.locator(".results, .quiz-layout").waitFor();
  if (await results.count())
    await page.getByRole("button", { name: "Try a practice retake" }).click();
  for (let topic = 0; topic < 5; topic++) {
    await page.getByText(`TOPIC ${topic + 1} OF 5`, { exact: true }).waitFor();
    const fields = page.locator("fieldset");
    await fields.nth(0).locator(".choices label").nth(0).click();
    await fields.nth(1).locator(".choices label").nth(1).click();
    const lock = page.getByRole("button", {
      name: "Lock both answers",
      exact: true,
    });
    await lock.click();
    await page
      .getByText("Answers saved. Take a moment with the explanation.")
      .waitFor();
    assert.equal(await page.locator("fieldset:disabled").count(), 2);
    if (topic === 0) {
      checks.push("Paired feedback and disabled answers");
      await page.screenshot({
        path: "test-results/desktop-feedback.png",
        fullPage: true,
      });
    }
    if (topic === 1) {
      const url = page.url();
      await page.reload();
      await page.getByText("TOPIC 3 OF 5", { exact: true }).waitFor();
      assert.equal(page.url(), url);
      checks.push("Server-side resume after refresh");
      continue;
    }
    await page
      .getByRole("button", {
        name: topic === 4 ? "See my results" : "Next topic",
        exact: true,
      })
      .click();
  }
  await results.waitFor();
  await page.getByText("/ 10", { exact: true }).first().waitFor();
  checks.push("Ten-question completion and edition leaderboard");
  await page.screenshot({
    path: "test-results/desktop-results.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Try a practice retake" }).click();
  await page.getByText("Practice · unranked", { exact: true }).waitFor();
  checks.push("Practice retake classification");
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page
    .getByRole("heading", { name: "Stay curious. Stay current." })
    .waitFor();
  checks.push("Track switch exits previous quiz");
  const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    mobilePage = await mobile.newPage();
  await mobilePage.goto(`${origin}/?track=general&date=2026-10-16`);
  await mobilePage
    .getByRole("heading", { name: "Stay curious. Stay current." })
    .waitFor();
  await mobilePage
    .getByText("Synthetic learning scenarios. This is not researched news.")
    .waitFor();
  assert.equal(
    await mobilePage.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  checks.push("Mobile 390px layout without overflow");
  await mobilePage.screenshot({
    path: "test-results/mobile-home.png",
    fullPage: true,
  });
  await mobilePage.getByRole("link", { name: "Sign in to begin" }).click();
  await mobilePage
    .getByRole("link", { name: "Sign out", exact: true })
    .waitFor();
  await mobilePage
    .getByRole("button", {
      name: /Begin this edition|Resume \/ view first attempt/,
    })
    .click();
  await mobilePage.locator(".results, .quiz-layout").waitFor();
  // Make repeated local smoke runs independent of unfinished fixture progress.
  if (await mobilePage.locator(".quiz-layout").count()) {
    const id = new URL(mobilePage.url()).searchParams.get("attempt");
    const state = await (
      await mobilePage.request.get(`${origin}/api/quiz?attempt=${id}`)
    ).json();
    if (state.edition.topics.some((t) => t.locked)) {
      for (let i = 0; i < 5; i++)
        if (!state.edition.topics[i].locked) {
          const response = await mobilePage.request.post(`${origin}/api/quiz`, {
            headers: { origin },
            data: {
              action: "submit",
              attemptId: id,
              topic: i,
              answers: [0, 1],
            },
          });
          assert.equal(response.status(), 200);
        }
      await mobilePage.reload();
      await mobilePage
        .getByRole("heading", { name: "A little sharper already." })
        .waitFor();
    }
  }
  if (
    await mobilePage
      .getByRole("heading", { name: "A little sharper already." })
      .count()
  )
    await mobilePage
      .getByRole("button", { name: "Try a practice retake" })
      .click();
  await mobilePage.getByText("TOPIC 1 OF 5", { exact: true }).waitFor();
  await mobilePage
    .locator("fieldset")
    .nth(0)
    .locator(".choices label")
    .nth(3)
    .click();
  await mobilePage
    .locator("fieldset")
    .nth(1)
    .locator(".choices label")
    .nth(1)
    .click();
  await mobilePage
    .getByRole("button", { name: "Lock both answers", exact: true })
    .click();
  await mobilePage
    .getByText("Answers saved. Take a moment with the explanation.")
    .waitFor();
  assert.equal(await mobilePage.locator("fieldset:disabled").count(), 2);
  assert.equal(
    await mobilePage.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await mobilePage.screenshot({
    path: "test-results/mobile-feedback.png",
    fullPage: true,
  });
  await mobilePage.setViewportSize({ width: 320, height: 800 });
  assert.equal(
    await mobilePage.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  checks.push("Mobile paired submission and incorrect-answer explanation");
  await mobilePage
    .getByRole("button", { name: "Report a flawed question" })
    .click();
  await mobilePage
    .getByLabel("What should we review?")
    .fill("Development QA report: verifying the editorial review workflow.");
  await mobilePage.getByRole("button", { name: "Send report" }).click();
  await mobilePage
    .getByText("Report received. The editorial desk will review it.")
    .waitFor();
  checks.push("Question report saved from mobile");
  assert.deepEqual(failures, []);
  checks.push("No browser exceptions");
  writeFileSync(
    "test-results/ui-checks.json",
    JSON.stringify({ checks, failures }, null, 2),
  );
  console.log(JSON.stringify({ checks, failures }, null, 2));
} finally {
  await browser.close();
}
