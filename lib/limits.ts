/**
 * Limits for each chat request. The server enforces them in app/api/chat/route.ts
 * and the page checks the message limits before it sends anything.
 */
export const LIMITS = {
  /** Largest request body the chat route reads. */
  maxBodyBytes: 1_000_000,
  /** Messages in one conversation, user and assistant combined. */
  maxMessages: 100,
  /** Characters in a single message. */
  maxMessageChars: 32_000,
  /** Characters across the whole conversation. */
  maxConversationChars: 200_000,
  /** Upper bound on generated tokens per step of a reply, lowered to each model's own maximum. */
  maxOutputTokens: 16_384,
  /** Model calls in one reply. The agent can use tools between them. */
  maxSteps: 10,
  /** Chat requests allowed per client IP address in each window, per server instance. */
  rateLimitRequests: 20,
  rateLimitWindowMs: 60_000,
} as const;
