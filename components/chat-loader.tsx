import { cookies } from "next/headers";
import { connection } from "next/server";
import {
  findModel,
  getCatalogModels,
  pickDefaultModel,
  resolveConfiguredModel,
  selectableModels,
  toChatModel,
  type CatalogModel,
} from "@/lib/catalog";
import { getServerConfig } from "@/lib/config";
import { signInHref } from "@/lib/origin";
import { readSessionToken, SESSION_COOKIE } from "@/lib/session";
import { readSignInOutcome, SIGN_IN_PARAM } from "@/lib/sign-in";
import { Chat } from "./chat";

/** Loads the live model list, this deployment's settings and the sign-in state, then renders the chat. */
export async function ChatLoader({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  // Everything below runs per request: settings come from the environment at
  // request time, the sign-in state from the visitor's cookie, and the model
  // list from the live catalog.
  await connection();
  const config = getServerConfig();
  const [params, models, cookieStore] = await Promise.all([
    searchParams,
    getCatalogModels().catch((): CatalogModel[] | null => null),
    cookies(),
  ]);

  // Only whether the visitor is signed in reaches the page. The access token
  // stays in its HttpOnly cookie, on the server.
  const auth = {
    signInMode: config.signInMode,
    signedIn: config.signInMode && readSessionToken(cookieStore.get(SESSION_COOKIE)?.value) !== null,
    signInHref: signInHref(),
    signInOutcome: readSignInOutcome(params[SIGN_IN_PARAM]),
  };

  if (!models) {
    return (
      <Chat
        models={[]}
        defaultModelId={null}
        initialModelId={null}
        toolsEnabled={config.tools}
        catalogUnavailable
        {...auth}
      />
    );
  }

  const requested = params.model;
  const configured = resolveConfiguredModel(models, config.defaultModel);
  const selectable = selectableModels(models, configured);
  const fallback = pickDefaultModel(selectable, configured);
  const fromUrl = typeof requested === "string" ? findModel(selectable, requested) : undefined;

  return (
    <Chat
      models={selectable.map(toChatModel)}
      defaultModelId={fallback?.id ?? null}
      initialModelId={(fromUrl ?? fallback)?.id ?? null}
      toolsEnabled={config.tools}
      catalogUnavailable={false}
      {...auth}
    />
  );
}
