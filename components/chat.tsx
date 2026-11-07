"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import mark from "@/assets/empiriolabs-ai-mark.png";
import { chatError, parseChatError, type ChatError, type ChatErrorCode } from "@/lib/errors";
import { LIMITS } from "@/lib/limits";
import type { ChatMessage, ChatModel } from "@/lib/types";
import {
  readVisitorKey,
  subscribeVisitorKey,
  VISITOR_KEY_HEADER,
  writeVisitorKey,
} from "@/lib/visitor-key";
import { API_KEYS_URL, ApiKeyDialog } from "./api-key-dialog";
import { Composer } from "./composer";
import { CheckIcon, KeyIcon, PlusIcon, RetryIcon } from "./icons";
import { preloadMarkdown } from "./lazy-markdown";
import { MessageList, messageText, TypingIndicator } from "./message-list";
import { Notice } from "./notice";
import { SiteHeader } from "./site-header";

const BILLING_URL = "https://platform.empiriolabs.ai/dashboard/billing";

const SUGGESTIONS = [
  { title: "Explain a concept", prompt: "Explain how HTTP caching works, with a short example." },
  {
    title: "Write code",
    prompt: "Write a TypeScript function that debounces another function, with a usage example.",
  },
  { title: "Draft a message", prompt: "Draft a short, friendly follow-up email after a product demo." },
  { title: "Plan something", prompt: "Plan a three-day trip to Lisbon on a moderate budget." },
];

const RETRYABLE: ChatErrorCode[] = [
  "rate_limited",
  "model_failed",
  "network",
  "unknown",
  "catalog_unavailable",
  "visitor_credits",
  "server_credits",
  "visitor_key_limit",
  "server_key_limit",
];
const KEY_ERRORS: ChatErrorCode[] = ["visitor_key_missing", "visitor_key_rejected", "visitor_key_limit"];

/** Only the text of each message is sent; reasoning stays on the page. */
function toRequestMessage(message: ChatMessage) {
  return {
    id: message.id,
    role: message.role,
    parts: message.parts.flatMap((part) => (part.type === "text" ? [{ type: "text", text: part.text }] : [])),
  };
}

function getServerKeySnapshot(): string | null {
  return null;
}

type ChatProps = {
  models: ChatModel[];
  defaultModelId: string | null;
  initialModelId: string | null;
  demoMode: boolean;
  setupNeeded: boolean;
  catalogUnavailable: boolean;
};

type Pending = { text: string; fromInput: boolean };

