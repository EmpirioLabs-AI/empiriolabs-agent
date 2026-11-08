import "server-only";

export type ServerConfig = {
  /**
   * DEMO_MODE: each visitor sends their own API key with their messages and
   * the server never uses a key of its own.
   */
  demoMode: boolean;
  /** EMPIRIOLABS_API_KEY. Server-side only, and unused in demo mode. */
  apiKey: string | undefined;
  /** EMPIRIOLABS_MODEL: an optional default model ID. */
  defaultModel: string | undefined;
  /** EMPIRIOLABS_TOOLS: whether the agent can use EmpirioLabs AI tools. On unless set to false. */
  tools: boolean;
};

const TRUE_VALUES = ["1", "true", "yes", "on"];
const FALSE_VALUES = ["0", "false", "no", "off"];

function readFlag(value: string | undefined, fallback = false): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  if (TRUE_VALUES.includes(normalized)) return true;
  if (FALSE_VALUES.includes(normalized)) return false;
  return fallback;
}

function readValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Reads the configuration at request time; nothing here is baked into the build. */
export function getServerConfig(): ServerConfig {
  const demoMode = readFlag(process.env.DEMO_MODE);
  return {
    demoMode,
    apiKey: demoMode ? undefined : readValue(process.env.EMPIRIOLABS_API_KEY),
    defaultModel: readValue(process.env.EMPIRIOLABS_MODEL),
    tools: readFlag(process.env.EMPIRIOLABS_TOOLS, true),
  };
}
