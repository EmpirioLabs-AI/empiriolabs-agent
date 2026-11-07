import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { getCatalogModels, resolveConfiguredModel, selectableModels } from "@/lib/catalog";
import { getServerConfig } from "@/lib/config";
import { createEmpirioLabs, describeApiError, logApiFailure } from "@/lib/empiriolabs";
import { serializeChatError, type ChatErrorCode } from "@/lib/errors";
import { LIMITS } from "@/lib/limits";
import { clientAddress, takeRateLimit } from "@/lib/rate-limit";
import type { ChatMessage } from "@/lib/types";
import { VISITOR_KEY_HEADER } from "@/lib/visitor-key";

// Long replies from reasoning models can take minutes.
export const maxDuration = 300;

const requestSchema = z.object({
  model: z.string().min(1).max(200),
  messages: z
    .array(
      z.object({
        id: z.string().max(200),
        role: z.enum(["user", "assistant"]),
        parts: z.array(z.object({ type: z.string().max(100), text: z.string().optional() })).max(200),
      }),
    )
    .min(1)
    .max(LIMITS.maxMessages),
});

function fail(code: ChatErrorCode, status: number, headers?: HeadersInit): Response {
  return new Response(serializeChatError(code), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

/**
 * Refuses a browser request sent from another site, so other pages cannot use
 * this app's key. Browsers set Sec-Fetch-Site themselves; Origin and Host are
 * the fallback for browsers that do not.
 */
function isCrossSite(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite !== "same-origin";

  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/** Reads the body as JSON, refusing anything larger than the limit. */
async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > LIMITS.maxBodyBytes) {
    throw new RangeError("Request body too large.");
  }
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > LIMITS.maxBodyBytes) {
      await reader.cancel();
      throw new RangeError("Request body too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return fail("cross_site", 403);

  const waitSeconds = takeRateLimit(clientAddress(request));
  if (waitSeconds > 0) return fail("rate_limited", 429, { "retry-after": String(waitSeconds) });

  const config = getServerConfig();
  let apiKey: string | undefined;
  if (config.demoMode) {
    apiKey = request.headers.get(VISITOR_KEY_HEADER)?.trim();
    if (!apiKey) return fail("visitor_key_missing", 401);
    if (apiKey.length > 512 || !/^[\x21-\x7e]+$/.test(apiKey)) return fail("visitor_key_rejected", 401);
  } else {
    apiKey = config.apiKey;
    if (!apiKey) return fail("server_key_missing", 503);
  }

  // The model list is needed below; start loading it now so it overlaps reading the body.
  const modelsPromise = getCatalogModels();
  modelsPromise.catch(() => undefined);

  let parsed: z.infer<typeof requestSchema>;
  try {
    const result = requestSchema.safeParse(await readJson(request));
    if (!result.success) return fail("bad_request", 400);
    parsed = result.data;
  } catch (error) {
    return error instanceof RangeError ? fail("conversation_too_long", 413) : fail("bad_request", 400);
  }

  // Only the text of each message goes to the model. Earlier reasoning is not
  // sent back, which keeps the input (and its cost) to the conversation itself.
  const conversation: ChatMessage[] = [];
  let conversationChars = 0;
  for (const message of parsed.messages) {
    const text = message.parts
      .flatMap((part) => (part.type === "text" && part.text ? [part.text] : []))
      .join("\n\n");
    if (!text.trim()) continue;
    if (message.role === "user" && text.length > LIMITS.maxMessageChars) {
      return fail("message_too_long", 413);
    }
    conversationChars += text.length;
    conversation.push({ id: message.id, role: message.role, parts: [{ type: "text", text }] });
  }
  if (conversationChars > LIMITS.maxConversationChars) return fail("conversation_too_long", 413);
  if (conversation.at(-1)?.role !== "user") return fail("bad_request", 400);

  let model;
  try {
    const models = await modelsPromise;
    const configured = resolveConfiguredModel(models, config.defaultModel);
    model = selectableModels(models, configured).find((candidate) => candidate.id === parsed.model);
  } catch {
    return fail("catalog_unavailable", 503);
  }
  if (!model) return fail("model_unavailable", 400);

  const demoMode = config.demoMode;
  const modelId = model.id;
  const empiriolabs = createEmpirioLabs(apiKey);

  const result = streamText({
    model: empiriolabs.chatModel(modelId),
    messages: await convertToModelMessages(conversation),
    maxOutputTokens:
      model.maxOutputTokens === null ? undefined : Math.min(LIMITS.maxOutputTokens, model.maxOutputTokens),
    // A failed reply is retried by the visitor, never silently by the server.
    maxRetries: 0,
    abortSignal: request.signal,
    timeout: { totalMs: (maxDuration - 10) * 1000 },
    // Replaces the default error log, which prints the whole request.
    onError: ({ error }) => {
      if (!request.signal.aborted) logApiFailure(error, modelId);
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream<ToolSet, ChatMessage>({
      stream: result.stream,
      sendReasoning: true,
      messageMetadata: ({ part }) => {
        if (part.type === "start") return { model: modelId };
        if (part.type === "finish") return { finishReason: part.finishReason };
        return undefined;
      },
      // A reply the visitor stopped is not a failure.
      onError: (error) =>
        serializeChatError(request.signal.aborted ? "unknown" : describeApiError(error, demoMode)),
    }),
  });
}
