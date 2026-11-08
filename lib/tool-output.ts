import type { UIMessage } from "ai";

/**
 * The result of an EmpirioLabs AI tool call, as the model and the page receive
 * it. The server builds it in lib/mcp.ts; the page shows it in
 * components/tool-call.tsx.
 */

/** Generated files are served from this origin. The page shows media from it and from nowhere else. */
export const MEDIA_ORIGIN = "https://media.empiriolabs.ai";

export type MediaKind = "image" | "video" | "audio" | "file";

export type ToolMedia = {
  url: string;
  kind: MediaKind;
};

export type AgentToolOutput = {
  /** True when the tool reported an error. `text` then holds its message. */
  isError: boolean;
  /** The tool's text result. This is what the model reads. */
  text: string;
  /** Files the tool made, on the EmpirioLabs AI media host. */
  media: ToolMedia[];
  /** A job that was still running when the tool answered. `get_job` reads its result. */
  jobId?: string;
};

/** Most files one tool result shows. */
export const MAX_MEDIA_PER_RESULT = 8;

/** Most file addresses an earlier reply passes on to the next request. */
const MAX_NOTED_FILES = 16;

const MEDIA_KINDS = new Set<MediaKind>(["image", "video", "audio", "file"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "oga", "flac", "m4a", "aac", "opus"]);

/** Parses a generated file's address. Anything that is not an https URL on the media host gives null. */
export function parseMediaUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.origin !== MEDIA_ORIGIN || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** The kind of file a URL points to, from its media type when known, otherwise its extension. */
export function mediaKind(url: URL, mimeType?: string): MediaKind {
  const type = mimeType?.split("/")[0];
  if (type === "image" || type === "video" || type === "audio") return type;
  const extension = url.pathname.split(".").at(-1)?.toLowerCase() ?? "";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  return "file";
}

/** A job id as the API writes it. */
export function isJobId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && /^[\w-]+$/.test(value);
}

/**
 * Reads a tool output that arrived over the network. Media outside the media
 * host is dropped here as well as on the server.
 */
export function readToolOutput(value: unknown): AgentToolOutput | null {
  if (!value || typeof value !== "object") return null;
  const { isError, text, media, jobId } = value as Partial<Record<keyof AgentToolOutput, unknown>>;
  if (typeof isError !== "boolean" || typeof text !== "string") return null;

  const files: ToolMedia[] = [];
  for (const item of Array.isArray(media) ? media : []) {
    const { url: rawUrl, kind } = (item ?? {}) as { url?: unknown; kind?: unknown };
    const url = parseMediaUrl(rawUrl);
    if (!url || files.some((file) => file.url === url.href)) continue;
    files.push({
      url: url.href,
      kind: MEDIA_KINDS.has(kind as MediaKind) ? (kind as MediaKind) : mediaKind(url),
    });
    if (files.length === MAX_MEDIA_PER_RESULT) break;
  }
  return { isError, text, media: files, ...(isJobId(jobId) ? { jobId } : {}) };
}

/**
 * A short note naming the files and the unfinished jobs of an earlier reply.
 * The page sends it with that reply's text, so the model can use them in a
 * later message ("animate that image", "is the video ready?"). Tool results
 * themselves are not sent again.
 */
export function toolResultsNote(message: UIMessage): string | null {
  const files: string[] = [];
  const running: string[] = [];

  for (const part of message.parts) {
    if (part.type !== "dynamic-tool" || part.state !== "output-available") continue;
    const output = readToolOutput(part.output);
    if (!output) continue;

    // A job this call looked up is settled once the call returns its files or no job.
    const lookedUp = (part.input as { job_id?: unknown } | null | undefined)?.job_id;
    if (isJobId(lookedUp) && (output.media.length > 0 || !output.jobId)) {
      const index = running.indexOf(lookedUp);
      if (index !== -1) running.splice(index, 1);
    }
    if (output.jobId && !output.isError && !running.includes(output.jobId)) running.push(output.jobId);
    for (const item of output.media) {
      if (files.length < MAX_NOTED_FILES && !files.includes(item.url)) files.push(item.url);
    }
  }

  const sentences: string[] = [];
  if (files.length > 0) sentences.push(`Files from this reply: ${files.join(" ")}`);
  if (running.length > 0) sentences.push(`Jobs still running when this reply ended: ${running.join(", ")}`);
  return sentences.length > 0 ? `(${sentences.join(". ")}.)` : null;
}
