import { readFileSync } from "node:fs";
import path from "node:path";

const [filename, ...extra] = process.argv.slice(2);
if (!filename || extra.length)
  throw new Error(
    "Usage: node scripts/publish-edition.mjs private-data/edition.draft.json",
  );
const root = path.resolve("private-data"),
  target = path.resolve(filename);
if (!target.startsWith(root + path.sep))
  throw new Error("Keep unpublished editions under ignored private-data/");
const origin = new URL(process.env.SITE_ORIGIN || "");
if (
  origin.protocol !== "https:" ||
  !origin.hostname.endsWith(".chatgpt.site") ||
  origin.pathname !== "/" ||
  origin.username ||
  origin.password ||
  origin.port
)
  throw new Error("SITE_ORIGIN must be the private ChatGPT Site HTTPS origin");
if (!process.env.PUBLISHER_TOKEN || !process.env.SITES_SERVICE_TOKEN)
  throw new Error(
    "Provide PUBLISHER_TOKEN and SITES_SERVICE_TOKEN securely in the process environment",
  );
const edition = JSON.parse(readFileSync(target, "utf8"));
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.PUBLISHER_TOKEN}`,
  "OAI-Sites-Authorization": `Bearer ${process.env.SITES_SERVICE_TOKEN}`,
};
const response = await fetch(new URL("/api/owner", origin), {
  method: "POST",
  headers,
  body: JSON.stringify({ action: "publish", edition, editorialApproved: true }),
  redirect: "error",
  signal: AbortSignal.timeout(180000),
});
if (!response.ok)
  throw new Error(
    `Publication rejected (${response.status}); inspect the owner inbox and validate the draft. No credentials or answer keys are printed.`,
  );
const result = await response.json();
const verification = await fetch(
  new URL(`/api/owner?editionId=${encodeURIComponent(result.id)}`, origin),
  { headers, redirect: "error", signal: AbortSignal.timeout(15000) },
);
if (!verification.ok)
  throw new Error(
    "Publication returned, but authenticated readback failed. Do not enable a schedule.",
  );
const persisted = await verification.json();
// Server canonicalization uses the schema, so the authoritative digest is returned by publication.
if (persisted.edition?.digest !== result.digest)
  throw new Error(
    "Persisted digest does not match publication; do not enable a schedule",
  );
console.log(
  JSON.stringify({
    id: result.id,
    digest: result.digest,
    created: result.created,
    readbackVerified: true,
  }),
);
