import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, RetryError } from "ai";
import { EMPIRIOLABS_API_URL } from "./catalog";
import type { ChatErrorCode } from "./errors";

/** The EmpirioLabs AI provider for the AI SDK, using the given API key. */
export function createEmpirioLabs(apiKey: string) {
  return createOpenAICompatible({
    name: "empiriolabs",
    baseURL: EMPIRIOLABS_API_URL,
    apiKey,
    includeUsage: true,
  });
}

const KEY_CHECK_TIMEOUT_MS = 10_000;

/**
 * Checks an API key a visitor entered with one read-only request: the
 * account's usage, which answers even when the account has no credits. 401 or
 * 403 means the key is not accepted. The answer's body is never read, and the
 * key is never logged.
 */
export async function checkApiKey(apiKey: string): Promise<"valid" | "invalid" | "unavailable"> {
  try {
    const response = await fetch(`${EMPIRIOLABS_API_URL}/account/usage?limit=1`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(KEY_CHECK_TIMEOUT_MS),
    });
    await response.body?.cancel().catch(() => undefined);
    if (response.ok) return "valid";
    if (response.status === 401 || response.status === 403) return "invalid";
    console.error("API key check failed:", JSON.stringify({ status: response.status }));
    return "unavailable";
  } catch (error) {
    console.error("API key check failed:", JSON.stringify({ error: error instanceof Error ? error.name : "unknown" }));
    return "unavailable";
  }
}

type ApiFailure = {
  status?: number;
  code?: string;
  requestId?: string;
};

function readFailure(error: unknown): ApiFailure {
  if (RetryError.isInstance(error)) return readFailure(error.lastError);

  if (APICallError.isInstance(error)) {
    const body = error.data as { error?: { code?: unknown } } | undefined;
    const code = body?.error?.code;
    return {
      status: error.statusCode,
      code: typeof code === "string" ? code : undefined,
      requestId: error.responseHeaders?.["x-request-id"],
    };
  }

  // An error inside an open stream arrives as the API's error object.
  if (error && typeof error === "object") {
    const { code, request_id: requestId } = error as { code?: unknown; request_id?: unknown };
    return {
      code: typeof code === "string" ? code : undefined,
      requestId: typeof requestId === "string" ? requestId : undefined,
    };
  }

  return {};
}

/**
 * Logs one line for a failed reply: the model, the HTTP status, the API's error
 * code and its request ID. Message content and keys are never logged.
 */
export function logApiFailure(error: unknown, model: string): void {
  const { status, code, requestId } = readFailure(error);
  console.error("Chat reply failed:", JSON.stringify({ model, status, code, requestId }));
}

/**
 * Maps an error from the EmpirioLabs AI API to what the visitor sees.
 * `signedIn` is true when the request used the visitor's own access token or
 * API key: a 401 then means the visitor disconnected the app, or the token or
 * key no longer works.
 */
export function describeApiError(error: unknown, signedIn: boolean): ChatErrorCode {
  const { status, code } = readFailure(error);

  if (status === 401 || code === "invalid_api_key" || code === "missing_api_key") {
    return signedIn ? "session_ended" : "server_key_rejected";
  }
  if (code === "spending_limit_reached") {
    return signedIn ? "account_limit" : "server_key_limit";
  }
  if (status === 402 || code === "insufficient_credits") {
    return signedIn ? "account_credits" : "server_credits";
  }
  if (code === "context_length_exceeded") return "context_too_long";
  if (status === 403) return "model_forbidden";
  if (status === 404) return "model_unavailable";
  if (status === 429 || code === "rate_limit_exceeded") return "rate_limited";
  if (status === 400 || status === 422) return "request_rejected";
  return "model_failed";
}
