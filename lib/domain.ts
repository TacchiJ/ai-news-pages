import { z } from "zod";

export const tracks = ["technical", "general"] as const;
export type Track = (typeof tracks)[number];
export const timezone = "America/Toronto";
export const generationStatus = {
  authorized: true,
  creditCapEnforced: false,
  dailyCreditLimit: null,
  actualCredits: null,
  reason:
    "Cloud generation is approved without a hard credit cap. New editions appear after source verification and complete publication.",
} as const;
export function torontoDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function isWeekday(date: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    ![0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())
  );
}
export function generationDue(now: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  return isWeekday(torontoDate(now)) && hour >= 7;
}
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, "Invalid calendar date");
const httpsUrl = z
  .string()
  .url()
  .refine((v) => new URL(v).protocol === "https:", "HTTPS required");
const sourceSchema = z
  .object({
    url: httpsUrl,
    title: z.string().min(3).max(300),
    publishedDate: date,
    retrievedAt: z.string().datetime(),
    evidence: z.string().min(20).max(6000),
    quality: z.enum(["primary", "independent"]),
  })
  .strict();
const questionSchema = z
  .object({
    prompt: z.string().min(10).max(700),
    choices: z.array(z.string().min(1).max(300)).length(4),
    correct: z.number().int().min(0).max(3),
    explanations: z.array(z.string().min(10).max(1500)).length(4),
    sourceIndices: z.array(z.number().int().min(0)).min(1),
  })
  .strict();
export const editionSchema = z
  .object({
    track: z.enum(tracks),
    date,
    kind: z.enum(["researched", "fixture"]),
    topics: z
      .array(
        z
          .object({
            storyKey: z.string().regex(/^[a-z0-9-]{3,160}$/),
            title: z.string().min(3).max(200),
            briefing: z.string().min(30).max(3000),
            announcedDate: date,
            revisited: z.boolean(),
            sources: z.array(sourceSchema).min(1).max(6),
            questions: z.array(questionSchema).length(2),
          })
          .strict(),
      )
      .length(5),
  })
  .strict();
export type Edition = z.infer<typeof editionSchema>;
export class EditionValidationError extends Error {}
export function validateEdition(input: unknown): Edition {
  const e = editionSchema.parse(input);
  if (!isWeekday(e.date))
    throw new EditionValidationError(
      "Edition date must be a weekday in Toronto",
    );
  const stories = new Set<string>(),
    questions = new Set<string>();
  for (const t of e.topics) {
    if (stories.has(t.storyKey))
      throw new EditionValidationError("Duplicate story");
    stories.add(t.storyKey);
    if (t.announcedDate > e.date)
      throw new EditionValidationError("Future announcement");
    if (t.sources.some((s) => s.publishedDate > e.date))
      throw new EditionValidationError("Future source date");
    for (const q of t.questions) {
      if (new Set(q.choices.map(normalize)).size !== 4)
        throw new EditionValidationError("Duplicate choices");
      if (q.sourceIndices.some((i) => !t.sources[i]))
        throw new EditionValidationError("Missing answer evidence");
      if (questions.has(normalize(q.prompt)))
        throw new EditionValidationError("Duplicate question");
      questions.add(normalize(q.prompt));
    }
  }
  return e;
}
export const normalize = (v: string) =>
  v
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export async function digest(v: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(v),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export type Submission = {
  topic: number;
  a0: number;
  a1: number;
  submittedAt?: string;
};
export type Correction = {
  topic: number;
  question: number;
  correct: number;
  explanation: string;
  source_url: string;
};
export function effectiveQuestion(
  e: Edition,
  topic: number,
  question: number,
  corrections: Correction[],
) {
  const q = e.topics[topic].questions[question];
  const correction = corrections
    .filter((c) => c.topic === topic && c.question === question)
    .at(-1);
  return { ...q, correct: correction?.correct ?? q.correct, correction };
}
// Explicit projection: adding a private schema field never exposes it by default.
export function publicEdition(
  e: Edition,
  answers: Submission[] = [],
  corrections: Correction[] = [],
) {
  return {
    track: e.track,
    date: e.date,
    kind: e.kind,
    topics: e.topics.map((t, ti) => {
      const submission = answers.find((s) => s.topic === ti);
      return {
        title: t.title,
        briefing: t.briefing,
        announcedDate: t.announcedDate,
        revisited: t.revisited,
        sources: t.sources.map((s) => ({
          url: s.url,
          title: s.title,
          publishedDate: s.publishedDate,
        })),
        questions: t.questions.map((q, qi) => {
          const effective = effectiveQuestion(e, ti, qi, corrections);
          const selected = submission
            ? [submission.a0, submission.a1][qi]
            : undefined;
          return {
            prompt: q.prompt,
            choices: q.choices,
            ...(selected === undefined
              ? {}
              : {
                  selected,
                  correct: effective.correct,
                  explanation:
                    effective.correction?.explanation ??
                    q.explanations[selected],
                  correctExplanation:
                    effective.correction?.explanation ??
                    q.explanations[effective.correct],
                  sourceIndices: q.sourceIndices,
                  correction: effective.correction
                    ? {
                        explanation: effective.correction.explanation,
                        url: effective.correction.source_url,
                      }
                    : null,
                }),
          };
        }),
        locked: !!submission,
      };
    }),
  };
}
export type PublicEdition = ReturnType<typeof publicEdition>;
