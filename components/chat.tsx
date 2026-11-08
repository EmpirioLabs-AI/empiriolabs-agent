"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import mark from "@/assets/empiriolabs-ai-mark.png";
import { saveDraft, takeDraft } from "@/lib/draft";
import { chatError, parseChatError, type ChatError, type ChatErrorCode } from "@/lib/errors";
import { LIMITS } from "@/lib/limits";
import { SIGN_IN_PARAM, SIGN_OUT_PATH, signInNotice, type SignInOutcome } from "@/lib/sign-in";
import { toolResultsNote } from "@/lib/tool-output";
import type { ChatMessage, ChatModel } from "@/lib/types";
import { Composer } from "./composer";
import { PlusIcon, RetryIcon, SignOutIcon } from "./icons";
import { preloadMarkdown } from "./lazy-markdown";
import { MessageList, messageText, TypingIndicator } from "./message-list";
import { Notice } from "./notice";
import { SignInLink } from "./sign-in-link";
import { SiteHeader } from "./site-header";

const BILLING_URL = "https://platform.empiriolabs.ai/dashboard/billing";

const TOOL_SUGGESTIONS = [
  {
    title: "Generate an image",
    prompt: "Generate an image of a lighthouse on a rocky coast at sunrise, in watercolor style.",
  },
  { title: "Search the web", prompt: "Search the web for today's top AI news headline and cite the source." },
  { title: "Compare models", prompt: "List three image models with their prices." },
  { title: "Create a voiceover", prompt: "Turn this into speech: Welcome to EmpirioLabs AI." },
];

const CHAT_SUGGESTIONS = [
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
  "account_credits",
  "server_credits",
  "account_limit",
  "server_key_limit",
];
const SIGN_IN_ERRORS: ChatErrorCode[] = ["sign_in_required", "session_ended"];

/**
 * Only the text of each message is sent; reasoning and tool results stay on
 * the page. A reply that made files or left a job running also sends a short
 * note naming them, so a later message can refer to them.
 */
function toRequestMessage(message: ChatMessage) {
  const parts = message.parts.flatMap((part) => (part.type === "text" ? [{ type: "text", text: part.text }] : []));
  const note = message.role === "assistant" ? toolResultsNote(message) : null;
  if (note) parts.push({ type: "text", text: note });
  return { id: message.id, role: message.role, parts };
}

type ChatProps = {
  models: ChatModel[];
  defaultModelId: string | null;
  initialModelId: string | null;
  /** Whether replies can use EmpirioLabs AI tools (EMPIRIOLABS_TOOLS). */
  toolsEnabled: boolean;
  catalogUnavailable: boolean;
  /** Sign-in mode: each visitor signs in with their EmpirioLabs AI account. */
  signInMode: boolean;
  /** In sign-in mode, whether this visitor was signed in when the page loaded. */
  signedIn: boolean;
  /** Where the Sign In links point. */
  signInHref: string;
  /** A sign-in that did not complete, reported by the sign-in routes in the address. */
  signInOutcome: SignInOutcome | null;
};

