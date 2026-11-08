import { connection } from "next/server";
import { getServerConfig } from "@/lib/config";
import { clientMetadata } from "@/lib/oauth";
import { appOrigin } from "@/lib/origin";
import { notFoundResponse } from "@/lib/session";

/**
 * The app's OAuth client metadata document. Its own URL is the app's client
 * ID: the EmpirioLabs AI authorization server reads it to name the app on the
 * consent screen and to check the address a sign-in returns to.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const origin = getServerConfig().signInMode ? appOrigin(request) : null;
  if (!origin) return notFoundResponse();

  return Response.json(clientMetadata(origin), {
    headers: {
      // Public, so it may be cached briefly. Without APP_URL it names the address the request arrived at.
      "cache-control": "public, max-age=300",
      vary: "host, x-forwarded-host, x-forwarded-proto",
    },
  });
}
