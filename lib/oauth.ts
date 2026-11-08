import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { AppOrigin } from "./origin";
import type { SignInOutcome } from "./sign-in";

/**
 * Sign in with EmpirioLabs AI: OAuth 2.1, authorization code with PKCE (S256),
 * as https://docs.empiriolabs.ai/oauth describes. The app is a public client
 * with no secret. Its client ID is the URL of its client metadata document, and
 * the access token it receives is a dedicated API key for the visitor's
 * account, which the visitor can disconnect under Settings > Connected
 * applications. The endpoints are listed in the authorization server metadata
 * at https://platform.empiriolabs.ai/.well-known/oauth-authorization-server.
 */
const ISSUER = "https://platform.empiriolabs.ai";
const AUTHORIZE_URL = `${ISSUER}/dashboard/oauth/authorize`;
const TOKEN_URL = `${ISSUER}/api/oauth/token`;
const REVOKE_URL = `${ISSUER}/api/oauth/revoke`;

/** Access to the EmpirioLabs AI API: this resource with the scope `api`. */
const API_RESOURCE = "https://api.empiriolabs.ai";
const API_SCOPE = "api";

const CLIENT_NAME = "EmpirioLabs AI Agent";
const CLIENT_METADATA_PATH = "/oauth/client.json";
const CALLBACK_PATH = "/api/auth/callback";
/** app/icon.png, which Next.js serves at this path. */
const LOGO_PATH = "/icon.png";

const TOKEN_TIMEOUT_MS = 10_000;
const REVOKE_TIMEOUT_MS = 3_000;
const FORM_HEADERS = {
  "content-type": "application/x-www-form-urlencoded",
  accept: "application/json",
};

/** The app's client ID: the URL of its client metadata document. */
export function clientId(origin: AppOrigin): string {
  return `${origin.origin}${CLIENT_METADATA_PATH}`;
}

function redirectUri(origin: AppOrigin): string {
  return `${origin.origin}${CALLBACK_PATH}`;
}

/** The client metadata document the authorization server reads at the client ID. */
export function clientMetadata(origin: AppOrigin) {
  return {
    client_id: clientId(origin),
    client_name: CLIENT_NAME,
    client_uri: origin.origin,
    logo_uri: `${origin.origin}${LOGO_PATH}`,
    redirect_uris: [redirectUri(origin)],
    token_endpoint_auth_method: "none",
  };
}

/** A random `state` or PKCE `code_verifier`: 32 bytes, base64url, 43 characters. */
export function randomValue(): string {
  return randomBytes(32).toString("base64url");
}

/** The address of the consent screen for a new sign-in. */
export function authorizeUrl(origin: AppOrigin, state: string, codeVerifier: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId(origin),
    redirect_uri: redirectUri(origin),
    scope: API_SCOPE,
    resource: API_RESOURCE,
    code_challenge: createHash("sha256").update(codeVerifier).digest("base64url"),
    code_challenge_method: "S256",
    state,
  }).toString();
  return url.href;
}

/** Printable ASCII without spaces, up to 512 characters: the shape of an access token or a code. */
function isOpaqueValue(value: string): boolean {
  return value.length <= 512 && /^[\x21-\x7e]+$/.test(value);
}

export function isAccessToken(value: string): boolean {
  return isOpaqueValue(value);
}

export function isAuthorizationCode(value: string): boolean {
  return isOpaqueValue(value);
}

/** An OAuth error code from a response, safe to log. */
function errorCode(body: unknown): string {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === "string" && /^[a-z_]{1,64}$/.test(error) ? error : "unknown";
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** The failure's class, never its message, which could repeat the request. */
function failureName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

export type TokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; outcome: Exclude<SignInOutcome, "cancelled"> };

/**
 * Exchanges an authorization code for the visitor's access token, on the
 * server. Logs one line for a failure: the HTTP status and the OAuth error
 * code. The code, the verifier and the token are never logged.
 */
export async function exchangeCode(origin: AppOrigin, code: string, codeVerifier: string): Promise<TokenResult> {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: FORM_HEADERS,
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(origin),
        client_id: clientId(origin),
        code_verifier: codeVerifier,
        resource: API_RESOURCE,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("Sign-in failed:", JSON.stringify({ step: "token", error: failureName(error) }));
    return { ok: false, outcome: "unavailable" };
  }

  const body = await readBody(response);
  if (response.ok) {
    const { access_token: accessToken, token_type: tokenType } = (body ?? {}) as Record<string, unknown>;
    if (
      typeof accessToken === "string" &&
      isAccessToken(accessToken) &&
      typeof tokenType === "string" &&
      tokenType.toLowerCase() === "bearer"
    ) {
      return { ok: true, accessToken };
    }
    console.error("Sign-in failed:", JSON.stringify({ step: "token", status: response.status, error: "unexpected_response" }));
    return { ok: false, outcome: "failed" };
  }

  const error = errorCode(body);
  console.error("Sign-in failed:", JSON.stringify({ step: "token", status: response.status, error }));
  if (response.status === 429 || error === "too_many_requests") return { ok: false, outcome: "rate_limited" };
  if (response.status >= 500 || error === "temporarily_unavailable") return { ok: false, outcome: "unavailable" };
  return { ok: false, outcome: "failed" };
}

/**
 * Revokes an access token, which disconnects the app from the visitor's
 * account. Best effort: a 503 or a network failure is tried once more, then
 * the failure is logged (status and error code only) and the visitor can still
 * disconnect the app under Settings > Connected applications. `origin` is null
 * when the app's client ID is not known, and the token is then revoked on its own.
 */
export async function revokeToken(token: string, origin: AppOrigin | null): Promise<void> {
  const body = new URLSearchParams({ token });
  if (origin) body.set("client_id", clientId(origin));

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(REVOKE_URL, {
        method: "POST",
        headers: FORM_HEADERS,
        body,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
      });
      if (response.ok) return;
      // 503 means the token was not revoked yet, and the request can be sent again.
      if (response.status === 503 && attempt === 1) continue;
      const error = errorCode(await readBody(response));
      console.error("Could not revoke the sign-in:", JSON.stringify({ status: response.status, error }));
      return;
    } catch (error) {
      if (attempt === 1) continue;
      console.error("Could not revoke the sign-in:", JSON.stringify({ error: failureName(error) }));
    }
  }
}
