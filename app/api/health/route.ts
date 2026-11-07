import { connection } from "next/server";

/** Liveness check for hosting platforms. It reports that the server answers, nothing else. */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}
