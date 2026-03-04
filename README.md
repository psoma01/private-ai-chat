# Private Chat

A lightweight, privacy-first AI chat app powered by [Ollama](https://ollama.com).

Chat with any locally installed AI model. Everything runs on your machine — no cloud APIs, no data transmission, no storage.

**No data stored. No cloud APIs. Session-only.**

## What This Is

A minimal, private chat application that runs entirely on your machine. Your code.
You type.  A local model — IBM Granite, Gemma, or any model Ollama supports
— responds. Nothing is saved. No session history. No database writes.
No cloud calls. When you close the tab, the conversation is gone.

That's not a limitation. That's the design.

You can switch models mid-session using the built-in model picker and
compare responses to the same question — all without a single byte
leaving your machine.


## Features

- **Chat** — Free-form conversation with your local AI model
- **Model Selector** — Choose any Ollama model (auto-detects installed models)
- **Parameters** — Adjust temperature, top_p, top_k, repeat penalty, and max tokens
- **Streaming** — Real-time token-by-token responses via NDJSON
- **Private** — All processing happens locally via Ollama
- **Session-only** — Nothing is saved; close the tab and it's gone
- **Health Check** — Built-in endpoint to monitor Ollama connectivity and system status

## Prerequisites

1. **Node.js** 18+
2. **Ollama** — [Download here](https://ollama.com/download)
3. At least one model pulled (e.g. `ollama pull gemma3`)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Run setup to check Ollama & pull default model
npm run setup

# 3. Start the app
npm run dev
```

Open [http://localhost:3100](http://localhost:3100)

## How It Works

1. Select your preferred model from the settings dropdown
2. Type a message and press Enter (or click Send)
3. Responses stream in real-time
4. Adjust parameters for different response styles
5. Clear chat to start fresh at any time
6. Close the browser tab — session is destroyed, nothing persists

## Architecture

```
private-chat/
├── app/
│   ├── api/
│   │   ├── chat/route.ts        # POST /api/chat — streaming chat endpoint
│   │   └── health/route.ts      # GET  /api/health — system health check
│   ├── globals.css              # Design system and responsive styles
│   ├── layout.tsx               # Root layout with metadata
│   └── page.tsx                 # Home page entry point
├── components/
│   └── PrivateChatApp.tsx       # Main chat UI component
├── __tests__/
│   ├── api/
│   │   ├── chat.test.ts         # Chat API route tests
│   │   └── health.test.ts       # Health API route tests
│   ├── components/
│   │   └── PrivateChatApp.test.tsx  # Component tests
│   └── utils/
│       └── formatTokenCount.test.ts # Utility function tests
├── jest.config.ts               # Jest test configuration
├── jest.setup.ts                # Test setup (testing-library matchers)
├── setup.mjs                   # Ollama setup script
└── package.json
```

## API Reference

### `POST /api/chat`

Stream a chat response from the local AI model.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | string | Yes | The user's message |
| `chatHistory` | array | No | Previous messages (`[{ role, content }]`) |
| `model` | string | No | Model name (default: `gemma3:latest`) |
| `options` | object | No | Model parameters (see below) |

**Options:**

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `temperature` | number | 0.7 | 0–2 | Randomness (lower = focused, higher = creative) |
| `top_p` | number | 0.9 | 0–1 | Nucleus sampling threshold |
| `top_k` | number | 40 | 1–100 | Top candidates per token |
| `repeat_penalty` | number | 1.0 | 0.5–2 | Penalty for repeated tokens |
| `num_predict` | number | 1024 | 64–4096 | Max output tokens per response |

**Response:** NDJSON stream with events:

```jsonl
{"type":"token","content":"Hello"}
{"type":"token","content":" world"}
{"type":"done","answer":"Hello world","tokens":{"prompt":15,"completion":2,"total":17}}
```

Error events:
```jsonl
{"type":"error","message":"Failed to generate answer"}
```

### `GET /api/health`

Check system and Ollama connectivity status.

**Response (200 — healthy):**

```json
{
  "status": "ok",
  "ollama": true,
  "models": ["gemma3:latest", "phi4-mini:latest"],
  "modelCount": 2,
  "hasGranite": false,
  "hint": "IBM Granite model not found. Run: ollama pull granite4:350m-h-q8_0",
  "uptime": 3600,
  "ollamaLatency": 45,
  "timestamp": "2025-03-01T12:00:00.000Z",
  "version": "1.0.0"
}
```

**Response (503 — unhealthy):**

```json
{
  "status": "error",
  "ollama": false,
  "message": "Cannot connect to Ollama. Make sure Ollama is running.",
  "hint": "Start Ollama: ollama serve",
  "uptime": 3600,
  "timestamp": "2025-03-01T12:00:00.000Z",
  "version": "1.0.0"
}
```

## Testing

The project uses Jest with React Testing Library for testing.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Test coverage

| Area | File | What's tested |
|------|------|---------------|
| Health API | `__tests__/api/health.test.ts` | Ollama connectivity, model detection, error handling, timeouts |
| Chat API | `__tests__/api/chat.test.ts` | Streaming, validation, model selection, options, history limits |
| UI Component | `__tests__/components/PrivateChatApp.test.tsx` | Rendering, status badges, input states, settings dropdown |
| Utilities | `__tests__/utils/formatTokenCount.test.ts` | Token formatting, NDJSON parsing, chunked stream handling |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| Port | `3100` | Dev and production server port |
| Ollama URL | `http://localhost:11434` | Ollama API endpoint |
| Default model | `gemma3:latest` | Fallback model when none selected |
| History limit | 10 messages | Max conversation context sent to model |

## Tech Stack

- **Frontend:** Next.js + React 19 + TypeScript
- **AI Backend:** Ollama (local) — works with any model
- **Streaming:** NDJSON over HTTP
- **Testing:** Jest + React Testing Library
- **Storage:** None — fully stateless
