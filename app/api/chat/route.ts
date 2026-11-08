import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type ToolSet,
} from "ai";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCatalogModels, resolveConfiguredModel, selectableModels } from "@/lib/catalog";
import { getServerConfig } from "@/lib/config";
import { isCrossSite } from "@/lib/cross-site";
import { createEmpirioLabs, describeApiError, logApiFailure } from "@/lib/empiriolabs";
import { serializeChatError, type ChatErrorCode } from "@/lib/errors";
import { agentInstructions, WRAP_UP_INSTRUCTION } from "@/lib/instructions";
import { LIMITS } from "@/lib/limits";
import { loadAgentTools, logToolsUnavailable, type AgentTools } from "@/lib/mcp";
import { clientAddress, takeRateLimit } from "@/lib/rate-limit";
import { readSessionToken, SESSION_COOKIE } from "@/lib/session";
import type { ChatMessage } from "@/lib/types";

// Long replies from reasoning models, and tools that generate video, can take minutes.
export const maxDuration = 300;

/** After this long, the next step of a reply answers instead of calling more tools. */
const WRAP_UP_AFTER_MS = (maxDuration - 120) * 1000;

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

export async function POST(request: NextRequest): Promise<Response> {
  if (isCrossSite(request)) return fail("cross_site", 403);

  const waitSeconds = takeRateLimit(clientAddress(request));
  if (waitSeconds > 0) return fail("rate_limited", 429, { "retry-after": String(waitSeconds) });

  // Sign-in mode uses the visitor's own access token, from the HttpOnly cookie
  // that sign-in set. Server-key mode uses the deployment's key, which every
  // visitor shares.
  const config = getServerConfig();
  const signedIn = config.signInMode;
  const apiKey = config.signInMode
    ? readSessionToken(request.cookies.get(SESSION_COOKIE)?.value)
    : config.apiKey;
  if (!apiKey) return fail("sign_in_required", 401);

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

  const modelId = model.id;
  const empiriolabs = createEmpirioLabs(apiKey);

  // The tools come from the EmpirioLabs AI MCP server's live tool list, with the
  // same key as the chat. Models that do not call tools answer as plain chat.
  // A visitor's own key is not shared, so it also gets the account record tools.
  let agent: AgentTools | undefined;
  let toolsUnavailable = false;
  if (config.tools && model.tools) {
    try {
      agent = await loadAgentTools(apiKey, request.signal, !signedIn);
    } catch (error) {
      if (!request.signal.aborted) {
        logToolsUnavailable(error);
        toolsUnavailable = true;
      }
    }
  }
  const closeTools = () => agent?.close();
  request.signal.addEventListener("abort", closeTools, { once: true });

  const startedAt = Date.now();
  const instructions = agent ? agentInstructions(agent.instructions) : undefined;

  const result = streamText({
    model: empiriolabs.chatModel(modelId),
    instructions,
    messages: await convertToModelMessages(conversation),
    tools: agent?.tools,
    stopWhen: isStepCount(LIMITS.maxSteps),
    // The last step, or a reply that has run long, answers instead of calling more tools.
    prepareStep: ({ stepNumber }) =>
      instructions && (stepNumber >= LIMITS.maxSteps - 1 || Date.now() - startedAt > WRAP_UP_AFTER_MS)
        ? { instructions: `${instructions}\n${WRAP_UP_INSTRUCTION}` }
        : undefined,
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
    onEnd: closeTools,
    onAbort: closeTools,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream<ToolSet, ChatMessage>({
      stream: result.stream,
      tools: agent?.tools,
      sendReasoning: true,
      messageMetadata: ({ part }) => {
        if (part.type === "start") return toolsUnavailable ? { model: modelId, toolsUnavailable } : { model: modelId };
        if (part.type === "finish") return { finishReason: part.finishReason };
        return undefined;
      },
      // A reply the visitor stopped is not a failure. A visitor whose sign-in no
      // longer works gets session_ended, and the page then clears the cookie.
      onError: (error) =>
        serializeChatError(request.signal.aborted ? "unknown" : describeApiError(error, signedIn)),
      // Runs when the stream ends for any reason, including an error or a closed tab.
      onEnd: closeTools,
    }),
  });
}
