import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: 'error', message: 'Ollama is not responding correctly' },
        { status: 503 }
      );
    }

    const data = await response.json();
    const models = (data.models || []).map((m: { name: string }) => m.name);
    console.log('[health] Available Ollama models:', models);
    const hasGranite = models.some((name: string) => name.includes('granite'));

    return NextResponse.json({
      status: 'ok',
      ollama: true,
      models,
      hasGranite,
      hint: hasGranite
        ? undefined
        : 'IBM Granite model not found. Run: ollama pull granite4:350m-h-q8_0',
    });
  } catch {
    return NextResponse.json(
      {
        status: 'error',
        ollama: false,
        message: 'Cannot connect to Ollama. Make sure Ollama is running.',
        hint: 'Start Ollama: ollama serve',
      },
      { status: 503 }
    );
  }
}
