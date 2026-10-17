import { validateEdition, type Track, type Edition } from "./domain.ts";

// Synthetic, public development material. Never used by the production publisher.
const subjects = {
  technical: [
    [
      "Isolated test environments",
      "A fictional team runs each test in a clean environment to prevent earlier tests from changing later results.",
      "Isolation prevents shared state from changing test results.",
      "Use a fresh environment",
      "Trust leftover state",
    ],
    [
      "A repeat-safe publishing job",
      "A fictional publishing job uses an edition identifier so a retry can return the existing result without publishing twice.",
      "An idempotency key identifies the same logical publication across retries.",
      "Reuse the edition identifier",
      "Create a new edition on every retry",
    ],
    [
      "Server-owned answer locking",
      "A fictional quiz service stores both answers in one transaction before revealing any feedback to the visitor.",
      "A paired submission prevents feedback on one question from influencing the other answer.",
      "Lock both answers together",
      "Reveal feedback before submitting",
    ],
    [
      "Evidence for a release note",
      "A fictional developer checks an original release note and verifies its announcement date before describing an API change.",
      "Original release notes help verify what was announced and when.",
      "Check the original release note",
      "Assume an updated article is a new release",
    ],
    [
      "Protecting runtime credentials",
      "A fictional application stores its publishing credential in a server runtime secret, separate from browser assets and source control.",
      "Server runtime secrets keep credentials out of source control and browser bundles.",
      "Use a server runtime secret",
      "Put the credential in browser code",
    ],
  ],
  general: [
    [
      "Reading an AI announcement",
      "A fictional company announces an AI assistant. Its launch post describes the features, but those claims have not been independently tested.",
      "A company announcement establishes what the vendor claims, not independent proof of performance.",
      "Attribute the claims to the company",
      "Present all claims as independently proven",
    ],
    [
      "Checking a product launch date",
      "A fictional news article was updated today but says the product launched last month. The original announcement confirms the earlier date.",
      "The launch date comes from the announcement, not the article update timestamp.",
      "Use the original announcement date",
      "Use the latest page update as the launch date",
    ],
    [
      "Understanding a staged rollout",
      "A fictional AI feature is available only to a small test group. The company says wider access is planned but gives no confirmed date.",
      "A limited test does not mean that every user already has access.",
      "Describe access as limited",
      "Say everyone can use it today",
    ],
    [
      "Comparing evidence fairly",
      "A fictional AI product reports a strong benchmark result on one named test. No evidence is provided about other tasks.",
      "A result on one benchmark does not establish superiority on every task.",
      "Limit the claim to the named test",
      "Declare it best at every task",
    ],
    [
      "Spotting a revisited story",
      "A fictional quiz returns to an older announcement with a clearly marked revisit and two new questions about its practical implications.",
      "An older story can be useful if clearly dated and accompanied by genuinely new questions.",
      "Mark the revisit and ask new questions",
      "Pretend the old story was announced today",
    ],
  ],
};
export function fixture(track: Track, date = "2026-10-16"): Edition {
  return validateEdition({
    track,
    date,
    kind: "fixture",
    topics: subjects[track].map(
      ([title, briefing, evidence, correct, wrong], i) => ({
        storyKey: `fixture-${track}-${i}-${date}`,
        title,
        briefing: `DEVELOPMENT FIXTURE. ${briefing} This is a learning scenario, not a real AI news announcement.`,
        announcedDate: date,
        revisited: false,
        sources: [
          {
            url: "https://example.com/",
            title: "Synthetic development evidence (not a news source)",
            publishedDate: date,
            retrievedAt: `${date}T12:00:00.000Z`,
            evidence,
            quality: "primary",
          },
        ],
        questions: [
          {
            prompt: `In the ${date} ${title.toLowerCase()} scenario, which action follows the briefing?`,
            choices: [
              correct,
              wrong,
              "Skip verification entirely",
              "Publish without reading the briefing",
            ],
            correct: 0,
            explanations: [
              evidence,
              `The briefing supports the opposite action. ${evidence}`,
              `Skipping verification is not supported. ${evidence}`,
              `The briefing must be checked first. ${evidence}`,
            ],
            sourceIndices: [0],
          },
          {
            prompt: `What does the ${date} ${title.toLowerCase()} briefing establish?`,
            choices: [
              "Every AI product behaves the same way",
              evidence,
              "No evidence is needed for this claim",
              "The fictional scenario is a real announcement",
            ],
            correct: 1,
            explanations: [
              `The scenario does not generalize to every product. ${evidence}`,
              evidence,
              `The briefing requires supporting evidence. ${evidence}`,
              `This is synthetic development material. ${evidence}`,
            ],
            sourceIndices: [0],
          },
        ],
      }),
    ),
  });
}
