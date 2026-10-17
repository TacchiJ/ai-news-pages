import type { Track } from "./domain";
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
export const label = (t: Track) =>
  t === "technical" ? "Technical" : "General";
export const dateLabel = (date: string, short = false) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    month: short ? "short" : "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
