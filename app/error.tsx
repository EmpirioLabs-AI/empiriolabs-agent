"use client";

import { SiteHeader } from "@/components/site-header";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <>
      <SiteHeader />
      <main className="status-page">
        <h2 className="status-page__title">Something went wrong</h2>
        <p className="status-page__text">The page could not load. Try again in a moment.</p>
        <button type="button" className="button button--primary" onClick={() => retry()}>
          Try Again
        </button>
      </main>
    </>
  );
}
