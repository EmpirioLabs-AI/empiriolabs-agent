import type { NextRequest } from "next/server";
import { getServerConfig } from "@/lib/config";
import { isCrossSite } from "@/lib/cross-site";
import { chatError } from "@/lib/errors";
import { revokeToken } from "@/lib/oauth";
import { appOrigin } from "@/lib/origin";
import { clientAddress, takeRateLimit } from "@/lib/rate-limit";
import {
  clearSessionCookie,
  emptyResponse,
  jsonResponse,
  readSessionToken,
  SESSION_COOKIE,
} from "@/lib/session";

/**
 * Signs the visitor out: revokes their access token, which disconnects the app
 * from their EmpirioLabs AI account, and clears the session cookie. Answers
 * 204. Revocation is best effort; the cookie is cleared either way.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (isCrossSite(request)) return jsonResponse(chatError("cross_site"), 403);

  // Each sign-out can make a request to the revocation endpoint, so it counts toward a limit per address.
  const waitSeconds = takeRateLimit(`auth:${clientAddress(request)}`);
  if (waitSeconds > 0) return jsonResponse(chatError("rate_limited"), 429, { "retry-after": String(waitSeconds) });

  // The client ID names the app the token was issued to. Without it (outside
  // sign-in mode), the token is revoked on its own.
  const origin = getServerConfig().signInMode ? appOrigin(request) : null;
  const token = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (token) await revokeToken(token, origin);

  const response = emptyResponse(204);
  clearSessionCookie(response, origin?.secure ?? false);
  return response;
}
