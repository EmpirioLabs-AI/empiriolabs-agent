import { after, type NextRequest } from "next/server";
import { getServerConfig } from "@/lib/config";
import { isCrossSite } from "@/lib/cross-site";
import { checkApiKey } from "@/lib/empiriolabs";
import { chatError } from "@/lib/errors";
import { revokeToken } from "@/lib/oauth";
import { appOrigin } from "@/lib/origin";
import { clientAddress, takeRateLimit } from "@/lib/rate-limit";
import {
  emptyResponse,
  jsonResponse,
  notFoundResponse,
  readSessionSource,
  readSessionToken,
  SESSION_COOKIE,
  setSessionCookies,
} from "@/lib/session";
import { apiKeyFailure, isApiKeyShape } from "@/lib/sign-in";

/** An API key is a short string; nothing longer is read. */
const MAX_BODY_BYTES = 4096;

/** The request body as text, or null when it is larger than the limit. */
async function readText(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** The `key` field of a JSON or form body. */
async function readKey(request: Request): Promise<string | null> {
  const text = await readText(request).catch(() => null);
  if (text === null) return null;
  let value: unknown;
  if ((request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    try {
      value = (JSON.parse(text) as { key?: unknown } | null)?.key;
    } catch {
      return null;
    }
  } else {
    value = new URLSearchParams(text).get("key");
  }
  return typeof value === "string" ? value.trim() : null;
}

/**
 * Continues with an API key instead of signing in. The key must have the shape
 * of an EmpirioLabs AI key, and one read-only request checks it. The app then
 * keeps it in the same HttpOnly cookie as a sign-in and answers 204. Sign-out
 * forgets the key and never revokes it. The key is never logged or returned.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!getServerConfig().signInMode) return notFoundResponse();
  if (isCrossSite(request)) return jsonResponse(chatError("cross_site"), 403);

  // Each request can make a request to the API, so it counts toward a limit per address.
  const waitSeconds = takeRateLimit(`auth:${clientAddress(request)}`);
  if (waitSeconds > 0) return jsonResponse(apiKeyFailure("rate_limited"), 429, { "retry-after": String(waitSeconds) });

  // The key is kept only at an https address (plain http only on this computer).
  const origin = appOrigin(request);
  if (!origin) return jsonResponse(apiKeyFailure("unavailable"), 503);

  const key = await readKey(request);
  if (!key || !isApiKeyShape(key)) return jsonResponse(apiKeyFailure("malformed_api_key"), 400);

  const result = await checkApiKey(key);
  if (result === "invalid") return jsonResponse(apiKeyFailure("invalid_api_key"), 400);
  if (result === "unavailable") return jsonResponse(apiKeyFailure("unavailable"), 503);

  // A sign-in this key replaces is revoked, so its connection does not stay
  // behind in the visitor's account. An earlier key is only forgotten.
  const previous = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (previous && previous !== key && readSessionSource(request) === "oauth") {
    after(() => revokeToken(previous, origin));
  }

  const response = emptyResponse(204);
  setSessionCookies(response, key, "key", origin.secure);
  return response;
}
