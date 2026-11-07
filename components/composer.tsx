"use client";

import { useLayoutEffect, type KeyboardEvent, type Ref, type RefObject } from "react";
import { LIMITS } from "@/lib/limits";
import type { ChatModel } from "@/lib/types";
import { ArrowUpIcon, StopIcon } from "./icons";
import { ModelSelect } from "./model-select";

type ComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  disabled: boolean;
  models: ChatModel[];
  modelId: string | null;
  onModelChange: (modelId: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  selectRef: Ref<HTMLSelectElement>;
};

const MAX_TEXTAREA_HEIGHT = 200;
const COUNTER_FROM = Math.floor(LIMITS.maxMessageChars * 0.9);

export function Composer({
  value,
  onValueChange,
  onSubmit,
  onStop,
  busy,
  disabled,
  models,
  modelId,
  onModelChange,
  textareaRef,
  selectRef,
}: ComposerProps) {
  const modelName = models.find((model) => model.id === modelId)?.name;
  const canSend = !disabled && !busy && value.trim().length > 0;

  // Browsers without `field-sizing: content` grow the field here instead.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || CSS.supports("field-sizing", "content")) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value, textareaRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape" && busy) {
      event.preventDefault();
      onStop();
      return;
    }
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    // Enter sends with a keyboard and mouse; on touch screens Enter adds a line
    // and the send button sends. Cmd or Ctrl with Enter always sends.
    const sends =
      event.metaKey ||
      event.ctrlKey ||
      (!event.shiftKey && !event.altKey && window.matchMedia("(pointer: fine)").matches);
    if (sends) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit();
        else textareaRef.current?.focus();
      }}
    >
      <label className="visually-hidden" htmlFor="composer-input">
        Message
      </label>
      <textarea
        ref={textareaRef}
        id="composer-input"
        name="message"
        className="composer__input"
        rows={1}
        value={value}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={modelName ? `Message ${modelName}…` : "Send a message…"}
        disabled={disabled}
        autoComplete="off"
        aria-describedby="composer-hint"
      />
      <div className="composer__toolbar">
        <ModelSelect
          ref={selectRef}
          models={models}
          value={modelId}
          onChange={onModelChange}
          disabled={disabled}
        />
        <div className="composer__end">
          {value.length >= COUNTER_FROM ? (
            <span
              className={
                value.length > LIMITS.maxMessageChars
                  ? "composer__count composer__count--over"
                  : "composer__count"
              }
            >
              {value.length.toLocaleString("en-US")} / {LIMITS.maxMessageChars.toLocaleString("en-US")}
            </span>
          ) : null}
          {busy ? (
            <button type="button" className="send-button" onClick={onStop} aria-label="Stop the reply">
              <StopIcon />
            </button>
          ) : (
            <button
              type="submit"
              className="send-button"
              aria-label="Send message"
              aria-disabled={canSend ? undefined : true}
            >
              <ArrowUpIcon />
            </button>
          )}
        </div>
      </div>
      <p id="composer-hint" className="visually-hidden">
        Use the Send message button to send. With a keyboard, Enter sends and Shift plus Enter adds a
        new line.
      </p>
    </form>
  );
}
