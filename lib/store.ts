import {
  digest,
  normalize,
  publicEdition,
  validateEdition,
  type Edition,
  type Submission,
  type Correction,
  torontoDate,
} from "./domain.ts";
import { HttpError } from "./security.ts";

export type EditionRow = {
  id: string;
  track: string;
  date: string;
  kind: string;
  content: string;
  digest: string;
};
export type AttemptRow = {
  id: string;
  user_id: string;
  edition_id: string;
  kind: "ranked" | "practice";
  completed_at: string | null;
  startedAt: string;
};
export class QuizStore {
  db: D1Database;
  constructor(db: D1Database) {
    this.db = db;
  }
  async one<T>(sql: string, ...args: unknown[]): Promise<T | null> {
    return this.db
      .prepare(sql)
      .bind(...args)
      .first<T>();
  }
  async all<T>(sql: string, ...args: unknown[]): Promise<T[]> {
    return (
      await this.db
        .prepare(sql)
        .bind(...args)
        .all<T>()
    ).results;
  }
  async execute(sql: string, ...args: unknown[]) {
    return this.db
      .prepare(sql)
      .bind(...args)
      .run();
  }
  async edition(track: string, date: string) {
    return this.one<EditionRow>(
      "SELECT * FROM editions WHERE track=? AND date=?",
      track,
      date,
    );
  }
  async publish(input: unknown, allowFixture = false) {
    const e = validateEdition(input);
    if (e.date > torontoDate())
      throw new HttpError(400, "Cannot publish a future edition");
    if (e.kind === "fixture" && !allowFixture)
      throw new HttpError(
        403,
        "Fixtures require the development-only seed workflow",
      );
    const id = `${e.track}:${e.date}`,
      content = JSON.stringify(e),
      hash = await digest(content);
    const existing = await this.edition(e.track, e.date);
    if (existing) {
      if (existing.digest !== hash)
        throw new HttpError(
          409,
          "Published editions are immutable; use an audited correction",
        );
      return { id, digest: hash, created: false };
    }
    const statements = [
      this.db
        .prepare(
          "INSERT INTO editions (id,track,date,kind,content,digest) VALUES (?,?,?,?,?,?)",
        )
        .bind(id, e.track, e.date, e.kind, content, hash),
    ];
    for (const [ti, t] of e.topics.entries()) {
      statements.push(
        this.db
          .prepare(
            "INSERT INTO topic_history (id,edition_id,story_key,date) VALUES (?,?,?,?)",
          )
          .bind(`${id}:${ti}`, id, t.storyKey, e.date),
      );
      for (const q of t.questions)
        statements.push(
          this.db
            .prepare(
              "INSERT INTO question_history (fingerprint,edition_id) VALUES (?,?)",
            )
            .bind(await digest(normalize(q.prompt)), id),
        );
    }
    try {
      await this.db.batch(statements);
    } catch {
      const concurrent = await this.edition(e.track, e.date);
      if (concurrent?.digest === hash)
        return { id, digest: hash, created: false };
      throw new HttpError(
        409,
        "Publication rejected: duplicate edition, story or question, or unmarked revisit",
      );
    }
    return { id, digest: hash, created: true };
  }
  async profile(userId: string) {
    return this.one<{ display_name: string }>(
      "SELECT display_name FROM profiles WHERE user_id=?",
      userId,
    );
  }
  async saveProfile(userId: string, name: string) {
    await this.execute(
      "INSERT INTO profiles (user_id,display_name) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name",
      userId,
      name,
    );
  }
  async ownedAttempt(userId: string, id: string) {
    const a = await this.one<AttemptRow>(
      "SELECT * FROM attempts WHERE id=? AND user_id=?",
      id,
      userId,
    );
    if (!a) throw new HttpError(404, "Attempt not found");
    return a;
  }
  async start(userId: string, editionId: string, practiceKey?: string) {
    if (!(await this.profile(userId)))
      throw new HttpError(400, "Choose a public display name first");
    const first = await this.one<AttemptRow>(
      "SELECT * FROM attempts WHERE user_id=? AND edition_id=? AND kind='ranked'",
      userId,
      editionId,
    );
    if (practiceKey && !first?.completed_at)
      throw new HttpError(409, "Complete your first attempt before practicing");
    if (!practiceKey && first) return first;
    const kind = practiceKey ? "practice" : "ranked",
      key = practiceKey ?? "first";
    await this.execute(
      "INSERT INTO attempts (id,user_id,edition_id,kind,request_key) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING",
      crypto.randomUUID(),
      userId,
      editionId,
      kind,
      key,
    );
    const attempt = await this.one<AttemptRow>(
      "SELECT * FROM attempts WHERE user_id=? AND edition_id=? AND request_key=?",
      userId,
      editionId,
      key,
    );
    if (!attempt)
      throw new HttpError(409, "Attempt conflict; resume the first attempt");
    return attempt;
  }
  async submissions(attemptId: string) {
    return this.all<Submission>(
      "SELECT topic,a0,a1 FROM submissions WHERE attempt_id=? ORDER BY topic",
      attemptId,
    );
  }
  async corrections(editionId: string) {
    return this.all<Correction>(
      "SELECT * FROM corrections WHERE edition_id=? ORDER BY id",
      editionId,
    );
  }
  async submit(
    userId: string,
    attemptId: string,
    topic: number,
    answers: number[],
  ) {
    const attempt = await this.ownedAttempt(userId, attemptId);
    const previous = await this.one<Submission>(
      "SELECT * FROM submissions WHERE attempt_id=? AND topic=?",
      attemptId,
      topic,
    );
    if (previous) {
      if (previous.a0 !== answers[0] || previous.a1 !== answers[1])
        throw new HttpError(409, "Both answers are already locked");
      return this.attemptState(userId, attempt.id);
    }
    try {
      await this.execute(
        "INSERT INTO submissions (id,attempt_id,topic,a0,a1) VALUES (?,?,?,?,?) ON CONFLICT(attempt_id,topic) DO NOTHING",
        crypto.randomUUID(),
        attemptId,
        topic,
        answers[0],
        answers[1],
      );
    } catch {
      throw new HttpError(
        409,
        "Submit the next unanswered topic; completed answers are locked",
      );
    }
    const locked = await this.one<Submission>(
      "SELECT * FROM submissions WHERE attempt_id=? AND topic=?",
      attemptId,
      topic,
    );
    if (locked?.a0 !== answers[0] || locked?.a1 !== answers[1])
      throw new HttpError(409, "Another request locked different answers");
    return this.attemptState(userId, attemptId);
  }
  async attemptState(userId: string, id: string) {
    const a = await this.ownedAttempt(userId, id);
    const row = await this.one<EditionRow>(
      "SELECT * FROM editions WHERE id=?",
      a.edition_id,
    );
    if (!row) throw new HttpError(404, "Edition missing");
    const answers = await this.submissions(id),
      corrections = await this.corrections(row.id);
    const result = await this.one<{ score: number }>(
      "SELECT score FROM attempt_scores WHERE id=?",
      id,
    );
    return {
      attempt: {
        id,
        kind: a.kind,
        completedAt: a.completed_at,
        score: result?.score ?? 0,
      },
      edition: publicEdition(JSON.parse(row.content), answers, corrections),
    };
  }
  async leaderboard(editionId: string, userId: string) {
    const ranking = `SELECT s.id,s.user_id,s.score,s.completed_at AS completedAt,p.display_name AS displayName,
      ROW_NUMBER() OVER (ORDER BY s.score DESC,s.completed_at ASC,s.id ASC) AS rank
      FROM attempt_scores s JOIN profiles p ON p.user_id=s.user_id
      WHERE s.edition_id=? AND s.kind='ranked' AND s.completed_at IS NOT NULL`;
    const rows = await this.all<{
      id: string;
      user_id: string;
      score: number;
      completedAt: string;
      displayName: string;
      rank: number;
    }>(`SELECT * FROM (${ranking}) LIMIT 100`, editionId);
    const mine = await this.one<{ rank: number }>(
      `SELECT rank FROM (${ranking}) WHERE user_id=?`,
      editionId,
      userId,
    );
    const count = await this.one<{ count: number }>(
      "SELECT COUNT(*) AS count FROM attempts WHERE edition_id=? AND kind='ranked' AND completed_at IS NOT NULL",
      editionId,
    );
    return {
      rows: rows.map(({ user_id, ...r }) => ({
        ...r,
        mine: user_id === userId,
      })),
      rank: mine?.rank ?? null,
      participantCount: count?.count ?? 0,
      current: true,
    };
  }
  async bests(userId: string, track: string) {
    const rows = await this.all<{ kind: string; best: number }>(
      `SELECT a.kind,MAX(a.score) AS best FROM attempt_scores a JOIN editions e ON a.edition_id=e.id WHERE a.user_id=? AND e.track=? AND a.completed_at IS NOT NULL GROUP BY a.kind`,
      userId,
      track,
    );
    return {
      first: rows.find((r) => r.kind === "ranked")?.best ?? null,
      practice: rows.find((r) => r.kind === "practice")?.best ?? null,
    };
  }
  async addCorrection(
    editionId: string,
    topic: number,
    question: number,
    correct: number,
    explanation: string,
    source: string,
    reason: string,
    actor: string,
  ) {
    const row = await this.one<EditionRow>(
      "SELECT * FROM editions WHERE id=?",
      editionId,
    );
    if (!row) throw new HttpError(404, "Edition not found");
    const e = JSON.parse(row.content) as Edition;
    if (!e.topics[topic]?.questions[question]?.choices[correct])
      throw new HttpError(400, "Invalid corrected answer");
    await this.execute(
      "INSERT INTO corrections (edition_id,topic,question,correct,explanation,source_url,reason,actor) VALUES (?,?,?,?,?,?,?,?)",
      editionId,
      topic,
      question,
      correct,
      explanation,
      source,
      reason,
      actor,
    );
  }
}
