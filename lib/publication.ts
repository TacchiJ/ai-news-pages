import { validateEdition } from "./domain.ts";
import { SourceResearch } from "./research.ts";
import type { QuizStore } from "./store.ts";

/** Shared owner HTTP and cloud MCP publication path. Exact retries avoid new retrievals. */
export async function publishReviewedEdition(store: QuizStore, input: unknown) {
  const candidate = validateEdition(input);
  if (await store.edition(candidate.track, candidate.date))
    return store.publish(candidate);
  const verified = await new SourceResearch(store).verify(candidate);
  return store.publish(verified);
}
