import { env } from "cloudflare:workers";
import { z } from "zod";
import { getChatGPTUser } from "../../chatgpt-auth";
import { QuizStore } from "../../../lib/store";
import { HttpError, readJson, ownerAuthority } from "../../../lib/security";
import { generationStatus, EditionValidationError } from "../../../lib/domain";
import { runGeneration } from "../../../lib/pipeline";
import { publishReviewedEdition } from "../../../lib/publication";

export const dynamic = "force-dynamic";
const send = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function authorized(request: Request) {
  if (!env.DB) throw new HttpError(503, "Database unavailable");
  const user = await getChatGPTUser();
  const actor = await ownerAuthority(request, {
    userId: user?.userId,
    ownerId: env.OWNER_USER_ID,
    publisherToken: env.PUBLISHER_TOKEN,
  });
  return {
    store: new QuizStore(env.DB),
    actor,
  };
}
async function safely(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return send({ error: e.message }, e.status);
    if (e instanceof EditionValidationError)
      return send({ error: e.message }, 422);
    if (e instanceof z.ZodError)
      return send({ error: e.issues[0]?.message }, 400);
    console.error("owner_request_failed");
    return send({ error: "Owner operation failed" }, 500);
  }
}
export async function GET(request: Request) {
  return safely(async () => {
    const { store } = await authorized(request),
      url = new URL(request.url);
    if (url.searchParams.has("editionId")) {
      const edition = await store.one<{
        id: string;
        digest: string;
        date: string;
        track: string;
      }>(
        "SELECT id,digest,date,track FROM editions WHERE id=?",
        url.searchParams.get("editionId"),
      );
      return send({ edition });
    }
    return send({
      generation: generationStatus,
      reports: await store.all(
        "SELECT id,edition_id,topic,question,message,status,resolution,createdAt FROM reports ORDER BY createdAt DESC LIMIT 100",
      ),
      runs: await store.all(
        "SELECT * FROM runs ORDER BY createdAt DESC LIMIT 30",
      ),
      history: await store.all(
        "SELECT story_key,date FROM topic_history ORDER BY date DESC LIMIT 300",
      ),
    });
  });
}
export async function POST(request: Request) {
  return safely(async () => {
    const { store, actor } = await authorized(request),
      body = await readJson(request);
    const action = z
      .object({ action: z.enum(["publish", "generate", "correct", "resolve"]) })
      .parse(body).action;
    if (action === "generate") return send(await runGeneration(store));
    if (action === "publish") {
      const b = z
        .object({
          action: z.literal("publish"),
          edition: z.unknown(),
          editorialApproved: z.literal(true),
        })
        .strict()
        .parse(body);
      return send(await publishReviewedEdition(store, b.edition));
    }
    if (action === "correct") {
      const b = z
        .object({
          action: z.literal("correct"),
          editionId: z.string().max(80),
          topic: z.number().int().min(0).max(4),
          question: z.number().int().min(0).max(1),
          correct: z.number().int().min(0).max(3),
          explanation: z.string().min(20).max(2000),
          sourceUrl: z.string().url().startsWith("https://"),
          reason: z.string().min(10).max(2000),
        })
        .strict()
        .parse(body);
      await store.addCorrection(
        b.editionId,
        b.topic,
        b.question,
        b.correct,
        b.explanation,
        b.sourceUrl,
        b.reason,
        actor,
      );
      return send({ ok: true });
    }
    const b = z
      .object({
        action: z.literal("resolve"),
        reportId: z.string().uuid(),
        resolution: z.string().min(10).max(2000),
      })
      .strict()
      .parse(body);
    await store.execute(
      "UPDATE reports SET status='resolved',resolution=? WHERE id=?",
      b.resolution,
      b.reportId,
    );
    return send({ ok: true });
  });
}
