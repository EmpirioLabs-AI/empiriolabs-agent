/**
 * Demo mode: each visitor uses their own EmpirioLabs AI API key. The page keeps
 * it in sessionStorage (this browser tab only) and sends it in this header with
 * each chat request. The server passes it to the API for that request and never
 * stores or logs it.
 */
export const VISITOR_KEY_HEADER = "x-empiriolabs-api-key";

const STORAGE_KEY = "empiriolabs-chatbot:api-key";

// Used when sessionStorage is unavailable (some private windows): the key then
// lasts until the page is closed.
let memoryKey: string | null = null;
const listeners = new Set<() => void>();

export function readVisitorKey(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? memoryKey;
  } catch {
    return memoryKey;
  }
}

export function writeVisitorKey(key: string | null): void {
  memoryKey = key;
  try {
    if (key) window.sessionStorage.setItem(STORAGE_KEY, key);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Kept in memory only.
  }
  for (const listener of listeners) listener();
}

export function subscribeVisitorKey(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
