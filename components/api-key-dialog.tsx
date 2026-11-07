"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CloseIcon } from "./icons";

type ApiKeyDialogProps = {
  open: boolean;
  hasKey: boolean;
  onSave: (key: string) => void;
  onRemove: () => void;
  onClose: () => void;
};

export const API_KEYS_URL = "https://platform.empiriolabs.ai/dashboard/api-keys";

/** Demo mode: the visitor's own API key, kept in this browser tab only. */
export function ApiKeyDialog({ open, hasKey, onSave, onRemove, onClose }: ApiKeyDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (inputRef.current) inputRef.current.value = "";
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function close() {
    setInvalid(false);
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = inputRef.current?.value.trim() ?? "";
    if (!key) {
      setInvalid(true);
      inputRef.current?.focus();
      return;
    }
    onSave(key);
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={close}
      onClick={(event) => {
        // The panel fills the dialog, so a click on the dialog itself is on the backdrop.
        if (event.target === event.currentTarget) close();
      }}
    >
      <form className="dialog__panel" onSubmit={handleSubmit} noValidate>
        <div className="dialog__header">
          <h2 id={titleId} className="dialog__title">
            Use Your API Key
          </h2>
          <button type="button" className="icon-button dialog__close" onClick={close} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <p id={descriptionId} className="dialog__text">
          This demo runs on your own EmpirioLabs AI API key. It stays in this browser tab and is used only to
          send your messages to EmpirioLabs AI.
        </p>
        <label className="field-label" htmlFor="api-key-input">
          API key
        </label>
        <input
          ref={inputRef}
          id="api-key-input"
          name="empiriolabs-api-key"
          className="text-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="sk-empiriolabs-…"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={() => setInvalid(false)}
        />
        {invalid ? (
          <p id={errorId} className="field-error" role="alert">
            Enter your API key.
          </p>
        ) : null}
        <p className="dialog__hint">
          No key yet?{" "}
          <a href={API_KEYS_URL} target="_blank" rel="noopener noreferrer">
            Create one in the EmpirioLabs AI dashboard
          </a>
          .
        </p>
        <div className="dialog__actions">
          {hasKey ? (
            <button type="button" className="button button--quiet dialog__remove" onClick={onRemove}>
              Remove Key
            </button>
          ) : null}
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="button button--primary">
            Save Key
          </button>
        </div>
      </form>
    </dialog>
  );
}
