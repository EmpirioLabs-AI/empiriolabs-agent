import Image from "next/image";
import type { ReactNode } from "react";
import logo from "@/assets/empiriolabs-ai-logo.webp";

/** The brand bar. It stays dark in both color schemes so the official logo reads on it. */
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="site-header">
      <Image
        className="site-header__logo"
        src={logo}
        alt="EmpirioLabs AI"
        width={115}
        height={24}
        loading="eager"
        unoptimized
      />
      <h1 className="visually-hidden">EmpirioLabs AI Chatbot</h1>
      {children ? <div className="site-header__actions">{children}</div> : null}
    </header>
  );
}
