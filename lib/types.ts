import type { UIMessage } from "ai";

/** A chat model from the EmpirioLabs AI catalog, as the page shows it. */
export type ChatModel = {
  id: string;
  name: string;
  author: string;
  /** Whether the model calls tools. Models that do not answer as plain chat. */
  tools: boolean;
};

/** Facts the server attaches to each assistant reply. */
export type ChatMessageMetadata = {
  model?: string;
  finishReason?: string;
  /** The EmpirioLabs AI tools could not be loaded, so the reply was written without them. */
  toolsUnavailable?: boolean;
};

export type ChatMessage = UIMessage<ChatMessageMetadata>;
