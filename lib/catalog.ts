import "server-only";
import { z } from "zod";
import { LIMITS } from "./limits";
import type { ChatModel } from "./types";

export const EMPIRIOLABS_API_URL = "https://api.empiriolabs.ai/v1";

const CATALOG_URL = `${EMPIRIOLABS_API_URL}/models?available=true`;
const CHAT_ENDPOINT = "POST /v1/chat/completions";
const FRESH_FOR_MS = 5 * 60_000;
/** How long the last good list stays in use while the catalog cannot be reached. */
const USABLE_FOR_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 10_000;

export type CatalogModel = ChatModel & {
  aliases: string[];
  featured: boolean;
  deprecated: boolean;
  /** A regional or capability copy of another model, such as `qwen3-7-plus:variant1`. */
  variant: boolean;
  /** The model's `max_tokens` ceiling, or null when it takes no `max_tokens`. */
  maxOutputTokens: number | null;
};

const entrySchema = z.object({
  id: z.string().min(1),
  display_name: z.string().nullish(),
  author: z.string().nullish(),
  category: z.string().nullish(),
  status: z.string().nullish(),
  deprecated: z.boolean().nullish(),
  is_featured: z.boolean().nullish(),
  aliases: z.array(z.string()).nullish(),
  output_modalities: z.array(z.string()).nullish(),
  supported_endpoints: z.array(z.string()).nullish(),
  supported_parameters: z
    .array(z.object({ name: z.string(), max: z.number().nullish() }))
    .nullish(),
});

const catalogSchema = z.object({
  data: z.array(z.unknown()),
  authors: z.array(z.object({ slug: z.string(), name: z.string() })).nullish(),
});

function toCatalogModel(raw: unknown, authorNames: Map<string, string>): CatalogModel | null {
  const parsed = entrySchema.safeParse(raw);
  if (!parsed.success) return null;
  const entry = parsed.data;

  // Text models that answer on /v1/chat/completions with text.
  const isChatModel =
    entry.category === "text" &&
    (entry.supported_endpoints ?? []).includes(CHAT_ENDPOINT) &&
    (entry.output_modalities ?? ["text"]).includes("text") &&
    (entry.status ?? "available") === "available";
  if (!isChatModel) return null;

  const maxTokens = entry.supported_parameters?.find((parameter) => parameter.name === "max_tokens");
  const author = entry.author ?? "";
  return {
    id: entry.id,
    name: entry.display_name?.trim() || entry.id,
    author: authorNames.get(author) ?? author,
    aliases: entry.aliases ?? [],
    featured: entry.is_featured === true,
    deprecated: entry.deprecated === true,
    variant: entry.id.includes(":"),
    maxOutputTokens: maxTokens ? (maxTokens.max ?? LIMITS.maxOutputTokens) : null,
  };
}

async function fetchCatalog(): Promise<CatalogModel[]> {
  const response = await fetch(CATALOG_URL, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`The model catalog answered with status ${response.status}.`);
  }
  const catalog = catalogSchema.parse(await response.json());
  const authorNames = new Map((catalog.authors ?? []).map((author) => [author.slug, author.name]));
  const models = catalog.data.flatMap((raw) => {
    const model = toCatalogModel(raw, authorNames);
    return model ? [model] : [];
  });
  if (models.length === 0) {
    throw new Error("The model catalog listed no chat models.");
  }
  return models;
}

// Shared across requests on purpose: the catalog is public data, and one fetch
// serves every request on this server instance for FRESH_FOR_MS.
let cached: { models: CatalogModel[]; fetchedAt: number } | undefined;
let pending: Promise<CatalogModel[]> | undefined;

/** Chat models from the live EmpirioLabs AI catalog, in catalog order. */
export async function getCatalogModels(): Promise<CatalogModel[]> {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < FRESH_FOR_MS) return cached.models;

  pending ??= fetchCatalog()
    .then((models) => {
      cached = { models, fetchedAt: Date.now() };
      return models;
    })
    .finally(() => {
      pending = undefined;
    });

  try {
    return await pending;
  } catch (error) {
    console.error("Could not load the model catalog:", error instanceof Error ? error.message : error);
    if (cached && now - cached.fetchedAt < USABLE_FOR_MS) return cached.models;
    throw error;
  }
}

/** Finds a model by its ID or one of its aliases. */
export function findModel(models: CatalogModel[], idOrAlias: string | undefined): CatalogModel | undefined {
  const wanted = idOrAlias?.trim().toLowerCase();
  if (!wanted) return undefined;
  return (
    models.find((model) => model.id.toLowerCase() === wanted) ??
    models.find((model) => model.aliases.some((alias) => alias.toLowerCase() === wanted))
  );
}

let reportedUnknownModel: string | undefined;

/** Resolves EMPIRIOLABS_MODEL against the catalog, and says once when it names no chat model. */
export function resolveConfiguredModel(
  models: CatalogModel[],
  idOrAlias: string | undefined,
): CatalogModel | undefined {
  const model = findModel(models, idOrAlias);
  if (idOrAlias && !model && reportedUnknownModel !== idOrAlias) {
    reportedUnknownModel = idOrAlias;
    console.warn(
      `EMPIRIOLABS_MODEL "${idOrAlias}" is not a chat model in the EmpirioLabs AI catalog; the catalog's default is used instead.`,
    );
  }
  return model;
}

/**
 * The models the page offers: every current base model, plus the configured
 * default when it is a variant or scheduled for retirement.
 */
export function selectableModels(models: CatalogModel[], configured: CatalogModel | undefined): CatalogModel[] {
  return models.filter((model) => (!model.deprecated && !model.variant) || model.id === configured?.id);
}

/** EMPIRIOLABS_MODEL when it names a chat model, otherwise the catalog's first featured chat model. */
export function pickDefaultModel(
  selectable: CatalogModel[],
  configured: CatalogModel | undefined,
): CatalogModel | undefined {
  return configured ?? selectable.find((model) => model.featured) ?? selectable[0];
}

export function toChatModel({ id, name, author }: CatalogModel): ChatModel {
  return { id, name, author };
}
