/**
 * What the visitor typed, and the model they chose, kept in this browser tab
 * (sessionStorage) while they sign in, so both are back when they return. The
 * page removes it as soon as it reads it.
 */
const STORAGE_KEY = "empiriolabs-agent:draft";

export type Draft = { text: string; model: string | null };

export function saveDraft(draft: Draft): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage is unavailable, as in some private windows: the draft is not kept.
  }
}

export function takeDraft(): Draft | null {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    if (!stored) return null;
    const { text, model } = JSON.parse(stored) as { text?: unknown; model?: unknown };
    return { text: typeof text === "string" ? text : "", model: typeof model === "string" ? model : null };
  } catch {
    return null;
  }
}
