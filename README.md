# EmpirioLabs AI Agent

An AI agent for [EmpirioLabs AI](https://empiriolabs.ai), built with Next.js and the AI SDK. Chat with any model in the live EmpirioLabs AI catalog, and let the agent use every EmpirioLabs AI tool: generate images, video, 3D assets, speech and music, transcribe audio, read documents, search the web, compare models, run agent tasks and more. The tools come from the live tool list of the EmpirioLabs AI MCP server, so new tools appear without a code change.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FEmpirioLabs-AI%2Fempiriolabs-agent&project-name=empiriolabs-agent&repository-name=empiriolabs-agent&demo-title=EmpirioLabs%20AI%20Agent&demo-description=An%20AI%20agent%20that%20chats%20with%20EmpirioLabs%20AI%20models%20and%20uses%20every%20EmpirioLabs%20AI%20tool%20through%20MCP.&demo-url=https%3A%2F%2Fempiriolabs-agent.vercel.app&demo-image=https%3A%2F%2Fraw.githubusercontent.com%2FEmpirioLabs-AI%2Fempiriolabs-agent%2Fmain%2F.github%2Fscreenshots%2Fdesktop.png&integration-ids=oac_G0yRAQMkKnlHKtLYN9aNXLSD&skippable-integrations=1)
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/WjXESq?referralCode=FR-gwI&utm_medium=integration&utm_source=template&utm_campaign=generic)

