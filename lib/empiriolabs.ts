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

/** Maps an error from the EmpirioLabs AI API to what the visitor sees. */
export function describeApiError(error: unknown, demoMode: boolean): ChatErrorCode {
  const { status, code } = readFailure(error);

  if (status === 401 || code === "invalid_api_key" || code === "missing_api_key") {
    return demoMode ? "visitor_key_rejected" : "server_key_rejected";
  }
  if (code === "spending_limit_reached") {
    return demoMode ? "visitor_key_limit" : "server_key_limit";
  }
  if (status === 402 || code === "insufficient_credits") {
    return demoMode ? "visitor_credits" : "server_credits";
  }
  if (code === "context_length_exceeded") return "context_too_long";
  if (status === 403) return "model_forbidden";
  if (status === 404) return "model_unavailable";
  if (status === 429 || code === "rate_limit_exceeded") return "rate_limited";
  if (status === 400 || status === 422) return "request_rejected";
  return "model_failed";
}
