import "server-only";
import { createMCPClient, MCPClientError, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import {
  isJobId,
  MAX_MEDIA_PER_RESULT,
  mediaKind,
  parseMediaUrl,
  type AgentToolOutput,
  type ToolMedia,
} from "./tool-output";

/**
 * The EmpirioLabs AI MCP server's `workflows` profile: every EmpirioLabs AI
 * tool except GPU Cloud and Hosted Agents, each with its normal time limit.
 * The tool list is read from the server on every chat request, so tools the
 * server adds appear here without a code change.
 */
export const MCP_URL = "https://mcp.empiriolabs.ai/mcp/workflows";

/** Time allowed to connect and to read the tool list. */
const CONNECT_TIMEOUT_MS = 15_000;
const MAX_TOOL_PAGES = 20;

/** Jobs in these states are still running. */
const RUNNING_JOB_STATES = new Set(["queued", "pending", "processing", "running", "in_progress"]);

export type AgentTools = {
  tools: ToolSet;
  /** The server's own instructions for using its tools. */
  instructions: string | undefined;
  /** Closes the connection. Safe to call more than once. */
  close: () => void;
};

type ToolDefinition = Awaited<ReturnType<MCPClient["listTools"]>>["tools"][number];

/**
 * The one rule for leaving a tool out: the server marks it destructive, as it
 * does for deleting, cancelling and stopping. The agent calls tools without
 * asking first, and the web pages and documents it reads can contain
 * instructions, so it never makes a change that cannot be undone.
 */
function isAllowed(definition: ToolDefinition): boolean {
  return definition.annotations?.destructiveHint !== true;
}

/**
 * Connects to the EmpirioLabs AI MCP server with the API key that serves this
 * chat request, and returns its tools for `streamText`. Close the connection
 * when the reply ends.
 */
export async function loadAgentTools(apiKey: string, signal: AbortSignal): Promise<AgentTools> {
  const client = await createMCPClient({
    transport: {
      type: "http",
      url: MCP_URL,
      headers: { Authorization: `Bearer ${apiKey}` },
      redirect: "error",
    },
    clientName: "empiriolabs-ai-agent",
    version: "1.0.0",
    // The server speaks MCP 2025-11-25, so the client starts with initialize.
    protocolVersionDiscovery: false,
    initializationOptions: { signal, timeout: CONNECT_TIMEOUT_MS },
  });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    client.close().catch(() => undefined);
  };

  try {
    const definitions: ToolDefinition[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_TOOL_PAGES; page++) {
      const result = await client.listTools({
        params: cursor ? { cursor } : undefined,
        options: { signal, timeout: CONNECT_TIMEOUT_MS },
      });
      definitions.push(...result.tools);
      cursor = result.nextCursor;
      if (!cursor) break;
    }

    const tools: ToolSet = {};
    const mcpTools = client.toolsFromDefinitions({ tools: definitions.filter(isAllowed) });
    for (const [name, tool] of Object.entries(mcpTools)) {
      tools[name] = {
        ...tool,
        execute: async (input, options) => {
          try {
            return toAgentToolOutput(await tool.execute(input, options));
          } catch (error) {
            if (options.abortSignal?.aborted) throw error;
            logToolFailure(name, error);
            return { isError: true, text: describeToolFailure(error), media: [] } satisfies AgentToolOutput;
          }
        },
        toModelOutput: ({ output }: { output: unknown }) => {
          const { isError, text } = output as AgentToolOutput;
          return isError
            ? { type: "error-text" as const, value: text || "The tool call failed." }
            : { type: "text" as const, value: text || "The tool finished and returned no text." };
        },
      };
    }
    return { tools, instructions: client.instructions, close };
  } catch (error) {
    close();
    throw error;
  }
}

/**
 * Turns an MCP tool result into what the model and the page receive: the
 * result's text, the generated files on the media host, and the id of a job
 * that is still running.
 */
function toAgentToolOutput(result: unknown): AgentToolOutput {
  const { content, structuredContent, isError } = (result ?? {}) as {
    content?: unknown;
    structuredContent?: unknown;
    isError?: unknown;
  };

  const texts: string[] = [];
  const media: ToolMedia[] = [];
  for (const block of Array.isArray(content) ? content : []) {
    if (!block || typeof block !== "object") continue;
    const { type, text, uri, mimeType } = block as Record<string, unknown>;
    if (type === "text" && typeof text === "string") {
      texts.push(text);
    } else if (type === "resource_link") {
      // The server links each generated file once, as a resource link.
      const url = parseMediaUrl(uri);
      if (url && media.length < MAX_MEDIA_PER_RESULT && !media.some((item) => item.url === url.href)) {
        media.push({ url: url.href, kind: mediaKind(url, typeof mimeType === "string" ? mimeType : undefined) });
      }
    } else if (type === "image" || type === "audio") {
      texts.push(`(The tool returned the ${type} inline, and this app shows only files that have a URL.)`);
    }
  }

  const jobId = isError !== true && media.length === 0 ? runningJobId(structuredContent) : undefined;
  return {
    isError: isError === true,
    text: texts.join("\n\n"),
    media,
    ...(jobId ? { jobId } : {}),
  };
}

function runningJobId(structured: unknown): string | undefined {
  if (!structured || typeof structured !== "object") return undefined;
  const { job_id: jobId, status } = structured as { job_id?: unknown; status?: unknown };
  if (!isJobId(jobId)) return undefined;
  return status == null || RUNNING_JOB_STATES.has(String(status).toLowerCase()) ? jobId : undefined;
}

/** What the model reads when a tool call fails before the tool answers. */
function describeToolFailure(error: unknown): string {
  // A JSON-RPC error carries the server's own message, such as an invalid argument.
  if (MCPClientError.isInstance(error) && error.code != null && error.message) {
    return error.message.slice(0, 1000);
  }
  return "The tool did not answer. Try again in a moment.";
}

/** The error's class, HTTP status and JSON-RPC code. Never its message, which can echo a request. */
function mcpFailure(error: unknown): { error: string; status?: number; code?: number } {
  const name = error instanceof Error ? error.name : typeof error;
  return MCPClientError.isInstance(error)
    ? { error: name, status: error.statusCode, code: error.code }
    : { error: name };
}

/** One line per failed tool call: the tool and the failure's class, status and code. Never its input or output. */
function logToolFailure(tool: string, error: unknown): void {
  console.error("Tool call failed:", JSON.stringify({ tool, ...mcpFailure(error) }));
}

/** One line when the tools cannot be loaded. Keys and messages are never logged. */
export function logToolsUnavailable(error: unknown): void {
  console.error("Could not load the EmpirioLabs AI tools:", JSON.stringify(mcpFailure(error)));
}
