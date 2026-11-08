import { connection, type NextRequest } from "next/server";
import { getServerConfig } from "@/lib/config";
import { authorizeUrl, randomValue } from "@/lib/oauth";
import { appOrigin } from "@/lib/origin";
import { notFoundResponse, redirectTo, redirectToChat, setSignInCookie } from "@/lib/session";

/**
 * Starts Sign in with EmpirioLabs AI: keeps a new `state` and PKCE
 * `code_verifier` in a short-lived HttpOnly cookie, then sends the visitor to
 * the EmpirioLabs AI consent screen.
 */
export async function GET(request: NextRequest): Promise<Response> {
  await connection();
  if (!getServerConfig().signInMode) return notFoundResponse();

  const origin = appOrigin(request);
  if (!origin) return redirectToChat("unavailable");

  const state = randomValue();
  const codeVerifier = randomValue();
  const response = redirectTo(authorizeUrl(origin, state, codeVerifier));
  setSignInCookie(response, { state, codeVerifier }, origin.secure);
  return response;
}
