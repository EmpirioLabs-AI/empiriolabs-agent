import { SiteHeader } from "./site-header";

/** Shown while the model list loads. It mirrors the chat layout so nothing shifts. */
export function ChatSkeleton() {
  return (
    <>
      <SiteHeader />
      <main className="chat" aria-busy="true">
        <section className="conversation" aria-label="Conversation">
          <div className="empty-state">
            <div className="skeleton skeleton--mark" />
            <div className="empty-state__heading">
              <div className="skeleton skeleton--title" />
              <div className="skeleton skeleton--subtitle" />
            </div>
            <p className="visually-hidden" role="status">
              Loading models…
            </p>
          </div>
        </section>
        <div className="composer-dock">
          <div className="composer composer--skeleton" aria-hidden="true">
            <div className="skeleton skeleton--line" />
            <div className="composer__toolbar">
              <div className="skeleton skeleton--select" />
              <div className="skeleton skeleton--button" />
            </div>
          </div>
          <p className="composer-dock__note" aria-hidden="true">
            Models can make mistakes. Check important information.
          </p>
        </div>
      </main>
    </>
  );
}
