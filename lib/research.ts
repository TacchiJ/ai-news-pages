import { digest, normalize, validateEdition, type Edition } from "./domain.ts";
import type { QuizStore } from "./store.ts";
import { HttpError } from "./security.ts";
import { researchLimits } from "./pipeline.ts";

/** Explicit public-source allowlist prevents owner draft URLs becoming an SSRF proxy. */
export const trustedHosts = new Set([
  "openai.com",
  "developers.openai.com",
  "platform.openai.com",
  "learn.chatgpt.com",
  "anthropic.com",
  "www.anthropic.com",
  "docs.anthropic.com",
  "github.blog",
  "github.com",
  "blog.google",
  "ai.google.dev",
  "deepmind.google",
  "research.google",
  "ai.meta.com",
  "microsoft.com",
  "www.microsoft.com",
  "blogs.microsoft.com",
  "azure.microsoft.com",
  "huggingface.co",
  "arxiv.org",
  "nature.com",
  "www.nature.com",
  "science.org",
  "www.science.org",
  "reuters.com",
  "www.reuters.com",
  "apnews.com",
  "techcrunch.com",
  "www.theverge.com",
  "omo.dev",
  "qaskills.sh",
  "www.aihero.dev",
]);
export function safeSourceUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !trustedHosts.has(url.hostname)
  )
    throw new HttpError(400, "Source host requires editorial allowlist review");
  url.hash = "";
  return url;
}
export function extractText(html: string) {
  return html
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
export type Candidate = {
  storyKey: string;
  announcedDate: string;
  primary: boolean;
  significance: number;
  practicalRelevance: number;
};
export function selectCandidates(
  candidates: Candidate[],
  editionDate: string,
  used: Set<string>,
) {
  // Discovery adapters must use actual announcement dates; page update dates are insufficient.
  const seen = new Set<string>();
  return candidates
    .filter((c) => {
      if (seen.has(c.storyKey) || c.announcedDate > editionDate) return false;
      seen.add(c.storyKey);
      return true;
    })
    .map((c) => ({
      ...c,
      revisited: used.has(c.storyKey),
      priority:
        (c.primary ? 3 : 0) +
        c.significance +
        c.practicalRelevance -
        Math.min(
          30,
          Math.max(
            0,
            (Date.parse(editionDate) - Date.parse(c.announcedDate)) / 86400000,
          ),
        ) *
          0.15 -
        (used.has(c.storyKey) ? 8 : 0),
    }))
    .sort(
      (a, b) => b.priority - a.priority || a.storyKey.localeCompare(b.storyKey),
    )
    .slice(0, researchLimits.candidates);
}
export class SourceResearch {
  store: QuizStore;
  fetcher: typeof fetch;
  retrievals = 0;
  constructor(store: QuizStore, fetcher: typeof fetch = fetch) {
    this.store = store;
    this.fetcher = fetcher;
  }
  async retrieve(
    value: string,
    publishedDate: string,
    title: string,
  ): Promise<string> {
    const url = safeSourceUrl(value);
    const cached = await this.store.one<{
      content: string;
      retrieved_at: string;
    }>("SELECT content,retrieved_at FROM source_cache WHERE url=?", url.href);
    if (
      cached &&
      Date.now() - Date.parse(cached.retrieved_at) <
        researchLimits.cacheHours * 3600000
    )
      return cached.content;
    if (++this.retrievals > researchLimits.sourceRetrievals)
      throw new HttpError(422, "Bounded source retrieval limit reached");
    let last: unknown;
    for (let attempt = 0; attempt <= researchLimits.retries; attempt++) {
      try {
        // Redirects are refused: each canonical destination must be explicitly reviewed.
        const response = await this.fetcher(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(12000),
          headers: {
            "User-Agent": "AI-Daily-Evidence-Check/1.0",
            Accept: "text/html,text/plain,application/json",
          },
        });
        if (!response.ok)
          throw new Error(
            "Source unavailable or redirect requires canonical URL",
          );
        if (
          !/text\/html|text\/plain|application\/json/i.test(
            response.headers.get("content-type") ?? "",
          )
        )
          throw new Error("Unsupported evidence format");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Empty evidence");
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 2_000_000) {
            await reader.cancel();
            throw new Error("Source exceeds retrieval limit");
          }
          chunks.push(value);
        }
        const combined = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        const text = extractText(new TextDecoder().decode(combined));
        if (text.length < 40)
          throw new Error("Insufficient accessible evidence");
        await this.store.execute(
          "INSERT INTO source_cache (url,title,published_date,retrieved_at,content,digest) VALUES (?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET title=excluded.title,published_date=excluded.published_date,retrieved_at=excluded.retrieved_at,content=excluded.content,digest=excluded.digest",
          url.href,
          title,
          publishedDate,
          new Date().toISOString(),
          text,
          await digest(text),
        );
        return text;
      } catch (error) {
        last = error;
      }
    }
    throw new HttpError(
      422,
      last instanceof Error ? last.message : "Source retrieval failed",
    );
  }
  async verify(input: unknown): Promise<Edition> {
    const edition = validateEdition(input);
    if (edition.kind !== "researched")
      throw new HttpError(
        422,
        "Research verification requires a researched edition",
      );
    const unique = new Set(
      edition.topics.flatMap((t) => t.sources.map((s) => s.url)),
    );
    if (unique.size > researchLimits.sourceRetrievals)
      throw new HttpError(422, "Too many sources");
    // Sequential bounded retrieval, no unbounded parallel calls or retries.
    for (const topic of edition.topics)
      for (const source of topic.sources) {
        const page = await this.retrieve(
          source.url,
          source.publishedDate,
          source.title,
        );
        if (!normalize(page).includes(normalize(source.evidence)))
          throw new HttpError(
            422,
            "Evidence passage was not found in the accessible source",
          );
      }
    return edition;
  }
}
