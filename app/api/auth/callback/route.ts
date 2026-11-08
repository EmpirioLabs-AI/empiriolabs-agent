import { after, connection, type NextRequest, type NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";
import { exchangeCode, isAuthorizationCode, revokeToken } from "@/lib/oauth";
import { appOrigin } from "@/lib/origin";
import { clientAddress, takeRateLimit } from "@/lib/rate-limit";
import {
  clearSignInCookie,
  notFoundResponse,
  readPendingSignIn,
  readSessionToken,
  redirectToChat,
  SESSION_COOKIE,
  setSessionCookie,
  stateMatches,
} from "@/lib/session";
import type { SignInOutcome } from "@/lib/sign-in";

/** What an `error` from the authorization server means for the visitor. */
function outcomeOf(error: string): SignInOutcome {
  if (error === "access_denied") return "cancelled";
  if (error === "temporarily_unavailable") return "unavailable";
  return "failed";
}

/**
 * Where the consent screen returns. Checks `state` against the cookie this
 * browser got when the sign-in started, exchanges the code for the visitor's
 * access token on the server, and keeps the token in an HttpOnly session
 * cookie. Anything else returns to the chat with a short outcome code, never
 * the authorization server's own text.
 */
export async function GET(request: NextRequest): Promise<Response> {
  await connection();
  if (!getServerConfig().signInMode) return notFoundResponse();

  const origin = appOrigin(request);
  // The sign-in cookie is used once, whatever the outcome.
  const finish = (response: NextResponse) => {
    clearSignInCookie(response, origin?.secure ?? false);
    return response;
  };

  // Each callback can make a request to the token endpoint, so it counts toward a limit per address.
  if (takeRateLimit(`auth:${clientAddress(request)}`) > 0) return finish(redirectToChat("rate_limited"));
  if (!origin) return finish(redirectToChat("unavailable"));

  // Only the browser that started this sign-in has its state: a callback from
  // another sign-in, or a forged one, ends here and no code is exchanged.
  const params = request.nextUrl.searchParams;
  const pending = readPendingSignIn(request);
  if (!pending || !stateMatches(params.get("state"), pending.state)) {
    const reason = pending ? "state_mismatch" : "no_sign_in_cookie";
    console.error("Sign-in failed:", JSON.stringify({ step: "callback", error: reason }));
    return finish(redirectToChat("failed"));
  }

  const error = params.get("error");
  if (error !== null) {
    if (error !== "access_denied") {
      const code = /^[a-z_]{1,64}$/.test(error) ? error : "unknown";
      console.error("Sign-in failed:", JSON.stringify({ step: "authorize", error: code }));
    }
    return finish(redirectToChat(outcomeOf(error)));
  }

  const code = params.get("code");
  if (!code || !isAuthorizationCode(code)) return finish(redirectToChat("failed"));

  const result = await exchangeCode(origin, code, pending.codeVerifier);
  if (!result.ok) return finish(redirectToChat(result.outcome));

  // Signing in again replaces the earlier sign-in in this browser, and its
  // connection is revoked so it does not stay behind in the visitor's account.
  const previous = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (previous && previous !== result.accessToken) after(() => revokeToken(previous, origin));

  const response = redirectToChat();
  setSessionCookie(response, result.accessToken, origin.secure);
  return finish(response);
}
