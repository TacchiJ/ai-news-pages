import { z } from "zod";
import {
  generationDue,
  generationStatus,
  torontoDate,
  publicEdition,
  type Edition,
} from "./domain.ts";
import {
  editorialInstructions,
  researchLimits,
  runGeneration,
} from "./pipeline.ts";
import { fixture } from "./fixtures.ts";
import { publishReviewedEdition } from "./publication.ts";
import { HttpError } from "./security.ts";
import type { QuizStore, EditionRow } from "./store.ts";

const noArgs = { type: "object", properties: {}, additionalProperties: false };
export const cloudTools = [
  {
    name: "generation_context",
    description:
      "Get the Toronto generation window, missing tracks, bounded research instructions, recent story history and synthetic edition format. Call before doing research. This records a run request, not a completed generation.",
    inputSchema: noArgs,
  },
  {
    name: "story_history",
    description:
      "Retrieve prior question prompts and briefings for a canonical story key, so revisits use genuinely new questions.",
    inputSchema: {
      type: "object",
      properties: { storyKey: { type: "string", maxLength: 160 } },
      required: ["storyKey"],
      additionalProperties: false,
    },
  },
  {
    name: "publish_edition",
    description:
      "Publish one complete, source-verified edition after editorial review. Retry the exact same object after uncertain responses. Never send fixtures as news. The server enforces the full edition schema.",
    inputSchema: {
      type: "object",
      properties: {
        edition: { type: "object" },
        editorialApproved: { type: "boolean", const: true },
      },
      required: ["edition", "editorialApproved"],
      additionalProperties: false,
    },
  },
  {
    name: "read_edition",
    description:
      "Read a persisted edition digest and public content after publication; verify the digest matches the publishing response.",
    inputSchema: {
      type: "object",
      properties: { editionId: { type: "string", maxLength: 80 } },
      required: ["editionId"],
      additionalProperties: false,
    },
  },
  {
    name: "record_generation_outcome",
    description:
      "Record completion, failure or delay. Actual credits must come from platform measurements; omit when unavailable. Do not put credentials, answer keys or personal data in logs.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        status: { type: "string", enum: ["completed", "failed", "delayed"] },
        code: {
          type: "string",
          enum: [
            "published",
            "insufficient-evidence",
            "validation-failed",
            "source-unavailable",
            "writer-failed",
          ],
        },
        actualCredits: { type: "number", minimum: 0 },
      },
      required: ["date", "status", "code"],
      additionalProperties: false,
    },
  },
] as const;

export function requireCloudOwner(
  userId: string | undefined,
  ownerId: string | undefined,
) {
  if (!ownerId || userId !== ownerId)
    throw new HttpError(
      403,
      "Configured Site owner required for cloud publishing",
    );
}
export async function callCloudTool(
  store: QuizStore,
  name: string,
  args: unknown,
  now = new Date(),
) {
  if (name === "generation_context") {
    z.object({}).strict().parse(args);
    const date = torontoDate(now),
      due = generationDue(now);
    const existing = await store.all<{
      id: string;
      track: string;
      digest: string;
    }>("SELECT id,track,digest FROM editions WHERE date=?", date);
    const missingTracks = due
      ? ["technical", "general"].filter(
          (t) => !existing.some((e) => e.track === t),
        )
      : [];
    const previousOutcome = await store.one<{
      status: string;
      detail: string;
      actual_credits: number | null;
    }>(
      "SELECT status,detail,actual_credits FROM runs WHERE id=?",
      `generation:${date}`,
    );
    if (missingTracks.length) await runGeneration(store, now);
    return {
      date,
      timezone: "America/Toronto",
      due,
      budget: generationStatus,
      missingTracks,
      previousOutcome,
      existing,
      instructions: editorialInstructions,
      limits: researchLimits,
      history: await store.all(
        "SELECT story_key,date FROM topic_history ORDER BY date DESC LIMIT 300",
      ),
      trustedHostsNote:
        "Use the reviewed exact-host allowlist in lib/research.ts. Canonical HTTPS sources must be accessible to the server. Evidence must be a short verbatim passage from accessible page text.",
      formatExample: fixture("technical"),
      formatWarning:
        "The example is synthetic only. Replace every topic/source/question with verified research and set kind to researched. Never publish the example as news.",
    };
  }
  if (name === "story_history") {
    const { storyKey } = z
      .object({ storyKey: z.string().regex(/^[a-z0-9-]{3,160}$/) })
      .strict()
      .parse(args);
    const rows = await store.all<EditionRow>(
      "SELECT e.* FROM editions e JOIN topic_history h ON h.edition_id=e.id WHERE h.story_key=? ORDER BY e.date DESC LIMIT 20",
      storyKey,
    );
    return rows.map((row) => {
      const e = JSON.parse(row.content) as Edition;
      return {
        track: e.track,
        date: e.date,
        topics: e.topics
          .filter((t) => t.storyKey === storyKey)
          .map((t) => ({
            title: t.title,
            briefing: t.briefing,
            questions: t.questions.map((q) => q.prompt),
          })),
      };
    });
  }
  if (name === "publish_edition") {
    const body = z
      .object({ edition: z.unknown(), editorialApproved: z.literal(true) })
      .strict()
      .parse(args);
    return publishReviewedEdition(store, body.edition);
  }
  if (name === "read_edition") {
    const { editionId } = z
      .object({ editionId: z.string().max(80) })
      .strict()
      .parse(args);
    const row = await store.one<EditionRow>(
      "SELECT * FROM editions WHERE id=?",
      editionId,
    );
    if (!row) throw new HttpError(404, "Edition not found");
    return {
      id: row.id,
      digest: row.digest,
      edition: publicEdition(JSON.parse(row.content)),
    };
  }
  if (name === "record_generation_outcome") {
    const body = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        status: z.enum(["completed", "failed", "delayed"]),
        code: z.enum([
          "published",
          "insufficient-evidence",
          "validation-failed",
          "source-unavailable",
          "writer-failed",
        ]),
        actualCredits: z.number().finite().nonnegative().optional(),
      })
      .strict()
      .parse(args);
    if (body.date !== torontoDate(now) || !generationDue(now))
      throw new HttpError(
        409,
        "Generation logging requires the current Toronto weekday window",
      );
    if ((body.status === "completed") !== (body.code === "published"))
      throw new HttpError(
        400,
        "Completion requires the published outcome code",
      );
    if (body.status === "completed") {
      const rows = await store.all<{ track: string; kind: string }>(
        "SELECT track,kind FROM editions WHERE date=?",
        body.date,
      );
      if (
        !["technical", "general"].every((t) =>
          rows.some((e) => e.track === t && e.kind === "researched"),
        )
      )
        throw new HttpError(
          409,
          "Both researched tracks must be persisted before completion",
        );
    }
    // Optional measurement is a cumulative platform-reported daily total, never an estimate or hard cap.
    await store.execute(
      "INSERT INTO runs (id,date,status,detail,actual_credits) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,detail=excluded.detail,actual_credits=COALESCE(excluded.actual_credits,runs.actual_credits)",
      `generation:${body.date}`,
      body.date,
      body.status,
      body.code,
      body.actualCredits ?? null,
    );
    return { recorded: true, status: body.status };
  }
  throw new HttpError(404, "Unknown cloud tool");
}
