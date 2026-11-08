import "server-only";

type CommonConfig = {
  /** EMPIRIOLABS_MODEL: an optional default model ID. */
  defaultModel: string | undefined;
  /** EMPIRIOLABS_TOOLS: whether the agent can use EmpirioLabs AI tools. On unless set to false. */
  tools: boolean;
  /** APP_URL: the app's public address, used by sign-in. Optional. */
  appUrl: string | undefined;
};

export type ServerConfig = CommonConfig &
  (
    | {
        /**
         * Sign-in mode: each visitor signs in with their EmpirioLabs AI account,
         * and their requests use the access token that sign-in gives the app.
         * The mode when EMPIRIOLABS_API_KEY is not set, or DEMO_MODE is true.
         */
        signInMode: true;
        apiKey: undefined;
      }
    | {
        /** Server-key mode: every visitor uses EMPIRIOLABS_API_KEY, which stays on the server. */
        signInMode: false;
        apiKey: string;
      }
  );

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
  const common: CommonConfig = {
    defaultModel: readValue(process.env.EMPIRIOLABS_MODEL),
    tools: readFlag(process.env.EMPIRIOLABS_TOOLS, true),
    appUrl: readValue(process.env.APP_URL),
  };
  // DEMO_MODE=true keeps its earlier meaning: visitors use their own accounts, never the server's key.
  const apiKey = readFlag(process.env.DEMO_MODE) ? undefined : readValue(process.env.EMPIRIOLABS_API_KEY);
  return apiKey ? { ...common, signInMode: false, apiKey } : { ...common, signInMode: true, apiKey: undefined };
}
