import type { ReactNode } from "react";

/** A quiet notice for something the visitor or the app's owner has to do first. */
export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="notice" role="status">
      <span className="notice__dot" aria-hidden="true" />
      <p className="notice__text">
        <strong>{title}</strong> {children}
      </p>
    </div>
  );
}
