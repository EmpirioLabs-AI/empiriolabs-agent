"use client";

import type { DynamicToolUIPart } from "ai";
import Image from "next/image";
import { readToolOutput, type ToolMedia } from "@/lib/tool-output";
import { ChevronRightIcon } from "./icons";

/** Longest tool result the page prints in full. */
const RESULT_PREVIEW_CHARS = 6000;

type ToolStatus = "running" | "stopped" | "failed" | "done";

const STATUS_LABELS: Record<ToolStatus, string> = {
  running: "Running",
  stopped: "Stopped",
  failed: "Failed",
  done: "Used",
};

export function isToolRunning(part: DynamicToolUIPart): boolean {
  return part.state === "input-streaming" || part.state === "input-available";
}

function formatInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "object" && Object.keys(input).length === 0) return "";
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return "";
  }
}

/** The prompt a generation tool was given, as a description of what it made. */
function promptOf(input: unknown): string | undefined {
  const prompt = (input as { prompt?: unknown } | null | undefined)?.prompt;
  return typeof prompt === "string" && prompt.trim() ? prompt.trim().slice(0, 300) : undefined;
}

type ToolCallProps = {
  part: DynamicToolUIPart;
  /** Files to show under this call. A file shown by an earlier call in the reply is left out. */
  media: ToolMedia[];
  streaming: boolean;
};

/** One tool call: a line that opens to its input and result, and the files it made. */
export function ToolCall({ part, media, streaming }: ToolCallProps) {
  const title = part.title?.trim() || part.toolName;
  const output = part.state === "output-available" ? readToolOutput(part.output) : null;
  const status: ToolStatus = isToolRunning(part)
    ? streaming
      ? "running"
      : "stopped"
    : part.state === "output-error" || part.state === "output-denied" || output?.isError
      ? "failed"
      : "done";
  const input = formatInput(part.input);
  const result = output?.text ?? "";

  return (
    <div className="tool-call">
      <details className="tool-call__details">
        <summary className={`tool-call__summary tool-call__summary--${status}`}>
          <ChevronRightIcon className="tool-call__chevron" width={14} height={14} />
          <span className="tool-call__label">{STATUS_LABELS[status]}</span>
          <span className="tool-call__title">{title}</span>
          {status === "running" ? <span className="tool-call__spinner" aria-hidden="true" /> : null}
        </summary>
        <div className="tool-call__body">
          {input ? (
            <>
              <p className="tool-call__heading">Input</p>
              <pre className="tool-call__code" tabIndex={0}>
                {input}
              </pre>
            </>
          ) : null}
          {result ? (
            <>
              <p className="tool-call__heading">Result</p>
              <pre className="tool-call__code" tabIndex={0}>
                {result.length > RESULT_PREVIEW_CHARS ? `${result.slice(0, RESULT_PREVIEW_CHARS)}\n…` : result}
              </pre>
            </>
          ) : null}
          {part.state === "output-error" ? <p className="tool-call__note">The tool did not finish.</p> : null}
          {status === "stopped" ? <p className="tool-call__note">The reply ended before the tool answered.</p> : null}
        </div>
      </details>
      {media.length > 0 ? <ToolMediaList media={media} description={promptOf(part.input) ?? title} /> : null}
    </div>
  );
}

function fileName(url: string): string {
  const name = new URL(url).pathname.split("/").at(-1);
  try {
    return name ? decodeURIComponent(name) : "file";
  } catch {
    return name || "file";
  }
}

function ToolMediaList({ media, description }: { media: ToolMedia[]; description: string }) {
  return (
    <ul className="tool-media">
      {media.map((item, index) => {
        const label = media.length > 1 ? `${description} (${index + 1} of ${media.length})` : description;
        return (
          <li key={item.url} className={`tool-media__item tool-media__item--${item.kind}`}>
            {item.kind === "image" ? (
              <a className="tool-media__link" href={item.url} target="_blank" rel="noopener noreferrer">
                <Image
                  className="tool-media__image"
                  src={item.url}
                  alt={label}
                  width={1024}
                  height={1024}
                  unoptimized
                />
              </a>
            ) : item.kind === "video" ? (
              <video className="tool-media__video" src={item.url} controls playsInline preload="metadata" aria-label={label} />
            ) : item.kind === "audio" ? (
              <audio className="tool-media__audio" src={item.url} controls preload="metadata" aria-label={label} />
            ) : (
              <a className="tool-media__file" href={item.url} target="_blank" rel="noopener noreferrer">
                {fileName(item.url)}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
