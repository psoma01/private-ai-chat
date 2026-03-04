import { NextResponse } from 'next/server';

const startTime = Date.now();

export async function GET() {
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  try {
    const ollamaStart = Date.now();
    const response = await fetch('http://localhost:11434/api/tags', {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    const ollamaLatency = Date.now() - ollamaStart;

    if (!response.ok) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Ollama is not responding correctly',
          uptime,
          timestamp: new Date().toISOString(),
        },
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
      modelCount: models.length,
      hasGranite,
      hint: hasGranite
        ? undefined
        : 'IBM Granite model not found. Run: ollama pull granite4:350m-h-q8_0',
      uptime,
      ollamaLatency,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  } catch {
    return NextResponse.json(
      {
        status: 'error',
        ollama: false,
        message: 'Cannot connect to Ollama. Make sure Ollama is running.',
        hint: 'Start Ollama: ollama serve',
        uptime,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
      { status: 503 }
    );
  }
}
