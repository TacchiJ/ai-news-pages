"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Code2,
  Globe2,
  Layers3,
  LockKeyhole,
  Sparkles,
  Trophy,
  X,
  Flag,
  ShieldCheck,
} from "lucide-react";
import type { Track } from "../lib/domain";
import type { Overview, Play } from "../lib/client-contract";
import { api, label, dateLabel } from "../lib/client";
import EditionLeaderboard from "./ui/leaderboard";
import CorrectionForm from "./ui/correction-form";

export default function DailyApp() {
  const [track, setTrack] = useState<Track>("technical"),
    [date, setDate] = useState("");
  const [view, setView] = useState<
    "daily" | "archive" | "leaderboard" | "owner"
  >("daily");
  const [data, setData] = useState<Overview | null>(null),
    [play, setPlay] = useState<Play | null>(null);
  const [topic, setTopic] = useState(0),
    [choices, setChoices] = useState<(number | null)[]>([null, null]);
  const [finished, setFinished] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [name, setName] = useState(""),
    [report, setReport] = useState<number | null>(null),
    [reportText, setReportText] = useState(""),
    [notice, setNotice] = useState("");
  const [ownerData, setOwnerData] = useState<{
    reports: {
      id: string;
      edition_id: string;
      topic: number;
      question: number;
      message: string;
      status: string;
      resolution: string | null;
    }[];
    runs: { id: string; status: string; detail: string }[];
  } | null>(null);
  const practiceKey = useRef<string | null>(null),
    headingRef = useRef<HTMLHeadingElement>(null),
    initialized = useRef(false);
  const slotRef = useRef(0);
  const selectionRevision = useRef(0);
  function putPlay(p: Play, submitted = false) {
    setPlay(p);
    if (!submitted) {
      const next = p.edition.topics.findIndex((t) => !t.locked);
      setTopic(next < 0 ? 4 : next);
      setFinished(!!p.attempt.completedAt);
    }
    setChoices([null, null]);
    const url = new URL(location.href);
    url.searchParams.set("attempt", p.attempt.id);
    url.searchParams.set("track", p.edition.track);
    url.searchParams.set("date", p.edition.date);
    history.replaceState(null, "", url);
  }
  async function load(t = track, d = date) {
    const n = ++slotRef.current;
    setLoading(true);
    setError("");
    try {
      const result = await api<Overview>(
        `/api/quiz?track=${t}${d ? `&date=${d}` : ""}`,
      );
      if (n === slotRef.current) {
        setData(result);
        setName(result.profile ?? "");
      }
    } catch (e) {
      if (n === slotRef.current) setError((e as Error).message);
    } finally {
      if (n === slotRef.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const url = new URL(location.href),
        t = url.searchParams.get("track"),
        d = url.searchParams.get("date");
      if (t === "general") setTrack("general");
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDate(d);
      const id = url.searchParams.get("attempt"),
        revision = selectionRevision.current;
      if (id)
        api<Play>(`/api/quiz?attempt=${encodeURIComponent(id)}`)
          .then((p) => {
            if (revision === selectionRevision.current) putPlay(p);
          })
          .catch((e) => setError(e.message));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [track, date]); // Request revision prevents stale cross-track data.
  useEffect(() => {
    setChoices([null, null]);
    setReport(null);
    setReportText("");
    if (play) headingRef.current?.focus();
  }, [topic]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function select(t: Track, d = "", v: typeof view = "daily") {
    selectionRevision.current++;
    slotRef.current++;
    setPlay(null);
    setFinished(false);
    setTrack(t);
    setDate(d);
    setView(v);
    setError("");
    setNotice("");
    practiceKey.current = null;
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("track", t);
    if (d) url.searchParams.set("date", d);
    history.replaceState(null, "", url);
  }
  async function start(practice = false) {
    await act(async () => {
      const revision = selectionRevision.current;
      if (!data?.edition) return;
      if (!data.profile) {
        await api("/api/quiz", { action: "profile", displayName: name });
      }
      if (practice) practiceKey.current ??= crypto.randomUUID();
      const p = await api<Play>("/api/quiz", {
        action: "start",
        track,
        date: data.edition.date,
        ...(practice ? { practiceKey: practiceKey.current } : {}),
      });
      if (revision !== selectionRevision.current) return;
      putPlay(p);
      if (practice) practiceKey.current = null;
      setView("daily");
      await load();
    });
  }
  const selectedDate = date || data?.today || "",
    edition = play?.edition ?? data?.edition;
  const isFixture = edition?.kind === "fixture",
    currentTopic = play?.edition.topics[topic];
  const lockedCount = play?.edition.topics.filter((t) => t.locked).length ?? 0;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="AI Daily home">
          <span className="brand-mark">
            <Sparkles size={21} />
          </span>
          ai daily<span className="brand-dot">.</span>
        </a>
        <div className="sidebar-content">
          <span className="nav-label">YOUR DAILY DOSE</span>
          <nav aria-label="Main navigation">
            {[
              { id: "daily", icon: BookOpen, text: "Daily edition" },
              { id: "archive", icon: CalendarDays, text: "The archive" },
              { id: "leaderboard", icon: Trophy, text: "Leaderboard" },
            ].map((n) => (
              <button
                key={n.id}
                className={`nav-item ${view === n.id ? "active" : ""}`}
                onClick={() => {
                  select(track, date, n.id as typeof view);
                }}
              >
                <n.icon size={18} />
                {n.text}
                {view === n.id && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <span className="nav-label tracks-label">PICK YOUR TRACK</span>
          <div className="track-nav">
            {(["technical", "general"] as Track[]).map((t) => (
              <button
                className={track === t ? "selected" : ""}
                key={t}
                onClick={() =>
                  select(t, date, view === "owner" ? "daily" : view)
                }
              >
                {t === "technical" ? <Code2 size={17} /> : <Globe2 size={17} />}{" "}
                {label(t)}
                <span className={`track-dot ${t}`} />
              </button>
            ))}
          </div>
          <div className="sidebar-note">
            <span className="mini-spark">✳</span>
            <h3>
              A small habit.
              <br />A sharper perspective.
            </h3>
            <p>
              Five topics. Ten questions.
              <br />A little more context every day.
            </p>
            <span className="small-caps">MON — FRI · 09:00 TORONTO</span>
          </div>
        </div>
        <div className="sidebar-bottom">
          <ShieldCheck size={16} />
          <span>Source-backed. Curiosity-led.</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Your learning space <ChevronRight size={14} />
            <span>
              {view === "daily"
                ? "Daily edition"
                : view === "archive"
                  ? "The archive"
                  : view === "owner"
                    ? "Editorial desk"
                    : "Leaderboard"}
            </span>
          </div>
          <div className="account">
            {data?.signedIn ? (
              <>
                <span className="avatar">
                  {(data.profile || "?").slice(0, 1).toUpperCase()}
                </span>
                <span>{data.profile || "Choose a name"}</span>
                <a href="/signout-with-chatgpt?return_to=/" target="_top">
                  Sign out
                </a>
              </>
            ) : (
              <a
                className="signin"
                href="/signin-with-chatgpt?return_to=/"
                target="_top"
              >
                Sign in with ChatGPT <ArrowUpRight size={14} />
              </a>
            )}
          </div>
        </header>
        <main id="main-content" className="content">
          <div className="date-line">
            <span className="live-dot" />
            {selectedDate
              ? new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString(
                  undefined,
                  {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  },
                )
              : "Your daily AI briefing"}
            <span className="timezone">EDITION TIME · TORONTO</span>
          </div>
          {error && (
            <div role="alert" className="alert error">
              <span>{error}</span>
              <button onClick={() => void load()}>Reload</button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert success">
              {notice}
            </div>
          )}
          {isFixture && (
            <div className="fixture-banner">
              <Layers3 size={17} />
              <strong>Development fixture</strong>
              <span>
                Synthetic learning scenarios. This is not researched news.
              </span>
            </div>
          )}
          {loading && !data ? (
            <div className="loading" role="status">
              Loading your learning space…
            </div>
          ) : (
            <>
              {view === "daily" && !play && (
                <>
                  <section className="hero">
                    <div className="hero-copy">
                      <div className="hero-kicker">
                        <span />
                        THE WORLD MOVES FAST. KEEP LEARNING.
                      </div>
                      <h1>
                        Stay curious.
                        <br />
                        <em>Stay current.</em>
                      </h1>
                      <p>
                        Your daily pause to make sense of AI.
                        <br />
                        Read the briefing. Test your understanding. Carry it
                        forward.
                      </p>
                      <div className="hero-meta">
                        <span>
                          <BookOpen size={15} />5 topics
                        </span>
                        <span>
                          <Layers3 size={15} />
                          10 questions
                        </span>
                        <span>∞ curiosity</span>
                      </div>
                    </div>
                    <div className="orbital" aria-hidden="true">
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <div className="orbit orbit-three" />
                      <span className="orbit-star star-one">✳</span>
                      <span className="orbit-star star-two">✦</span>
                      <span className="orbit-label">
                        A LITTLE
                        <br />
                        SHARPER,
                        <br />
                        <em>DAILY.</em>
                      </span>
                      <span className="orbit-point" />
                    </div>
                  </section>
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">
                        TWO PERSPECTIVES. YOUR CHOICE.
                      </span>
                      <h2>Find your daily edge.</h2>
                    </div>
                    <span className="pill">Independent tracks</span>
                  </div>
                  <div className="track-grid">
                    {(["technical", "general"] as Track[]).map((t) => (
                      <button
                        key={t}
                        className={`track-card ${t} ${track === t ? "chosen" : ""}`}
                        onClick={() => select(t, date)}
                        aria-pressed={track === t}
                      >
                        <div className="track-card-top">
                          <span className="track-icon">
                            {t === "technical" ? (
                              <Code2 size={25} />
                            ) : (
                              <Globe2 size={25} />
                            )}
                          </span>
                          <span className="small-caps">
                            {track === t ? "SELECTED TRACK" : "EXPLORE TRACK"}{" "}
                            <ArrowUpRight size={14} />
                          </span>
                        </div>
                        <h3>{label(t)}</h3>
                        <p>
                          {t === "technical"
                            ? "The tools, APIs, and workflows moving AI development forward."
                            : "The launches, ideas, and developments shaping AI in everyday life."}
                        </p>
                        <div className="track-card-bottom">
                          <span>
                            {t === "technical"
                              ? "FOR THE BUILDERS"
                              : "FOR THE BIG PICTURE"}
                          </span>
                          <span>5 topics · 10 questions</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <section className="edition-panel panel">
                    <div className="edition-heading">
                      <span className={`track-icon ${track}`}>
                        {track === "technical" ? (
                          <Code2 size={23} />
                        ) : (
                          <Globe2 size={23} />
                        )}
                      </span>
                      <div>
                        <span className="eyebrow">{label(track)} EDITION</span>
                        <h2>
                          {edition
                            ? dateLabel(edition.date)
                            : "Your next moment of clarity."}
                        </h2>
                      </div>
                      <span className={`status-pill ${edition ? "ready" : ""}`}>
                        {edition
                          ? isFixture
                            ? "Fixture available"
                            : "Ready to explore"
                          : "Edition unavailable"}
                      </span>
                    </div>
                    {edition ? (
                      <>
                        <p className="muted">
                          {isFixture
                            ? "Try the complete experience with clearly labelled development scenarios."
                            : "Five source-backed briefings. Two questions per topic. One point for each correct answer."}
                        </p>
                        <div className="topic-preview">
                          {edition.topics.map((t, i) => (
                            <div key={i}>
                              <span>{String(i + 1).padStart(2, "0")}</span>
                              {t.title}
                              {t.revisited && (
                                <span className="pill">Revisited</span>
                              )}
                            </div>
                          ))}
                        </div>
                        {!data?.signedIn ? (
                          <a
                            className="button primary"
                            href={`/signin-with-chatgpt?return_to=${encodeURIComponent(`/?track=${track}&date=${edition.date}`)}`}
                            target="_top"
                          >
                            Sign in to begin <ArrowRight size={17} />
                          </a>
                        ) : (
                          <>
                            {!data.profile && (
                              <form
                                className="name-form"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void start();
                                }}
                              >
                                <label htmlFor="display-name">
                                  Choose your public display name
                                </label>
                                <div>
                                  <input
                                    id="display-name"
                                    autoComplete="nickname"
                                    value={name}
                                    minLength={2}
                                    maxLength={32}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    placeholder="How should we call you?"
                                  />
                                  <button
                                    className="button primary"
                                    disabled={busy}
                                  >
                                    Save & begin <ArrowRight size={16} />
                                  </button>
                                </div>
                                <small>
                                  Your email is never shown on the leaderboard.
                                </small>
                              </form>
                            )}
                            {data.profile && (
                              <button
                                className="button primary"
                                disabled={busy || loading}
                                onClick={() => void start()}
                              >
                                {busy
                                  ? "Opening…"
                                  : data.resumeAttemptId
                                    ? "Resume / view first attempt"
                                    : "Begin this edition"}
                                <ArrowRight size={17} />
                              </button>
                            )}
                          </>
                        )}
                        <p className="fineprint">
                          <LockKeyhole size={13} />
                          Your first attempt counts, including archived
                          editions. Retakes are practice.
                        </p>
                      </>
                    ) : (
                      <div className="unavailable">
                        <CalendarDays size={28} />
                        <h3>
                          {selectedDate &&
                          [0, 6].includes(
                            new Date(`${selectedDate}T12:00:00Z`).getUTCDay(),
                          )
                            ? "Weekends are for catching up."
                            : "This edition isn’t ready yet."}
                        </h3>
                        <p>
                          New editions arrive on weekdays.{" "}
                          {data?.generation.reason} Earlier editions keep their
                          original dates.
                        </p>
                        <button
                          className="button secondary"
                          onClick={() => setView("archive")}
                        >
                          Explore the archive <ArrowRight size={16} />
                        </button>
                      </div>
                    )}
                  </section>
                  <div className="principles">
                    <div>
                      <ShieldCheck />
                      <h3>Sources, always.</h3>
                      <p>
                        Follow the evidence behind every briefing and answer.
                      </p>
                    </div>
                    <div>
                      <LockKeyhole />
                      <h3>A fair first attempt.</h3>
                      <p>
                        Both answers lock before feedback. Your progress travels
                        with you.
                      </p>
                    </div>
                    <div>
                      <Globe2 />
                      <h3>Your own perspective.</h3>
                      <p>
                        Separate tracks, personal bests, and edition
                        leaderboards.
                      </p>
                    </div>
                  </div>
                </>
              )}
              {view === "archive" && (
                <>
                  <span className="eyebrow">A LITTLE CATCHING UP</span>
                  <h1 className="page-title">
                    The archive<span>.</span>
                  </h1>
                  <p className="page-intro">
                    Good learning doesn’t expire. Your first attempt counts on
                    every edition.
                  </p>
                  <div className="panel archive-controls">
                    <label htmlFor="edition-date">Browse by edition date</label>
                    <input
                      type="date"
                      id="edition-date"
                      max={data?.today}
                      value={date || data?.today || ""}
                      onChange={(e) => select(track, e.target.value, "archive")}
                    />
                    <p className="muted">
                      All dates follow America/Toronto. No new editions on
                      weekends.
                    </p>
                  </div>
                  <div className="archive-grid">
                    {data?.available.map((e) => (
                      <button
                        key={e.date}
                        className="panel archive-card"
                        onClick={() => select(track, e.date, "daily")}
                      >
                        <span className="eyebrow">
                          {label(track)}{" "}
                          {e.kind === "fixture" ? "· FIXTURE" : ""}
                        </span>
                        <h3>{dateLabel(e.date)}</h3>
                        <span>
                          5 topics · 10 questions <ArrowRight size={18} />
                        </span>
                      </button>
                    ))}
                  </div>
                  {!data?.available.length && (
                    <div className="panel empty-small">
                      <BookOpen />
                      <h3>No editions published yet.</h3>
                      <p>
                        The archive will appear here after the first complete
                        edition is published.
                      </p>
                    </div>
                  )}
                </>
              )}
              {view === "leaderboard" && (
                <>
                  <span className="eyebrow">CURIOSITY, IN GOOD COMPANY</span>
                  <h1 className="page-title">
                    Keep showing up<span>.</span>
                  </h1>
                  <p className="page-intro">
                    One track. One edition. A shared reason to learn.
                  </p>
                  <div className="panel archive-controls">
                    <label htmlFor="ranking-date">Edition date</label>
                    <input
                      id="ranking-date"
                      type="date"
                      max={data?.today}
                      value={selectedDate}
                      onChange={(e) =>
                        select(track, e.target.value, "leaderboard")
                      }
                    />
                  </div>
                  {data?.edition ? (
                    <EditionLeaderboard
                      track={track}
                      date={selectedDate}
                      ranking={data?.leaderboard ?? null}
                    />
                  ) : (
                    <div className="panel empty-small">
                      <Trophy />
                      <h3>No edition on this date.</h3>
                      <p>Choose a published edition from the archive.</p>
                    </div>
                  )}
                </>
              )}
              {view === "daily" && play && currentTopic && !finished && (
                <div className="quiz-layout">
                  <div>
                    <div className="quiz-topline">
                      <button
                        className="text-button"
                        onClick={() => select(track, play.edition.date)}
                      >
                        ← Edition overview
                      </button>
                      <span className={`pill ${play.attempt.kind}`}>
                        {play.attempt.kind === "ranked"
                          ? "First attempt · ranked"
                          : "Practice · unranked"}
                      </span>
                    </div>
                    <div className="quiz-progress">
                      <span>TOPIC {topic + 1} OF 5</span>
                      <span>{lockedCount * 2} / 10 answers locked</span>
                    </div>
                    <progress
                      max={10}
                      value={lockedCount * 2}
                      aria-label="Answers locked"
                    />
                    <article className="panel briefing">
                      <span className="eyebrow">
                        THE BRIEFING {currentTopic.revisited && "· REVISITED"}
                      </span>
                      <h1 ref={headingRef} tabIndex={-1}>
                        {currentTopic.title}
                      </h1>
                      <span className="briefing-date">
                        {isFixture ? "Scenario date" : "Announced"}{" "}
                        {dateLabel(currentTopic.announcedDate)}
                      </span>
                      <p>{currentTopic.briefing}</p>
                      <div className="source-list">
                        {currentTopic.sources.map((s, i) => (
                          <a
                            key={i}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {s.title}
                            <ArrowUpRight size={14} />
                          </a>
                        ))}
                      </div>
                    </article>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void act(async () => {
                          const revision = selectionRevision.current;
                          const p = await api<Play>("/api/quiz", {
                            action: "submit",
                            attemptId: play.attempt.id,
                            topic,
                            answers: choices,
                          });
                          if (revision !== selectionRevision.current) return;
                          putPlay(p, true);
                          await load();
                        });
                      }}
                    >
                      {currentTopic.questions.map((q, qi) => (
                        <fieldset
                          className="panel question"
                          key={`${topic}-${qi}`}
                          disabled={currentTopic.locked || busy}
                        >
                          <legend>
                            <span>QUESTION {topic * 2 + qi + 1}</span>
                            {q.prompt}
                          </legend>
                          <div className="choices">
                            {q.choices.map((c, ci) => {
                              const selected = currentTopic.locked
                                ? q.selected === ci
                                : choices[qi] === ci;
                              return (
                                <label
                                  key={ci}
                                  className={`${selected ? "is-selected" : ""} ${currentTopic.locked && q.correct === ci ? "is-correct" : ""} ${currentTopic.locked && selected && q.correct !== ci ? "is-wrong" : ""}`}
                                >
                                  <input
                                    type="radio"
                                    name={`q${topic}-${qi}`}
                                    value={ci}
                                    checked={selected}
                                    required
                                    onChange={() =>
                                      setChoices((old) =>
                                        old.map((v, i) => (i === qi ? ci : v)),
                                      )
                                    }
                                  />
                                  <span className="choice-letter">
                                    {"ABCD"[ci]}
                                  </span>
                                  <span>{c}</span>
                                  {currentTopic.locked && q.correct === ci ? (
                                    <Check size={18} />
                                  ) : currentTopic.locked && selected ? (
                                    <X size={18} />
                                  ) : null}
                                </label>
                              );
                            })}
                          </div>
                          {currentTopic.locked && (
                            <div
                              className={`feedback ${q.selected === q.correct ? "correct" : "incorrect"}`}
                              role="status"
                            >
                              <strong>
                                {q.selected === q.correct
                                  ? "That’s right."
                                  : `Correct answer: ${q.choices[q.correct!]}`}
                              </strong>
                              <p>{q.explanation}</p>
                              {q.selected !== q.correct &&
                                q.correctExplanation !== q.explanation && (
                                  <p>{q.correctExplanation}</p>
                                )}
                              {q.correction && (
                                <p>
                                  Audited correction: {q.correction.explanation}{" "}
                                  <a
                                    href={q.correction.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Evidence ↗
                                  </a>
                                </p>
                              )}
                              <div>
                                {q.sourceIndices?.map((i) => (
                                  <a
                                    href={currentTopic.sources[i].url}
                                    key={i}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Supporting source {i + 1} ↗
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </fieldset>
                      ))}
                      {!currentTopic.locked ? (
                        <div className="submit-area">
                          <p>
                            <LockKeyhole size={14} />
                            Both answers lock before feedback appears.
                          </p>
                          <button
                            className="button primary"
                            disabled={busy || choices.some((c) => c === null)}
                          >
                            {busy ? "Locking answers…" : "Lock both answers"}
                            <LockKeyhole size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="submit-area">
                          <span className="muted">
                            Answers saved. Take a moment with the explanation.
                          </span>
                          <button
                            type="button"
                            className="button primary"
                            onClick={() => {
                              if (topic === 4) {
                                setFinished(true);
                                void load();
                              } else setTopic(topic + 1);
                            }}
                          >
                            {topic === 4 ? "See my results" : "Next topic"}
                            <ArrowRight size={17} />
                          </button>
                        </div>
                      )}
                    </form>
                    <button
                      className="report-link"
                      onClick={() => setReport(report === null ? 0 : null)}
                    >
                      <Flag size={14} />
                      Report a flawed question
                    </button>
                    {report !== null && (
                      <form
                        className="panel report-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void act(async () => {
                            await api("/api/quiz", {
                              action: "report",
                              editionId: `${track}:${play.edition.date}`,
                              topic,
                              question: report,
                              message: reportText,
                            });
                            setReport(null);
                            setReportText("");
                            setNotice(
                              "Report received. The editorial desk will review it.",
                            );
                          });
                        }}
                      >
                        <label>
                          Question
                          <select
                            value={report}
                            onChange={(e) => setReport(Number(e.target.value))}
                          >
                            <option value={0}>
                              First question in this topic
                            </option>
                            <option value={1}>
                              Second question in this topic
                            </option>
                          </select>
                        </label>
                        <label>
                          What should we review?
                          <textarea
                            minLength={10}
                            maxLength={2000}
                            required
                            value={reportText}
                            onChange={(e) => setReportText(e.target.value)}
                          />
                        </label>
                        <button className="button secondary" disabled={busy}>
                          Send report
                        </button>
                      </form>
                    )}
                  </div>
                  <aside className="quiz-aside panel">
                    <span className="eyebrow">YOUR EDITION</span>
                    <h3>One topic at a time.</h3>
                    <nav aria-label="Topic progress">
                      {play.edition.topics.map((t, i) => (
                        <button
                          disabled={i > lockedCount}
                          key={i}
                          className={topic === i ? "current" : ""}
                          onClick={() => setTopic(i)}
                        >
                          <span>{t.locked ? <Check size={14} /> : i + 1}</span>
                          {t.title}
                        </button>
                      ))}
                    </nav>
                    <p>
                      <ShieldCheck size={16} />
                      Progress is saved to your account after each paired
                      submission.
                    </p>
                  </aside>
                </div>
              )}
              {view === "daily" && play && finished && (
                <>
                  <section className="results panel">
                    <span className="result-icon">
                      <Sparkles size={30} />
                    </span>
                    <span className="eyebrow">
                      {label(track)} · {dateLabel(play.edition.date, true)}
                    </span>
                    <h1>A little sharper already.</h1>
                    <p>There’s always something new to take with you.</p>
                    <div className="score">
                      {play.attempt.score}
                      <span>/ 10</span>
                    </div>
                    <span className="pill">
                      {play.attempt.kind === "ranked"
                        ? "Ranked first attempt"
                        : "Practice attempt · rankings unchanged"}
                    </span>
                    <div className="result-stats">
                      <div>
                        <span>EDITION RANK</span>
                        <strong>
                          {data?.leaderboard?.rank
                            ? `#${data.leaderboard.rank}`
                            : "—"}
                          <small>
                            {" "}
                            / {data?.leaderboard?.participantCount ?? 0}{" "}
                            participants
                          </small>
                        </strong>
                      </div>
                      <div>
                        <span>{label(track).toUpperCase()} PERSONAL BEST</span>
                        <strong>
                          {data?.bests.first ?? "—"}
                          <small> / 10 · first attempts</small>
                        </strong>
                      </div>
                      {data?.bests.practice !== null && (
                        <div>
                          <span>BEST PRACTICE</span>
                          <strong>
                            {data?.bests.practice}
                            <small> / 10</small>
                          </strong>
                        </div>
                      )}
                    </div>
                    <p className="muted">
                      Rankings are current and can change as more people take
                      this edition.
                    </p>
                    <div className="result-actions">
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => {
                          void start(true);
                        }}
                      >
                        Try a practice retake <ArrowRight size={16} />
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => {
                          setFinished(false);
                          setTopic(0);
                        }}
                      >
                        Review my answers
                      </button>
                    </div>
                  </section>
                  <EditionLeaderboard
                    track={track}
                    date={selectedDate}
                    ranking={data?.leaderboard ?? null}
                  />
                </>
              )}
              {view === "owner" && (
                <>
                  <h1 className="page-title">
                    Editorial desk<span>.</span>
                  </h1>
                  <p className="page-intro">
                    Cloud research is authorized without a hard credit cap.
                    Review reports and audit grading corrections here.
                  </p>
                  <div className="panel">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(async () =>
                          setOwnerData(await api("/api/owner")),
                        )
                      }
                    >
                      Refresh owner inbox
                    </button>
                    {ownerData?.reports.map((r) => (
                      <div className="owner-report" key={r.id}>
                        <span className="eyebrow">
                          {r.edition_id} · TOPIC {r.topic + 1} · QUESTION{" "}
                          {r.question + 1} · {r.status}
                        </span>
                        <p>{r.message}</p>
                        {r.resolution && <p>Resolution: {r.resolution}</p>}
                        {r.status === "open" && (
                          <button
                            className="text-button"
                            onClick={() => {
                              const resolution = window.prompt(
                                "Record the review resolution (at least 10 characters):",
                              );
                              if (resolution)
                                void act(async () => {
                                  await api("/api/owner", {
                                    action: "resolve",
                                    reportId: r.id,
                                    resolution,
                                  });
                                  setOwnerData(await api("/api/owner"));
                                });
                            }}
                          >
                            Resolve report
                          </button>
                        )}
                      </div>
                    ))}
                    {ownerData?.runs.map((r) => (
                      <div className="owner-report" key={r.id}>
                        <strong>{r.status}</strong>
                        <p>{r.detail}</p>
                      </div>
                    ))}
                  </div>
                  <CorrectionForm run={act} />
                </>
              )}
            </>
          )}
          <footer>
            <a className="footer-brand" href="/">
              ai daily.
            </a>
            <span>A little context goes a long way.</span>
            {data?.owner && (
              <button className="text-button" onClick={() => setView("owner")}>
                Editorial desk
              </button>
            )}
            <span className="footer-right">Made for curious minds ↗</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
