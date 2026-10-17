import { env } from "cloudflare:workers";
import { z } from "zod";
import { getChatGPTUser } from "../chatgpt-auth";
import { QuizStore } from "../../lib/store";
import {
  callCloudTool,
  cloudTools,
  requireCloudOwner,
} from "../../lib/cloud-tools";
import { EditionValidationError } from "../../lib/domain";
import { HttpError, readJson } from "../../lib/security";

export const dynamic = "force-dynamic";
const messageSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number()]),
    method: z.enum(["server/discover", "tools/list", "tools/call"]),
    params: z.unknown().optional(),
  })
  .strict();
const send = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(request: Request) {
  let id: string | number | null = null;
  try {
    const message = messageSchema.parse(await readJson(request));
    id = message.id;
    if (message.method === "server/discover")
      return send({
        jsonrpc: "2.0",
        id,
        result: {
          supportedVersions: ["2026-07-28"],
          capabilities: { tools: {} },
        },
      });
    if (message.method === "tools/list")
      return send({ jsonrpc: "2.0", id, result: { tools: cloudTools } });
    // Metadata is safe for provisioning/discovery. Every operation separately requires
    // the configured owner identity supplied by Sites' MCP authentication boundary.
    requireCloudOwner((await getChatGPTUser())?.userId, env.OWNER_USER_ID);
    if (!env.DB) throw new HttpError(503, "Database unavailable");
    const params = z
      .object({ name: z.string(), arguments: z.unknown() })
      .strict()
      .parse(message.params);
    try {
      const result = await callCloudTool(
        new QuizStore(env.DB),
        params.name,
        params.arguments,
      );
      return send({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: JSON.stringify(result) }] },
      });
    } catch (error) {
      const text =
        error instanceof HttpError || error instanceof EditionValidationError
          ? error.message
          : error instanceof z.ZodError
            ? "Invalid tool arguments or edition structure"
            : "Cloud operation failed";
      return send({
        jsonrpc: "2.0",
        id,
        result: { isError: true, content: [{ type: "text", text }] },
      });
    }
  } catch (error) {
    if (error instanceof HttpError)
      return send(
        { jsonrpc: "2.0", id, error: { code: -32001, message: error.message } },
        error.status,
      );
    return send(
      {
        jsonrpc: "2.0",
        id,
        error: { code: -32600, message: "Invalid MCP request" },
      },
      400,
    );
  }
}