**[Live demo](https://empiriolabs-agent.vercel.app)**: try it with your own EmpirioLabs AI API key.

<p>
  <img src=".github/screenshots/desktop.png" alt="EmpirioLabs AI Agent on a desktop screen: GLM 5.3 Flash used the Generate an image tool and shows a watercolor painting of a lighthouse at sunrise" width="70%">
  <img src=".github/screenshots/mobile.png" alt="The same conversation on a phone in the dark theme, with the request, the tool call and the image" width="25%">
</p>

## Features

- **Every EmpirioLabs AI tool.** A reply can use the tools of the EmpirioLabs AI MCP server: image, video and 3D generation, image editing and analysis, speech, music and sound, transcription, document reading (OCR), web search, research and grounded answers, embeddings and reranking, the model catalog, jobs and agent tasks. The app reads the server's tool list for every request, so a tool added to the server is available right away.
- **Media in the chat.** Images, video and audio that a tool creates appear in the reply. Each tool call shows as a line, such as **Used** Generate an image, that opens to its input and result.
- **Live model list.** The model picker reads the EmpirioLabs AI catalog when the page loads and lists its text models by author, so new models appear without a code change. Models that do not call tools are marked "chat only" and answer as a plain chat.
- **Streaming replies.** Replies stream in as Markdown with lists, tables and code blocks. When a model returns its reasoning, it appears in a section you can expand.
- **Your key stays on the server.** `EMPIRIOLABS_API_KEY` is read only on the server and is never sent to the browser.
- **Demo mode.** For a public deployment, each visitor can use their own API key instead of yours.
- **Ready for every screen.** Light and dark themes follow the system setting, the layout works from phones to wide screens, and every control has an accessible label and works from the keyboard.
- **No analytics or tracking.**

## Deploy

### Vercel

Select **Deploy with Vercel**. During setup, connect [EmpirioLabs AI on Vercel](https://vercel.com/integrations/empiriolabs) to create an API key for the new project as `EMPIRIOLABS_API_KEY`. To use a key you already have, skip that step, add `EMPIRIOLABS_API_KEY` under **Settings > Environment Variables**, and redeploy.

### Railway

Select **Deploy on Railway** and enter your API key as `EMPIRIOLABS_API_KEY`. Railway builds the app and gives it a public domain.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `EMPIRIOLABS_API_KEY` | Yes, unless `DEMO_MODE` is on | Your API key from the [API keys page](https://platform.empiriolabs.ai/dashboard/api-keys). Read only on the server. The chat and the tools both use it. |
| `EMPIRIOLABS_MODEL` | No | The model ID or alias the chat starts with, such as `glm-5-3-flash`. Without it, the chat starts with the catalog's first featured chat model. |
| `EMPIRIOLABS_TOOLS` | No | `false` turns the EmpirioLabs AI tools off, so the app is a plain chat. Tools are on by default. |
| `DEMO_MODE` | No | `true` asks each visitor for their own API key, and `EMPIRIOLABS_API_KEY` is not used. |

Visitors can also open the chat with a model chosen in the address, for example `/?model=glm-5-3-flash`.

## Run locally

You need Node.js 24 and an EmpirioLabs AI API key.

```bash
git clone https://github.com/EmpirioLabs-AI/empiriolabs-agent.git
cd empiriolabs-agent
npm ci
cp .env.example .env.local
```

Set `EMPIRIOLABS_API_KEY` in `.env.local`, then start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To run the production build, use `npm run build` and then `npm run start`.

## Tools

The agent connects to the [EmpirioLabs AI MCP server](https://docs.empiriolabs.ai/mcp) at `https://mcp.empiriolabs.ai/mcp/models+text+search+media+jobs+agents`, with the same API key as the chat. That address serves the toolsets for the model catalog, text models, search, media, jobs and agent tasks, and each tool keeps its normal time limit. GPU Cloud, Hosted Agents and batches are left out; manage them from the [dashboard](https://platform.empiriolabs.ai/dashboard).

- **What the agent can use.** Every tool in that live tool list, except the tools the server marks as destructive, such as deleting a voice or cancelling a job. With the deployment's own key, which every visitor shares, the agent also leaves out the tools that read the account's records (its usage history and its job list). In demo mode, each visitor's own key gets them. To change which tools the agent gets, edit `isAllowed` in [`lib/mcp.ts`](lib/mcp.ts).
- **Longer work.** A tool that needs more time returns a job, and the agent reads its result with the **Get a job** tool. If a job is still running when a reply ends, the reply gives its job ID; ask the agent to check it later.
- **Credits.** Tool calls use credits from the account behind the API key, at the prices in the [model catalog](https://empiriolabs.ai/models). The tool definitions also add input tokens to each model call in a reply.
- **Files.** Generated files use signed links that expire. The page shows images, video and audio only from `https://media.empiriolabs.ai`.

## Public deployments

Anyone who can open your deployment can use its API key: they can chat and use every tool the agent offers, including paid image and video generation. Before you share the address, choose one of these:

- **Demo mode.** Set `DEMO_MODE=true`. Each visitor enters their own EmpirioLabs AI API key. The key stays in that browser tab (`sessionStorage`) and is sent with each chat request to this app, which uses it for that request only and never stores or logs it.
- **Your own sign-in.** Put the app behind your authentication.
- **A spending limit.** Give the deployment its own API key and set a spending limit on it on the [API keys page](https://platform.empiriolabs.ai/dashboard/api-keys).
- **No tools.** Set `EMPIRIOLABS_TOOLS=false` to offer chat only.

Every deployment also applies these limits, which you can change in [`lib/limits.ts`](lib/limits.ts):

- Chat requests sent from other websites are refused.
- Each IP address can send 20 chat requests a minute, counted on each server instance.
- A message can be up to 32,000 characters, a conversation up to 100 messages or 200,000 characters, and a request body up to 1 MB.
- A reply can make up to 10 model calls, with tool calls between them, and can run for up to 5 minutes. Each model call can write up to 16,384 tokens, or the model's own maximum when that is lower.
- Only models in the catalog list can be used, and a failed reply is sent again only when the visitor selects **Try Again**.

## How it works

| File | Role |
| --- | --- |
| `app/api/chat/route.ts` | Checks each request, loads the tools, and streams the reply with `streamText`, which can call tools for up to 10 steps. Closes the MCP connection when the reply ends. |
| `lib/mcp.ts` | Connects to the EmpirioLabs AI MCP server with the API key that serves the request, reads its live tool list, and turns each tool result into text for the model and files for the page. |
| `lib/instructions.ts` | The agent's instructions, followed by the MCP server's own notes on its tools. |
| `lib/catalog.ts` | Reads `GET https://api.empiriolabs.ai/v1/models`, keeps the text models that answer on `/v1/chat/completions`, notes which of them call tools, and reuses the list for five minutes. |
| `lib/tool-output.ts` | The shape of a tool result, and the check that shows media only from `https://media.empiriolabs.ai`. |
| `components/tool-call.tsx` | Shows each tool call, and the images, video and audio it made. |
| `components/chat.tsx` | The chat interface, built on `useChat` from `@ai-sdk/react`. |
| `components/chat-loader.tsx` | Loads the model list and the settings on the server for each request. |
| `lib/empiriolabs.ts` | Creates the EmpirioLabs AI provider and turns API errors into messages for the page. |

The model runs through the AI SDK's OpenAI-compatible provider with the EmpirioLabs AI base URL, and the tools come from the AI SDK's MCP client:

```ts
import { createMCPClient } from "@ai-sdk/mcp";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { isStepCount, streamText } from "ai";

const apiKey = process.env.EMPIRIOLABS_API_KEY;

const empiriolabs = createOpenAICompatible({
  name: "empiriolabs",
  baseURL: "https://api.empiriolabs.ai/v1",
  apiKey,
});

const mcp = await createMCPClient({
  transport: {
    type: "http",
    url: "https://mcp.empiriolabs.ai/mcp/models+text+search+media+jobs+agents",
    headers: { Authorization: `Bearer ${apiKey}` },
  },
});

const result = streamText({
  model: empiriolabs.chatModel("glm-5-3-flash"),
  tools: await mcp.tools(),
  stopWhen: isStepCount(10),
  prompt: "Generate a watercolor image of a lighthouse at sunrise.",
  onEnd: () => mcp.close(),
});
```

More in the [AI SDK guide](https://docs.empiriolabs.ai/integrations#vercel-ai-sdk), the [MCP server guide](https://docs.empiriolabs.ai/mcp), the [model catalog](https://empiriolabs.ai/models) and the [documentation](https://docs.empiriolabs.ai).

## About EmpirioLabs AI

[EmpirioLabs AI](https://empiriolabs.ai) is specialized AI model hosting for open, proprietary, and custom stacks, plus GPU Cloud and hosted AI agents. Questions about this template: [support@empiriolabs.ai](mailto:support@empiriolabs.ai).

## License

[MIT](LICENSE)
