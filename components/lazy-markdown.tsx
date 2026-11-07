"use client";

import { lazy, Suspense } from "react";

// The Markdown renderer is the heaviest part of the page and is not needed until
// the first reply, so it loads separately: in idle time after the page starts,
// or on demand, whichever comes first.
const loadMarkdown = () => import("./markdown");

const Markdown = lazy(() => loadMarkdown().then((module) => ({ default: module.Markdown })));

export function preloadMarkdown(): void {
  void loadMarkdown();
}

export function LazyMarkdown({ text }: { text: string }) {
  return (
    <Suspense
      fallback={
        <div className="markdown">
          <p className="markdown__plain">{text}</p>
        </div>
      }
    >
      <Markdown text={text} />
    </Suspense>
  );
}
