import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="status-page">
        <p className="status-page__code">404</p>
        <h2 className="status-page__title">Page not found</h2>
        <p className="status-page__text">The address does not match a page in this app.</p>
        <Link className="button button--primary" href="/">
          Back to Chat
        </Link>
      </main>
    </>
  );
}
