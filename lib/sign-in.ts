/**
 * Sign in with EmpirioLabs AI, as the page sees it. The routes live in
 * app/api/auth; the access token never reaches the page.
 */

/** The page links here to sign in. The route answers with a redirect to the EmpirioLabs AI consent screen. */
export const SIGN_IN_PATH = "/api/auth/login";

/** The page posts here to sign out. */
export const SIGN_OUT_PATH = "/api/auth/logout";

/** The page posts an API key here, for a visitor who continues with a key instead of signing in. */
export const API_KEY_PATH = "/api/auth/key";

/** Where a visitor creates an API key. */
export const API_KEYS_URL = "https://platform.empiriolabs.ai/dashboard/api-keys";

/**
 * The shape of an EmpirioLabs AI API key. Anything else is refused before it
 * is sent anywhere, such as a key for another service pasted by mistake.
 */
export function isApiKeyShape(value: string): boolean {
  return /^sk-empiriolabs-[A-Za-z0-9_-]{10,200}$/.test(value);
}

const API_KEY_FAILURES = {
  malformed_api_key: "Enter an EmpirioLabs AI API key. It starts with sk-empiriolabs-.",
  invalid_api_key: "This API key was not accepted. Check it, or create a new one, then try again.",
  rate_limited: "Too many attempts. Wait a minute, then try again.",
  unavailable: "The key could not be checked. Try again in a moment.",
} as const;

export type ApiKeyFailure = keyof typeof API_KEY_FAILURES;

/** The body the API key route answers with when it does not accept a key. */
export function apiKeyFailure(code: ApiKeyFailure): { code: ApiKeyFailure; message: string } {
  return { code, message: API_KEY_FAILURES[code] };
}

/** What the page shows for an answer from the API key route. Unknown answers read as unavailable. */
export function apiKeyFailureMessage(code: unknown): string {
  return typeof code === "string" && Object.hasOwn(API_KEY_FAILURES, code)
    ? API_KEY_FAILURES[code as ApiKeyFailure]
    : API_KEY_FAILURES.unavailable;
}

/** The address parameter that reports a sign-in that did not complete, such as `/?sign_in=cancelled`. */
export const SIGN_IN_PARAM = "sign_in";

const OUTCOMES = {
  cancelled: { title: "Sign-in was cancelled.", text: "No account was connected." },
  failed: { title: "Sign-in could not be completed.", text: "Try again." },
  unavailable: { title: "Sign-in is temporarily unavailable.", text: "Try again in a moment." },
  rate_limited: { title: "Too many sign-in attempts.", text: "Wait a few minutes, then try again." },
} as const;

export type SignInOutcome = keyof typeof OUTCOMES;

export function readSignInOutcome(value: unknown): SignInOutcome | null {
  return typeof value === "string" && Object.hasOwn(OUTCOMES, value) ? (value as SignInOutcome) : null;
}

/** What the page shows for a sign-in that did not complete. */
export function signInNotice(outcome: SignInOutcome): { title: string; text: string } {
  return OUTCOMES[outcome];
}
