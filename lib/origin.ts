import "server-only";
import { getServerConfig } from "./config";
import { SIGN_IN_PATH } from "./sign-in";

/** The address visitors reach this app at, as sign-in uses it. */
export type AppOrigin = {
  /** Scheme, host and port, such as `https://agent.example.com`. */
  origin: string;
  /** Whether the origin is https, so the sign-in cookies are marked Secure. */
  secure: boolean;
};

/** Hosts where plain http is accepted, for running the app on this computer. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * A host name and an optional port, and nothing else, so a forged header
 * cannot add a path, credentials, another host or a line break.
 */
function parseHost(value: string): string | null {
  const match = /^([a-z0-9.-]{1,253})(?::(\d{1,5}))?$/.exec(value.trim().toLowerCase());
  if (!match) return null;
  const [, hostname, port] = match;
  if (!hostname.split(".").every((label) => LABEL.test(label))) return null;
  if (port === undefined) return hostname;
  const number = Number(port);
  return number >= 1 && number <= 65535 ? `${hostname}:${number}` : null;
}

function toOrigin(protocol: string, host: string): AppOrigin | null {
  if (protocol !== "https" && protocol !== "http") return null;
  const parsed = parseHost(host);
  if (!parsed) return null;
  const url = new URL(`${protocol}://${parsed}`);
  if (protocol === "http" && !LOOPBACK_HOSTS.has(url.hostname)) return null;
  return { origin: url.origin, secure: protocol === "https" };
}

/** The first entry of a header that proxies may send as a comma-separated list. */
function firstValue(value: string | null): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

let reportedAppUrl: string | undefined;
let reportedRequestOrigin = false;

/** APP_URL as an origin. When it is not one, logs that once instead of on every request. */
function configuredOrigin(appUrl: string): AppOrigin | null {
  let origin: AppOrigin | null = null;
  try {
    const url = new URL(appUrl);
    const bare = url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
    if (bare) origin = toOrigin(url.protocol.slice(0, -1), url.host);
  } catch {
    origin = null;
  }
  if (!origin && reportedAppUrl !== appUrl) {
    reportedAppUrl = appUrl;
    console.error(
      "APP_URL must be the app's https address, such as https://agent.example.com. Sign-in is unavailable until it is.",
    );
  }
  return origin;
}

/** The origin a request arrived at: the forwarding headers Vercel and Railway set, otherwise Host. */
function requestOrigin(request: Request): AppOrigin | null {
  const protocol = (firstValue(request.headers.get("x-forwarded-proto")) ?? "http").toLowerCase();
  const host = firstValue(request.headers.get("x-forwarded-host")) ?? request.headers.get("host") ?? "";
  const origin = toOrigin(protocol, host);
  if (!origin && !reportedRequestOrigin) {
    reportedRequestOrigin = true;
    console.error(
      "Sign-in needs the app's https address. Set APP_URL to it, such as https://agent.example.com.",
    );
  }
  return origin;
}

/**
 * The app's public origin for sign-in: APP_URL when it is set, otherwise the
 * address the request arrived at. Null unless it is https (plain http only on
 * localhost and 127.0.0.1) with a plain host name.
 */
export function appOrigin(request: Request): AppOrigin | null {
  const { appUrl } = getServerConfig();
  return appUrl ? configuredOrigin(appUrl) : requestOrigin(request);
}

/**
 * Where the page's Sign In links point. With APP_URL, a visitor on another
 * address of the deployment signs in on APP_URL, where the sign-in returns.
 */
export function signInHref(): string {
  const { appUrl } = getServerConfig();
  const origin = appUrl ? configuredOrigin(appUrl) : null;
  return origin ? `${origin.origin}${SIGN_IN_PATH}` : SIGN_IN_PATH;
}
