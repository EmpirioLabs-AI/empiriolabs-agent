import "server-only";

/**
 * Refuses a browser request sent from another site, so other pages cannot use
 * this app's key or a visitor's sign-in. Browsers set Sec-Fetch-Site
 * themselves; Origin and Host are the fallback for browsers that do not.
 */
export function isCrossSite(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite !== "same-origin";

  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
