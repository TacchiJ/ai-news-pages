import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { QuizStore } from "../../../lib/store";
import {
  generationStatus,
  publicEdition,
  torontoDate,
  tracks,
} from "../../../lib/domain";
import { HttpError, readJson, requireSameOrigin } from "../../../lib/security";
import { z } from "zod";

export const dynamic = "force-dynamic";
const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const send = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: responseHeaders });
const slot = z.object({
  track: z.enum(tracks),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const bodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("profile"),
      displayName: z
        .string()
        .trim()
        .min(2)
        .max(32)
        .regex(
          /^[\p{L}\p{N} _.-]+$/u,
          "Use letters, numbers, spaces, periods, underscores or hyphens",
        ),
    })
    .strict(),
  slot
    .extend({
      action: z.literal("start"),
      practiceKey: z.string().uuid().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("submit"),
      attemptId: z.string().uuid(),
      topic: z.number().int().min(0).max(4),
      answers: z.array(z.number().int().min(0).max(3)).length(2),
    })
    .strict(),
  z
    .object({
      action: z.literal("report"),
      editionId: z.string().max(80),
      topic: z.number().int().min(0).max(4),
      question: z.number().int().min(0).max(1),
      message: z.string().trim().min(10).max(2000),
    })
    .strict(),
]);
async function context() {
  if (!env.DB) throw new HttpError(503, "Database unavailable");
  return { store: new QuizStore(env.DB), user: await getChatGPTUser() };
}
async function safely(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError)
      return send({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return send(
        { error: error.issues[0]?.message ?? "Invalid request" },
        400,
      );
    // Deliberately omit raw exception text: it may contain SQL, content or identity.
    console.error("quiz_request_failed");
    return send(
      { error: "The request could not be completed. Please try again." },
      500,
    );
  }
}
export async function GET(request: Request) {
  return safely(async () => {
    const { store, user } = await context(),
      url = new URL(request.url);
    if (url.searchParams.get("identity") === "1") {
      if (!user) throw new HttpError(401, "Sign in first");
      return send({ userId: user.userId });
    }
    if (url.searchParams.has("attempt")) {
      if (!user) throw new HttpError(401, "Sign in to resume");
      return send(
        await store.attemptState(
          user.userId,
          z.string().uuid().parse(url.searchParams.get("attempt")),
        ),
      );
    }
    const { track, date } = slot.parse({
      track: url.searchParams.get("track") ?? "technical",
      date: url.searchParams.get("date") ?? torontoDate(),
    });
    const row = await store.edition(track, date);
    const available = await store.all<{ date: string; kind: string }>(
      "SELECT date,kind FROM editions WHERE track=? ORDER BY date DESC LIMIT 366",
      track,
    );
    const profile = user ? await store.profile(user.userId) : null;
    const first =
      row && user
        ? await store.one<{ id: string }>(
            "SELECT id FROM attempts WHERE user_id=? AND edition_id=? AND kind='ranked'",
            user.userId,
            row.id,
          )
        : null;
    return send({
      signedIn: !!user,
      profile: profile?.display_name ?? null,
      owner: !!user && !!env.OWNER_USER_ID && user.userId === env.OWNER_USER_ID,
      edition: row ? publicEdition(JSON.parse(row.content)) : null,
      editionId: row?.id ?? null,
      available,
      resumeAttemptId: first?.id ?? null,
      generation: generationStatus,
      leaderboard: row
        ? await store.leaderboard(row.id, user?.userId ?? "")
        : null,
      bests: user
        ? await store.bests(user.userId, track)
        : { first: null, practice: null },
      today: torontoDate(),
      status: row ? "published" : "unavailable",
    });
  });
}
export async function POST(request: Request) {
  return safely(async () => {
    requireSameOrigin(request);
    const { store, user } = await context();
    if (!user) throw new HttpError(401, "Sign in to save attempts");
    const body = bodySchema.parse(await readJson(request));
    if (body.action === "profile") {
      await store.saveProfile(user.userId, body.displayName);
      return send({ ok: true });
    }
    if (body.action === "start") {
      const row = await store.edition(body.track, body.date);
      if (!row) throw new HttpError(404, "Edition unavailable");
      const a = await store.start(user.userId, row.id, body.practiceKey);
      return send(await store.attemptState(user.userId, a.id));
    }
    if (body.action === "submit")
      return send(
        await store.submit(
          user.userId,
          body.attemptId,
          body.topic,
          body.answers,
        ),
      );
    const first = await store.one<{ id: string }>(
      "SELECT id FROM attempts WHERE user_id=? AND edition_id=? LIMIT 1",
      user.userId,
      body.editionId,
    );
    if (!first)
      throw new HttpError(
        403,
        "Start this edition before reporting a question",
      );
    const quota = await store.one<{ count: number }>(
      "SELECT COUNT(*) AS count FROM reports WHERE user_id=? AND createdAt >= strftime('%Y-%m-%dT00:00:00.000Z','now')",
      user.userId,
    );
    if ((quota?.count ?? 0) >= 20)
      throw new HttpError(429, "Daily report limit reached");
    await store.execute(
      "INSERT INTO reports (id,user_id,edition_id,topic,question,message) VALUES (?,?,?,?,?,?)",
      crypto.randomUUID(),
      user.userId,
      body.editionId,
      body.topic,
      body.question,
      body.message,
    );
    return send({ ok: true });
  });
}
