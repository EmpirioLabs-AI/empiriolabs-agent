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
};

function readFlag(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
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
  };
}
