import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const timestamp = () =>
  text()
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
});
export const editions = sqliteTable(
  "editions",
  {
    id: text().primaryKey(),
    track: text().notNull(),
    date: text().notNull(),
    content: text().notNull(),
    digest: text().notNull(),
    kind: text().notNull(),
    publishedAt: timestamp(),
  },
  (t) => [uniqueIndex("edition_slot").on(t.track, t.date)],
);
export const topicHistory = sqliteTable(
  "topic_history",
  {
    id: text().primaryKey(),
    editionId: text("edition_id")
      .notNull()
      .references(() => editions.id),
    storyKey: text("story_key").notNull(),
    date: text().notNull(),
  },
  (t) => [uniqueIndex("distinct_daily_story").on(t.storyKey, t.date)],
);
export const questionHistory = sqliteTable("question_history", {
  fingerprint: text().primaryKey(),
  editionId: text("edition_id")
    .notNull()
    .references(() => editions.id),
});
export const attempts = sqliteTable(
  "attempts",
  {
    id: text().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId),
    editionId: text("edition_id")
      .notNull()
      .references(() => editions.id),
    kind: text().notNull(),
    requestKey: text("request_key").notNull(),
    startedAt: timestamp(),
    completedAt: text("completed_at"),
  },
  (t) => [
    uniqueIndex("first_attempt")
      .on(t.userId, t.editionId)
      .where(sql`${t.kind} = 'ranked'`),
    uniqueIndex("attempt_request").on(t.userId, t.editionId, t.requestKey),
    index("attempt_edition").on(t.editionId),
  ],
);
export const submissions = sqliteTable(
  "submissions",
  {
    id: text().primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id),
    topic: integer().notNull(),
    a0: integer().notNull(),
    a1: integer().notNull(),
    submittedAt: timestamp(),
  },
  (t) => [uniqueIndex("locked_pair").on(t.attemptId, t.topic)],
);
export const corrections = sqliteTable("corrections", {
  id: integer().primaryKey({ autoIncrement: true }),
  editionId: text("edition_id")
    .notNull()
    .references(() => editions.id),
  topic: integer().notNull(),
  question: integer().notNull(),
  correct: integer().notNull(),
  explanation: text().notNull(),
  sourceUrl: text("source_url").notNull(),
  reason: text().notNull(),
  actor: text().notNull(),
  createdAt: timestamp(),
});
export const reports = sqliteTable("reports", {
  id: text().primaryKey(),
  userId: text("user_id").notNull(),
  editionId: text("edition_id")
    .notNull()
    .references(() => editions.id),
  topic: integer().notNull(),
  question: integer().notNull(),
  message: text().notNull(),
  status: text().notNull().default("open"),
  resolution: text(),
  createdAt: timestamp(),
});
export const runs = sqliteTable("runs", {
  id: text().primaryKey(),
  date: text().notNull(),
  status: text().notNull(),
  actualCredits: integer("actual_credits"),
  estimatedCredits: integer("estimated_credits"),
  detail: text().notNull(),
  createdAt: timestamp(),
});
export const sourceCache = sqliteTable("source_cache", {
  url: text().primaryKey(),
  title: text().notNull(),
  publishedDate: text("published_date").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
  content: text().notNull(),
  digest: text().notNull(),
});
