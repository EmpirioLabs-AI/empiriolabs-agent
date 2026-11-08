import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EmpirioLabs AI Agent",
  description:
    "An AI agent built with Next.js and the AI SDK: chat with any EmpirioLabs AI model and use every EmpirioLabs AI tool.",
  applicationName: "EmpirioLabs AI Agent",
};

export const viewport: Viewport = {
  themeColor: "#000815",
  colorScheme: "light dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
