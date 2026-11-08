"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { API_KEY_PATH, API_KEYS_URL, apiKeyFailureMessage, isApiKeyShape } from "@/lib/sign-in";

type ApiKeyOptionProps = {
  /** Runs once the app accepted the key and keeps it for this browser. */
  onSignedIn: () => void;
  /** A request the key waits for before it is sent, such as clearing an ended sign-in. */
  beforeSubmit?: () => Promise<unknown> | null;
  className?: string;
};

/**
 * The second way in, under Sign In: a visitor continues with an API key of
 * their own. A quiet button opens a form in place, with no dialog. The server
 * checks the key and keeps it in an HttpOnly cookie, so the page holds it only
 * while it is typed.
 */
export function ApiKeyOption({ onSignedIn, beforeSubmit, className }: ApiKeyOptionProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const inputId = useId();
  const errorId = useId();

  // Opening moves focus to the field; closing returns it to the button that opened it.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      toggleRef.current?.focus();
    }
  }, [open]);

  function close() {
    returnFocus.current = true;
    setError(null);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape" && !checking) {
      event.preventDefault();
      close();
    }
  }

  function refuse(message: string) {
    setError(message);
    inputRef.current?.focus();
    inputRef.current?.select();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checking) return;
    const key = inputRef.current?.value.trim() ?? "";
    if (!isApiKeyShape(key)) {
      refuse(apiKeyFailureMessage("malformed_api_key"));
      return;
    }

    setChecking(true);
    setError(null);
    try {
      await beforeSubmit?.();
      const response = await fetch(API_KEY_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (response.status === 204) {
        if (inputRef.current) inputRef.current.value = "";
        setOpen(false);
        onSignedIn();
        return;
      }
      const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
      refuse(apiKeyFailureMessage(body?.code));
    } catch {
      refuse(apiKeyFailureMessage("unavailable"));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className={className ? `api-key-option ${className}` : "api-key-option"}>
      {open ? (
        <form
          className="key-form"
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          aria-busy={checking || undefined}
          noValidate
        >
          <label className="field-label" htmlFor={inputId}>
            EmpirioLabs AI API key
          </label>
          <input
            ref={inputRef}
            id={inputId}
            name="key"
            className="text-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="sk-empiriolabs-…"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={() => setError(null)}
          />
          {error ? (
            <p id={errorId} className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="key-form__actions">
            <button
              type="button"
              className="button"
              onClick={() => {
                if (!checking) close();
              }}
              aria-disabled={checking || undefined}
            >
              Cancel
            </button>
            <button type="submit" className="button button--primary" aria-disabled={checking || undefined}>
              <span className="steady-label">
                <span aria-hidden={checking}>Continue</span>
                <span aria-hidden={!checking}>Checking…</span>
              </span>
            </button>
          </div>
          <p className="key-form__hint">
            No key yet?{" "}
            <a href={API_KEYS_URL} target="_blank" rel="noopener noreferrer">
              Create a key
            </a>{" "}
            in the EmpirioLabs AI dashboard.
          </p>
        </form>
      ) : (
        <button
          ref={toggleRef}
          type="button"
          className="link-button link-button--quiet"
          onClick={() => setOpen(true)}
        >
          Use an API key
        </button>
      )}
    </div>
  );
}
