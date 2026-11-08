/**
 * Sign in with EmpirioLabs AI, as the page sees it. The routes live in
 * app/api/auth; the access token never reaches the page.
 */

/** The page links here to sign in. The route answers with a redirect to the EmpirioLabs AI consent screen. */
export const SIGN_IN_PATH = "/api/auth/login";

/** The page posts here to sign out. */
export const SIGN_OUT_PATH = "/api/auth/logout";

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
