import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EmpirioLabs AI Chatbot",
  description:
    "A streaming chatbot for the text models in the EmpirioLabs AI catalog, built with Next.js and the AI SDK.",
  applicationName: "EmpirioLabs AI Chatbot",
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
