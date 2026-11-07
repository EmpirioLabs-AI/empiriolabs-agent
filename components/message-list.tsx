"use client";

import { memo, useEffect, useState } from "react";
import type { ChatMessage, ChatModel } from "@/lib/types";
import { CheckIcon, ChevronRightIcon, CopyIcon } from "./icons";
import { LazyMarkdown } from "./lazy-markdown";

export function messageText(message: ChatMessage): string {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n\n");
}

type MessageListProps = {
  messages: ChatMessage[];
  streaming: boolean;
  modelsById: Map<string, ChatModel>;
  onCopied: () => void;
};

export const MessageList = memo(function MessageList({
  messages,
  streaming,
  modelsById,
  onCopied,
}: MessageListProps) {
  return (
    <ol className="messages">
      {messages.map((message, index) => {
        const modelId = message.metadata?.model;
        return (
          <MessageItem
            key={message.id}
            message={message}
            modelName={modelId ? (modelsById.get(modelId)?.name ?? modelId) : "Assistant"}
            streaming={streaming && index === messages.length - 1}
            onCopied={onCopied}
          />
        );
      })}
    </ol>
  );
});

type MessageItemProps = {
  message: ChatMessage;
  modelName: string;
  streaming: boolean;
  onCopied: () => void;
};

const MessageItem = memo(function MessageItem({ message, modelName, streaming, onCopied }: MessageItemProps) {
  if (message.role === "user") {
    return (
      <li className="message message--user">
        <span className="visually-hidden">You said:</span>
        <div className="message__bubble">{messageText(message)}</div>
      </li>
    );
  }

  const text = messageText(message);
  const hasContent = message.parts.some(
    (part) => (part.type === "text" || part.type === "reasoning") && part.text.length > 0,
  );
  // A reply that failed before any content is shown only as the error below it.
  if (!streaming && !hasContent) return null;

  return (
    <li className="message message--assistant">
      <p className="message__author">{modelName}</p>
      <div className="message__body">
        {message.parts.map((part, index) => {
          if (part.type === "reasoning" && part.text) {
            return (
              <Reasoning
                key={index}
                text={part.text}
                active={streaming && part.state !== "done" && !text}
              />
            );
          }
          if (part.type === "text" && part.text) {
            return <LazyMarkdown key={index} text={part.text} />;
          }
          return null;
        })}
        {streaming && !hasContent ? <TypingIndicator /> : null}
      </div>
      {message.metadata?.finishReason === "length" ? (
        <p className="message__note">This reply stopped at its length limit.</p>
      ) : null}
      {!streaming && text ? (
        <div className="message__actions">
          <CopyButton text={text} onCopied={onCopied} />
        </div>
      ) : null}
    </li>
  );
});

function Reasoning({ text, active }: { text: string; active: boolean }) {
  return (
    <details className="reasoning">
      <summary className="reasoning__summary">
        <ChevronRightIcon className="reasoning__chevron" width={14} height={14} />
        <span className={active ? "reasoning__label reasoning__label--active" : "reasoning__label"}>
          {active ? "Thinking…" : "Reasoning"}
        </span>
      </summary>
      <div className="reasoning__text" tabIndex={0}>
        {text}
      </div>
    </details>
  );
}

export function TypingIndicator() {
  return (
    <span className="typing" role="img" aria-label="Writing a reply">
      <span />
      <span />
      <span />
    </span>
  );
}

function CopyButton({ text, onCopied }: { text: string; onCopied: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied();
    } catch {
      // Clipboard access was refused; the reply stays selectable.
    }
  }

  return (
    <button type="button" className="message-action" onClick={copy}>
      {copied ? <CheckIcon width={14} height={14} /> : <CopyIcon width={14} height={14} />}
      <span className="steady-label">
        <span aria-hidden={copied}>Copy</span>
        <span aria-hidden={!copied}>Copied</span>
      </span>
    </button>
  );
}
