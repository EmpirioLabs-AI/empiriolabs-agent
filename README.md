# EmpirioLabs AI Chatbot

A streaming chatbot for the text models in the [EmpirioLabs AI](https://empiriolabs.ai) catalog, built with Next.js and the AI SDK. Choose a model from the live catalog, read replies as they stream in as Markdown, and deploy your own copy to Vercel or Railway.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FEmpirioLabs-AI%2Fempiriolabs-chatbot&project-name=empiriolabs-chatbot&repository-name=empiriolabs-chatbot&integration-ids=oac_G0yRAQMkKnlHKtLYN9aNXLSD&skippable-integrations=1)
<!-- Railway: replace RAILWAY_TEMPLATE_CODE with the template's code once the Railway template is published. -->
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/RAILWAY_TEMPLATE_CODE?utm_medium=integration&utm_source=button&utm_campaign=empiriolabs-chatbot)

<p>
  <img src=".github/screenshots/desktop.png" alt="EmpirioLabs AI Chatbot on a desktop screen, showing a Python function and its explanation from GLM 5.3 Flash" width="70%">
  <img src=".github/screenshots/mobile.png" alt="The same conversation on a phone in the dark theme" width="25%">
</p>

## Features

- **Live model list.** The model picker reads the EmpirioLabs AI catalog when the page loads and lists its text models by author, so new models appear without a code change.
- **Streaming replies.** Replies stream in as Markdown with lists, tables and code blocks. When a model returns its reasoning, it appears in a section you can expand.
- **Your key stays on the server.** `EMPIRIOLABS_API_KEY` is read only on the server and is never sent to the browser.
- **Demo mode.** For a public deployment, each visitor can chat with their own API key instead of yours.
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
| `EMPIRIOLABS_API_KEY` | Yes, unless `DEMO_MODE` is on | Your API key from the [API keys page](https://platform.empiriolabs.ai/dashboard/api-keys). Read only on the server. |
| `EMPIRIOLABS_MODEL` | No | The model ID or alias the chat starts with, such as `qwen3-8-flash`. Without it, the chat starts with the catalog's first featured chat model. |
| `DEMO_MODE` | No | `true` asks each visitor for their own API key, and `EMPIRIOLABS_API_KEY` is not used. |

Visitors can also open the chat with a model chosen in the address, for example `/?model=qwen3-8-flash`.

## Run locally

You need Node.js 24 and an EmpirioLabs AI API key.

```bash
git clone https://github.com/EmpirioLabs-AI/empiriolabs-chatbot.git
cd empiriolabs-chatbot
npm ci
cp .env.example .env.local
```

Set `EMPIRIOLABS_API_KEY` in `.env.local`, then start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To run the production build, use `npm run build` and then `npm run start`.

## Public deployments

Anyone who can open your deployment can chat on its API key. Before you share the address, choose one of these:

- **Demo mode.** Set `DEMO_MODE=true`. Each visitor enters their own EmpirioLabs AI API key. The key stays in that browser tab (`sessionStorage`) and is sent with each chat request to this app, which uses it for that request only and never stores or logs it.
- **Your own sign-in.** Put the app behind your authentication.
- **A spending limit.** Give the deployment its own API key and set a spending limit on it on the [API keys page](https://platform.empiriolabs.ai/dashboard/api-keys).

Every deployment also applies these limits, which you can change in [`lib/limits.ts`](lib/limits.ts):

- Chat requests sent from other websites are refused.
- Each IP address can send 20 chat requests a minute, counted on each server instance.
- A message can be up to 32,000 characters, a conversation up to 100 messages or 200,000 characters, and a request body up to 1 MB.
- A reply can be up to 16,384 tokens, or the model's own maximum when that is lower.
- Only models in the catalog list can be used, and a failed reply is sent again only when the visitor selects **Try Again**.

## How it works

| File | Role |
| --- | --- |
| `lib/catalog.ts` | Reads `GET https://api.empiriolabs.ai/v1/models`, keeps the text models that answer on `/v1/chat/completions`, and reuses the list for five minutes. |
| `components/chat-loader.tsx` | Loads the model list and the settings on the server for each request. |
| `app/api/chat/route.ts` | Checks each request, then streams the reply with `streamText`. |
| `lib/empiriolabs.ts` | Creates the EmpirioLabs AI provider and turns API errors into messages for the page. |
| `components/chat.tsx` | The chat interface, built on `useChat` from `@ai-sdk/react`. |

The provider is the AI SDK's OpenAI-compatible provider with the EmpirioLabs AI base URL:

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";

const empiriolabs = createOpenAICompatible({
  name: "empiriolabs",
  baseURL: "https://api.empiriolabs.ai/v1",
  apiKey: process.env.EMPIRIOLABS_API_KEY,
});

const result = streamText({
  model: empiriolabs.chatModel("qwen3-8-flash"),
  prompt: "Write a haiku about the ocean.",
});
```

More in the [AI SDK guide](https://docs.empiriolabs.ai/integrations#vercel-ai-sdk), the [model catalog](https://empiriolabs.ai/models) and the [documentation](https://docs.empiriolabs.ai).

## About EmpirioLabs AI

[EmpirioLabs AI](https://empiriolabs.ai) is specialized AI model hosting for open, proprietary, and custom stacks, plus GPU Cloud and hosted AI agents. Questions about this template: [support@empiriolabs.ai](mailto:support@empiriolabs.ai).

## License

[MIT](LICENSE)
