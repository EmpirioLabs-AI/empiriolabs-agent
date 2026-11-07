import type { UIMessage } from "ai";

/** A chat model from the EmpirioLabs AI catalog, as the page shows it. */
export type ChatModel = {
  id: string;
  name: string;
  author: string;
};

/** Facts the server attaches to each assistant reply. */
export type ChatMessageMetadata = {
  model?: string;
  finishReason?: string;
};

export type ChatMessage = UIMessage<ChatMessageMetadata>;