export function Chat({
  models,
  defaultModelId,
  initialModelId,
  toolsEnabled,
  catalogUnavailable,
  signInMode,
  signedIn: initialSignedIn,
  signInHref,
  signInOutcome,
}: ChatProps) {
  const router = useRouter();
  const [modelId, setModelId] = useState(initialModelId);
  const [input, setInput] = useState("");
  const [signedIn, setSignedIn] = useState(initialSignedIn);
  const [signingOut, setSigningOut] = useState(false);
  const [localError, setLocalError] = useState<ChatError | null>(null);
  const [clearedMessages, setClearedMessages] = useState<ChatMessage[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const followReply = useRef(true);

  // Repeating the same words would not be read out again, so alternate a trailing no-break space.
  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text));
  }, []);
  const announceCopied = useCallback(() => announce("Reply copied."), [announce]);

  // The session cookie goes with each request on its own; the page never sees the access token.
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
      // A sign-in that no longer works ends here: the page asks the visitor to
      // sign in again, and its cookie is cleared (and the token revoked, which
      // changes nothing when it was already disconnected).
      onError: (chatFailure) => {
        const { code } = parseChatError(chatFailure);
        if (!SIGN_IN_ERRORS.includes(code)) return;
        setSignedIn(false);
        if (code === "session_ended") {
          void fetch(SIGN_OUT_PATH, { method: "POST" }).catch(() => undefined);
        }
      },
    });

  const busy = status === "submitted" || status === "streaming";
  const noModels = catalogUnavailable || models.length === 0;
  const ready = !noModels && modelId !== null;
  const needsSignIn = signInMode && !signedIn;
  const modelsById = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
  const shownError = localError ?? (error ? parseChatError(error) : null);
  const notice = needsSignIn && signInOutcome ? signInNotice(signInOutcome) : null;

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

  // A message and a model chosen before signing in are back in place afterwards.
  const restoreDraft = useEffectEvent(() => {
    const draft = takeDraft();
    if (!draft) return;
    if (draft.model && draft.model !== modelId && modelsById.has(draft.model)) changeModel(draft.model);
    if (draft.text) setInput((current) => current || draft.text);
  });

  useEffect(() => {
    // A sign-in outcome shows once: a reload or a shared link does not repeat it.
    const url = new URL(window.location.href);
    if (url.searchParams.has(SIGN_IN_PARAM)) {
      url.searchParams.delete(SIGN_IN_PARAM);
      window.history.replaceState(null, "", url);
    }
    const frame = window.requestAnimationFrame(() => restoreDraft());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function requestOptions() {
    return { body: { model: modelId } };
  }

  /** Sends a message after the limits check. Returns false when it was not sent. */
  function dispatch(text: string): boolean {
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
    void sendMessage({ text }, requestOptions());
    return true;
  }

  /** Keeps a message and the chosen model in this tab for when the visitor comes back from signing in. */
  function rememberDraft(text: string) {
    saveDraft({ text, model: modelId });
  }

  function submit(text: string, fromInput: boolean) {
    const trimmed = text.trim();
    if (!trimmed || busy || !ready) return;
    // Signed out: the message waits in this tab while the visitor signs in.
    if (needsSignIn) {
      rememberDraft(trimmed);
      window.location.assign(signInHref);
      return;
    }
    if (dispatch(trimmed) && fromInput) setInput("");
  }

  function retry() {
    setLocalError(null);
    followReply.current = true;
    void regenerate(requestOptions());
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if (busy) await stop();
      const response = await fetch(SIGN_OUT_PATH, { method: "POST" });
      if (!response.ok) throw new Error(`Sign-out answered ${response.status}.`);
      setSignedIn(false);
      setMessages([]);
      setClearedMessages(null);
      clearError();
      setLocalError(null);
      announce("Signed out.");
      textareaRef.current?.focus();
    } catch {
      setLocalError(chatError("sign_out_failed"));
    } finally {
      setSigningOut(false);
    }
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
  // After a sign-in ends mid-chat, the last message returns as the draft.
  const lastUserMessage = messages.findLast((message) => message.role === "user");
  const draftAfterSignIn = input.trim() ? input : lastUserMessage ? messageText(lastUserMessage) : "";

  return (
    <>
      <a className="skip-link" href="#composer-input">
        Skip to the message box
      </a>
      <SiteHeader>
        {signInMode && signedIn ? (
          <button
            type="button"
            className="header-button"
            onClick={() => void signOut()}
            aria-disabled={signingOut || undefined}
          >
            <SignOutIcon />
            <span>Sign Out</span>
          </button>
        ) : null}
        {needsSignIn ? (
          <SignInLink className="header-button" href={signInHref} onClick={() => rememberDraft(input)} />
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
                <p className="empty-state__subtitle">
                  {toolsEnabled
                    ? "Chat with any EmpirioLabs AI model, and create images, video and speech, search the web and more with EmpirioLabs AI tools."
                    : "Chat with text models from the EmpirioLabs AI catalog."}
                </p>
              </div>
              {noModels ? (
                <Notice title="Models could not be loaded.">
                  Check the connection, then{" "}
                  <button type="button" className="link-button" onClick={() => router.refresh()}>
                    try again
                  </button>
                  .
                </Notice>
              ) : needsSignIn ? (
                <div className="sign-in-prompt">
                  {notice ? <Notice title={notice.title}>{notice.text}</Notice> : null}
                  <p className="sign-in-prompt__text">Sign in with your EmpirioLabs AI account to start.</p>
                  <SignInLink
                    className="button brand-button"
                    href={signInHref}
                    onClick={() => rememberDraft(input)}
                    markSize={18}
                  />
                </div>
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
                {(toolsEnabled ? TOOL_SUGGESTIONS : CHAT_SUGGESTIONS).map((suggestion) => (
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
                  <button type="button" className="button button--small" onClick={retry}>
                    <RetryIcon width={14} height={14} />
                    Try Again
                  </button>
                ) : null}
                {SIGN_IN_ERRORS.includes(shownError.code) && signInMode ? (
                  <SignInLink
                    className="button button--small"
                    href={signInHref}
                    onClick={() => rememberDraft(draftAfterSignIn)}
                    markSize={14}
                  />
                ) : null}
                {shownError.code === "account_credits" ? (
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
            toolsEnabled={toolsEnabled}
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
    </>
  );
}
