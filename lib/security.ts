export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function ownerAuthority(
  request: Request,
  config: { userId?: string; ownerId?: string; publisherToken?: string },
): Promise<string> {
  const authorization = request.headers.get("authorization");
  if (
    config.publisherToken &&
    authorization &&
    (await secretEquals(authorization, `Bearer ${config.publisherToken}`))
  )
    return "publishing-service";
  if (!config.ownerId || config.userId !== config.ownerId)
    throw new HttpError(
      403,
      "Owner or publishing service authorization required",
    );
  if (request.method !== "GET") requireSameOrigin(request);
  return config.userId;
}
export function requireSameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new HttpError(403, "Same-origin request required");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "JSON required");
}
export async function readJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "JSON body required");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 200_000) {
      await reader.cancel();
      throw new HttpError(413, "Payload too large");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(combined));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
export async function secretEquals(
  actual: string,
  expected: string,
): Promise<boolean> {
  const hash = (value: string) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [a, b] = await Promise.all([hash(actual), hash(expected)]);
  return (
    new Uint8Array(a).reduce((n, v, i) => n | (v ^ new Uint8Array(b)[i]), 0) ===
    0
  );
}
