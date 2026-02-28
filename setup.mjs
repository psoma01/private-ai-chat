#!/usr/bin/env node

/**
 * Setup script for Private Chat app.
 * Checks prerequisites and pulls the required Ollama model.
 */

import { execSync } from 'child_process';

const MODEL = 'gemma3:latest';
const OLLAMA_URL = 'http://localhost:11434';

function log(msg) {
  console.log(`\x1b[36m[setup]\x1b[0m ${msg}`);
}

function success(msg) {
  console.log(`\x1b[32m  ✓\x1b[0m ${msg}`);
}

function fail(msg) {
  console.error(`\x1b[31m  ✗\x1b[0m ${msg}`);
}

async function checkOllama() {
  log('Checking Ollama...');
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      success('Ollama is running');
      return true;
    }
  } catch {
    // not running
  }

  fail('Ollama is not running');
  console.log('\n  To install Ollama, visit: https://ollama.com/download');
  console.log('  Then start it with: ollama serve\n');
  return false;
}

async function checkModel() {
  log(`Checking for model: ${MODEL}...`);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    if (models.some((name) => name.includes('gemma3'))) {
      success(`Model found`);
      return true;
    }
  } catch {
    // ignore
  }

  log(`Pulling ${MODEL} (this may take a few minutes)...`);
  try {
    execSync(`ollama pull ${MODEL}`, { stdio: 'inherit' });
    success(`Model ${MODEL} pulled successfully`);
    return true;
  } catch {
    fail(`Failed to pull ${MODEL}. Run manually: ollama pull ${MODEL}`);
    return false;
  }
}

async function main() {
  console.log('\n  Private Chat — Setup\n');
  console.log('  ─────────────────────\n');

  const ollamaOk = await checkOllama();
  if (!ollamaOk) {
    process.exit(1);
  }

  await checkModel();

  console.log('\n  ─────────────────────');
  console.log('  Setup complete! Run the app with:\n');
  console.log('    npm run dev\n');
  console.log(`  Then open http://localhost:3100\n`);
}

main();
