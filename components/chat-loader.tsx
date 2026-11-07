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
import { Chat } from "./chat";

/** Loads the live model list and this deployment's settings, then renders the chat. */
export async function ChatLoader({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  // Everything below runs per request: settings come from the environment at
  // request time, and the model list from the live catalog.
  await connection();
  const config = getServerConfig();
  const setupNeeded = !config.demoMode && !config.apiKey;
  const [{ model: requested }, models] = await Promise.all([
    searchParams,
    getCatalogModels().catch((): CatalogModel[] | null => null),
  ]);

  if (!models) {
    return (
      <Chat
        models={[]}
        defaultModelId={null}
        initialModelId={null}
        demoMode={config.demoMode}
        setupNeeded={setupNeeded}
        catalogUnavailable
      />
    );
  }

  const configured = resolveConfiguredModel(models, config.defaultModel);
  const selectable = selectableModels(models, configured);
  const fallback = pickDefaultModel(selectable, configured);
  const fromUrl = typeof requested === "string" ? findModel(selectable, requested) : undefined;

  return (
    <Chat
      models={selectable.map(toChatModel)}
      defaultModelId={fallback?.id ?? null}
      initialModelId={(fromUrl ?? fallback)?.id ?? null}
      demoMode={config.demoMode}
      setupNeeded={setupNeeded}
      catalogUnavailable={false}
    />
  );
}