export function Chat({
  models,
  defaultModelId,
  initialModelId,
  demoMode,
  setupNeeded,
  catalogUnavailable,
}: ChatProps) {
  const router = useRouter();
  const [modelId, setModelId] = useState(initialModelId);
  const [input, setInput] = useState("");
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [localError, setLocalError] = useState<ChatError | null>(null);
  const [clearedMessages, setClearedMessages] = useState<ChatMessage[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const followReply = useRef(true);

  const visitorKey = useSyncExternalStore(subscribeVisitorKey, readVisitorKey, getServerKeySnapshot);

  // Repeating the same words would not be read out again, so alternate a trailing no-break space.
  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text));
  }, []);
  const announceCopied = useCallback(() => announce("Reply copied."), [announce]);

  const [transport] = useState(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body, headers }) => ({
          body: { ...body, messages: messages.map(toRequestMessage) },
          headers,
        }),
      }),
  );

  const { messages, sendMessage, regenerate, stop, status, error, setMessages, clearError } =
    useChat<ChatMessage>({
      transport,
      throttle: 50,
      onFinish: ({ isAbort, isError }) => {
        if (!isAbort && !isError) announce("Reply finished.");
      },
      // A key the API refused is forgotten, so the page asks for a new one.
      onError: (chatFailure) => {
        if (parseChatError(chatFailure).code === "visitor_key_rejected") writeVisitorKey(null);
      },
    });

  const busy = status === "submitted" || status === "streaming";
  const noModels = catalogUnavailable || models.length === 0;
  const ready = !setupNeeded && !noModels && modelId !== null;
  const needsVisitorKey = demoMode && !visitorKey;
  const modelsById = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
  const shownError = localError ?? (error ? parseChatError(error) : null);

  // Follow a reply while it streams, unless the visitor scrolled up to read.
  useEffect(() => {
    function onScroll() {
      const distance = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      followReply.current = distance < 120;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (followReply.current) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [messages, status, shownError]);

  // The message box is the one primary input: focus it on desktop, not on touch screens.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) textareaRef.current?.focus();
  }, []);

  // Load the Markdown renderer while the page is idle, before the first reply needs it.
  useEffect(() => {
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(preloadMarkdown, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(preloadMarkdown, 1000);
    return () => clearTimeout(timer);
  }, []);

  function requestOptions(key: string | null) {
    return {
      body: { model: modelId },
      headers: demoMode && key ? { [VISITOR_KEY_HEADER]: key } : undefined,
    };
  }

  /** Sends a message after the limits check. Returns false when it was not sent. */
  function dispatch(text: string, key: string | null): boolean {
    if (text.length > LIMITS.maxMessageChars) {
      setLocalError(chatError("message_too_long"));
      return false;
    }
    const conversationChars = messages.reduce(
      (total, message) => total + messageText(message).length,
      text.length,
    );
    if (messages.length + 1 > LIMITS.maxMessages || conversationChars > LIMITS.maxConversationChars) {
      setLocalError(chatError("conversation_too_long"));
      return false;
    }
    setLocalError(null);
    setClearedMessages(null);
    followReply.current = true;
    void sendMessage({ text }, requestOptions(key));
    return true;
  }

  function submit(text: string, fromInput: boolean) {
    const trimmed = text.trim();
    if (!trimmed || busy || !ready) return;
    if (needsVisitorKey) {
      setPending({ text: trimmed, fromInput });
      setKeyDialogOpen(true);
      return;
    }
    if (dispatch(trimmed, visitorKey) && fromInput) setInput("");
  }

  function retry(key: string | null = visitorKey) {
    setLocalError(null);
    followReply.current = true;
    void regenerate(requestOptions(key));
  }

  function saveKey(key: string) {
    writeVisitorKey(key);
    setKeyDialogOpen(false);
    announce("API key saved.");
    if (pending) {
      setPending(null);
      if (dispatch(pending.text, key) && pending.fromInput) setInput("");
    } else if (shownError && KEY_ERRORS.includes(shownError.code) && messages.length > 0) {
      retry(key);
    }
  }

  function removeKey() {
    writeVisitorKey(null);
    setKeyDialogOpen(false);
    setPending(null);
    announce("API key removed.");
  }

  function closeKeyDialog() {
    setKeyDialogOpen(false);
    setPending(null);
  }

  async function newChat() {
    if (busy) await stop();
    if (messages.length > 0) {
      setClearedMessages(messages);
      announce("Chat cleared.");
    }
    setMessages([]);
    clearError();
    setLocalError(null);
    textareaRef.current?.focus();
  }

  function undoNewChat() {
    if (!clearedMessages) return;
    setMessages(clearedMessages);
    setClearedMessages(null);
    announce("Chat restored.");
  }

  function changeModel(id: string) {
    setModelId(id);
    // The choice lives in the URL, so a refresh or a shared link keeps it.
    const url = new URL(window.location.href);
    if (id === defaultModelId) url.searchParams.delete("model");
    else url.searchParams.set("model", id);
    window.history.replaceState(null, "", url);
  }

  const lastMessage = messages.at(-1);
  const waitingModel = modelId ? (modelsById.get(modelId)?.name ?? modelId) : "Assistant";

  return (
    <>
      <a className="skip-link" href="#composer-input">
        Skip to the message box
      </a>
      <SiteHeader>
        {demoMode ? (
          <button
            type="button"
            className="header-button"
            onClick={() => setKeyDialogOpen(true)}
            aria-haspopup="dialog"
          >
            {visitorKey ? <CheckIcon /> : <KeyIcon />}
            <span>API Key</span>
            {visitorKey ? <span className="visually-hidden">(added)</span> : null}
          </button>
        ) : null}
        <button type="button" className="header-button" onClick={newChat}>
          <PlusIcon />
          <span>New Chat</span>
        </button>
      </SiteHeader>

      <main className="chat">
        <section className="conversation" aria-label="Conversation">
          {messages.length === 0 ? (
            <div className="empty-state">
              <Image
                className="empty-state__mark"
                src={mark}
                alt=""
                width={44}
                height={44}
                loading="eager"
                unoptimized
              />
              <div className="empty-state__heading">
                <h2 className="empty-state__title">How can I help?</h2>
                <p className="empty-state__subtitle">Chat with text models from the EmpirioLabs AI catalog.</p>
              </div>
              {setupNeeded ? (
                <Notice title="Add an API key to start.">
                  Set <code>EMPIRIOLABS_API_KEY</code> in this app&apos;s environment variables, then
                  redeploy.{" "}
                  <a href={API_KEYS_URL} target="_blank" rel="noopener noreferrer">
                    Get an API key
                  </a>
                </Notice>
              ) : noModels ? (
                <Notice title="Models could not be loaded.">
                  Check the connection, then{" "}
                  <button type="button" className="link-button" onClick={() => router.refresh()}>
                    try again
                  </button>
                  .
                </Notice>
              ) : needsVisitorKey ? (
                <Notice title="Add your API key to start.">
                  This demo runs on your own EmpirioLabs AI API key.{" "}
                  <button type="button" className="link-button" onClick={() => setKeyDialogOpen(true)}>
                    Add API Key
                  </button>
                </Notice>
              ) : null}
              {clearedMessages ? (
                <p className="empty-state__cleared">
                  Chat cleared.{" "}
                  <button type="button" className="link-button" onClick={undoNewChat}>
                    Undo
                  </button>
                </p>
              ) : null}
              <ul className="suggestions" aria-label="Suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <li key={suggestion.title}>
                    <button
                      type="button"
                      className="suggestion"
                      onClick={() => submit(suggestion.prompt, false)}
                      disabled={!ready}
                    >
                      <span className="suggestion__title">{suggestion.title}</span>
                      <span className="suggestion__prompt">{suggestion.prompt}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <MessageList
              messages={messages}
              streaming={status === "streaming"}
              modelsById={modelsById}
              onCopied={announceCopied}
            />
          )}

          {status === "submitted" && lastMessage?.role === "user" ? (
            <div className="message message--assistant message--pending">
              <p className="message__author">{waitingModel}</p>
              <TypingIndicator />
            </div>
          ) : null}

          {shownError ? (
            <div className="alert" role="alert">
              <p className="alert__text">{shownError.message}</p>
              <div className="alert__actions">
                {RETRYABLE.includes(shownError.code) && messages.length > 0 ? (
                  <button type="button" className="button button--small" onClick={() => retry()}>
                    <RetryIcon width={14} height={14} />
                    Try Again
                  </button>
                ) : null}
                {KEY_ERRORS.includes(shownError.code) ? (
                  <button
                    type="button"
                    className="button button--small"
                    onClick={() => setKeyDialogOpen(true)}
                  >
                    Update API Key
                  </button>
                ) : null}
                {shownError.code === "visitor_credits" ? (
                  <a className="button button--small" href={BILLING_URL} target="_blank" rel="noopener noreferrer">
                    Add Credits
                  </a>
                ) : null}
                {shownError.code === "model_unavailable" || shownError.code === "model_forbidden" ? (
                  <button
                    type="button"
                    className="button button--small"
                    onClick={() => selectRef.current?.focus()}
                  >
                    Choose Model
                  </button>
                ) : null}
                {shownError.code === "conversation_too_long" || shownError.code === "context_too_long" ? (
                  <button type="button" className="button button--small" onClick={newChat}>
                    New Chat
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <div className="composer-dock">
          <Composer
            value={input}
            onValueChange={(value) => {
              setInput(value);
              if (localError?.code === "message_too_long") setLocalError(null);
            }}
            onSubmit={() => submit(input, true)}
            onStop={() => void stop()}
            busy={busy}
            disabled={!ready}
            models={models}
            modelId={modelId}
            onModelChange={changeModel}
            textareaRef={textareaRef}
            selectRef={selectRef}
          />
          <p className="composer-dock__note">Models can make mistakes. Check important information.</p>
        </div>
      </main>

      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>

      {demoMode ? (
        <ApiKeyDialog
          open={keyDialogOpen}
          hasKey={Boolean(visitorKey)}
          onSave={saveKey}
          onRemove={removeKey}
          onClose={closeKeyDialog}
        />
      ) : null}
    </>
  );
}
