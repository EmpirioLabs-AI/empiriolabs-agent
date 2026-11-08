import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isAccessToken } from "./oauth";
import { SIGN_IN_PARAM, type SignInOutcome } from "./sign-in";

/**
 * The visitor's access token, after they sign in. HttpOnly, so the page's
 * scripts cannot read it, and kept for 30 days, so a returning visitor uses the
 * same connection instead of adding a new one under Settings > Connected
 * applications each time. Sign Out revokes it. Only the server reads it, to
 * call EmpirioLabs AI for the visitor.
 */
export const SESSION_COOKIE = "empiriolabs_session";
const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

/** The `state` and PKCE `code_verifier` of a sign-in in progress, sent only to the sign-in routes for ten minutes. */
const SIGN_IN_COOKIE = "empiriolabs_sign_in";
const SIGN_IN_COOKIE_PATH = "/api/auth";
const SIGN_IN_COOKIE_MAX_AGE = 600;

/** Every sign-in response is private to the visitor and never stored by a cache. */
const NO_STORE = { "cache-control": "no-store" };

/** The visitor's access token, from the session cookie's value. */
export function readSessionToken(value: string | undefined): string | null {
  return value && isAccessToken(value) ? value : null;
}

export function setSessionCookie(response: NextResponse, token: string, secure: boolean): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
}

export function clearSessionCookie(response: NextResponse, secure: boolean): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

type PendingSignIn = { state: string; codeVerifier: string };

export function setSignInCookie(response: NextResponse, { state, codeVerifier }: PendingSignIn, secure: boolean): void {
  response.cookies.set(SIGN_IN_COOKIE, `${state}.${codeVerifier}`, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: SIGN_IN_COOKIE_PATH,
    maxAge: SIGN_IN_COOKIE_MAX_AGE,
  });
}

export function clearSignInCookie(response: NextResponse, secure: boolean): void {
  response.cookies.set(SIGN_IN_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: SIGN_IN_COOKIE_PATH,
    maxAge: 0,
    expires: new Date(0),
  });
}

/** The sign-in in progress in this browser, from its cookie. */
export function readPendingSignIn(request: NextRequest): PendingSignIn | null {
  const value = request.cookies.get(SIGN_IN_COOKIE)?.value;
  const match = value ? /^([\w-]{43})\.([\w-]{43})$/.exec(value) : null;
  return match ? { state: match[1], codeVerifier: match[2] } : null;
}

/** Compares the `state` a callback returned with the stored one, in constant time. */
export function stateMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A redirect to the chat, with the outcome of a sign-in that did not complete. */
export function redirectToChat(outcome?: SignInOutcome): NextResponse {
  const location = outcome ? `/?${SIGN_IN_PARAM}=${outcome}` : "/";
  return new NextResponse(null, { status: 303, headers: { location, ...NO_STORE } });
}

export function redirectTo(location: string): NextResponse {
  return new NextResponse(null, { status: 302, headers: { location, ...NO_STORE } });
}

export function emptyResponse(status: number): NextResponse {
  return new NextResponse(null, { status, headers: NO_STORE });
}

export function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): NextResponse {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/** The sign-in routes answer 404 in server-key mode, where nobody signs in. */
export function notFoundResponse(): NextResponse {
  return jsonResponse({ error: "not_found" }, 404);
}
