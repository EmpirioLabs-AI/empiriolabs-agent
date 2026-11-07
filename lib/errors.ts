import { LIMITS } from "./limits";

const MESSAGES = {
  server_key_missing:
    "This app needs an EmpirioLabs AI API key. Set EMPIRIOLABS_API_KEY, then redeploy.",
  server_key_rejected:
    "The app's API key was not accepted. Check EMPIRIOLABS_API_KEY, then redeploy.",
  visitor_key_missing: "Add your EmpirioLabs AI API key to send a message.",
  visitor_key_rejected: "Your API key was not accepted. Check it, then try again.",
  server_credits: "The EmpirioLabs AI account behind this app is out of credits.",
  visitor_credits: "Your EmpirioLabs AI account is out of credits. Add credits, then try again.",
  server_key_limit: "The app's API key has reached its spending limit.",
  visitor_key_limit:
    "Your API key has reached its spending limit. Raise the limit or use another key, then try again.",
  model_forbidden:
    "This account cannot use the selected model. Choose another model, or contact EmpirioLabs AI support if this continues.",
  model_unavailable: "The selected model is not available. Choose another model.",
  context_too_long:
    "This chat is longer than the selected model accepts. Start a new chat or choose a model with a larger context window.",
  request_rejected: "The model could not answer this message. Edit it and try again.",
  rate_limited: "Too many requests. Wait a moment, then try again.",
  model_failed: "The model did not finish its reply. Try again or choose another model.",
  message_too_long: `This message is too long. Shorten it to ${LIMITS.maxMessageChars.toLocaleString("en-US")} characters or fewer.`,
  conversation_too_long: "This chat is too long to continue. Start a new chat.",
  bad_request: "The message could not be sent. Reload the page and try again.",
  catalog_unavailable: "Models could not be loaded. Try again in a moment.",
  cross_site: "This app only accepts messages sent from its own pages.",
  network: "The reply could not load. Check your connection, then try again.",
  unknown: "Something went wrong. Try again.",
} as const;

export type ChatErrorCode = keyof typeof MESSAGES;

export type ChatError = {
  code: ChatErrorCode;
  message: string;
};

export function chatError(code: ChatErrorCode): ChatError {
  return { code, message: MESSAGES[code] };
}

/** The text the server sends as an error body or stream error. */
export function serializeChatError(code: ChatErrorCode): string {
  return JSON.stringify(chatError(code));
}

function isChatErrorCode(value: unknown): value is ChatErrorCode {
  return typeof value === "string" && Object.hasOwn(MESSAGES, value);
}

/** Reads an error from the chat transport back into a code and a message. */
export function parseChatError(error: Error): ChatError {
  try {
    const parsed: unknown = JSON.parse(error.message);
    if (parsed && typeof parsed === "object" && "code" in parsed && isChatErrorCode(parsed.code)) {
      return chatError(parsed.code);
    }
  } catch {
    // Not one of ours: the request never reached the server or the stream broke.
  }
  return chatError(error.name === "TypeError" ? "network" : "unknown");
}
