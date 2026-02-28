# Private Chat

A lightweight, privacy-first AI chat app powered by [Ollama](https://ollama.com).

Chat with any locally installed AI model. Everything runs on your machine — no cloud APIs, no data transmission, no storage.

**No data stored. No cloud APIs. Session-only.**

## Features

- **Chat** — Free-form conversation with your local AI model
- **Model Selector** — Choose any Ollama model (auto-detects installed models)
- **Parameters** — Adjust temperature, top_p, top_k, repeat penalty, and max tokens
- **Streaming** — Real-time token-by-token responses
- **Private** — All processing happens locally via Ollama
- **Session-only** — Nothing is saved; close the tab and it's gone

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

## Tech Stack

- **Frontend:** Next.js + React + TypeScript
- **AI Backend:** Ollama (local) — works with any model
- **Storage:** None — fully stateless
