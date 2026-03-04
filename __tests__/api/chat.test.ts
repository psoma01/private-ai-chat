/**
 * @jest-environment node
 */
import { POST } from '@/app/api/chat/route';
import { NextRequest } from 'next/server';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3100/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createMockStream(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk + '\n'));
      }
      controller.close();
    },
  });
}

async function readStream(response: Response): Promise<string[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) events.push(line);
    }
  }
  if (buffer.trim()) events.push(buffer);
  return events;
}

describe('POST /api/chat', () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it('returns 400 when question is missing', async () => {
    const req = createRequest({ question: '' });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Message is required');
  });

  it('returns 400 when question is whitespace only', async () => {
    const req = createRequest({ question: '   ' });
    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('streams tokens from Ollama response', async () => {
    const ollamaChunks = [
      JSON.stringify({ message: { content: 'Hello' }, done: false }),
      JSON.stringify({ message: { content: ' world' }, done: false }),
      JSON.stringify({ message: { content: '' }, done: true, prompt_eval_count: 10, eval_count: 5 }),
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: createMockStream(ollamaChunks),
    });

    const req = createRequest({ question: 'Hi there' });
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');

    const events = await readStream(response);
    const parsed = events.map(e => JSON.parse(e));

    const tokenEvents = parsed.filter(e => e.type === 'token');
    expect(tokenEvents).toHaveLength(2);
    expect(tokenEvents[0].content).toBe('Hello');
    expect(tokenEvents[1].content).toBe(' world');

    const doneEvent = parsed.find(e => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent.answer).toBe('Hello world');
    expect(doneEvent.tokens).toEqual({ prompt: 10, completion: 5, total: 15 });
  });

  it('uses default model when none specified', async () => {
    const ollamaChunks = [
      JSON.stringify({ message: { content: 'ok' }, done: true, prompt_eval_count: 1, eval_count: 1 }),
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: createMockStream(ollamaChunks),
    });

    const req = createRequest({ question: 'test' });
    await POST(req);

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.model).toBe('gemma3:latest');
  });

  it('uses specified model', async () => {
    const ollamaChunks = [
      JSON.stringify({ message: { content: 'ok' }, done: true, prompt_eval_count: 1, eval_count: 1 }),
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: createMockStream(ollamaChunks),
    });

    const req = createRequest({ question: 'test', model: 'phi4-mini:latest' });
    await POST(req);

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.model).toBe('phi4-mini:latest');
  });

  it('applies custom options', async () => {
    const ollamaChunks = [
      JSON.stringify({ message: { content: 'ok' }, done: true, prompt_eval_count: 1, eval_count: 1 }),
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: createMockStream(ollamaChunks),
    });

    const req = createRequest({
      question: 'test',
      options: { temperature: 0.3, top_p: 0.5, num_predict: 2048 },
    });
    await POST(req);

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.options.temperature).toBe(0.3);
    expect(fetchBody.options.top_p).toBe(0.5);
    expect(fetchBody.options.num_predict).toBe(2048);
    // defaults for unset
    expect(fetchBody.options.top_k).toBe(40);
    expect(fetchBody.options.repeat_penalty).toBe(1.0);
  });

  it('limits chat history to last 10 messages', async () => {
    const ollamaChunks = [
      JSON.stringify({ message: { content: 'ok' }, done: true, prompt_eval_count: 1, eval_count: 1 }),
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: createMockStream(ollamaChunks),
    });

    const chatHistory = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message ${i}`,
    }));

    const req = createRequest({ question: 'test', chatHistory });
    await POST(req);

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    // 1 system + 10 history + 1 current question = 12
    expect(fetchBody.messages).toHaveLength(12);
    expect(fetchBody.messages[0].role).toBe('system');
    expect(fetchBody.messages[11].content).toBe('test');
  });

  it('sends error event when Ollama request fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'model not found',
    });

    const req = createRequest({ question: 'test' });
    const response = await POST(req);

    const events = await readStream(response);
    const parsed = events.map(e => JSON.parse(e));

    const errorEvent = parsed.find(e => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toContain('Ollama request failed');
  });

  it('returns 500 when request body is invalid JSON', async () => {
    const req = new NextRequest('http://localhost:3100/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    const response = await POST(req);
    expect(response.status).toBe(500);
  });

  it('includes system message in Ollama request', async () => {
    const ollamaChunks = [
      JSON.stringify({ message: { content: 'ok' }, done: true, prompt_eval_count: 1, eval_count: 1 }),
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: createMockStream(ollamaChunks),
    });

    const req = createRequest({ question: 'hello' });
    await POST(req);

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.messages[0].role).toBe('system');
    expect(fetchBody.messages[0].content).toContain('helpful');
    expect(fetchBody.stream).toBe(true);
  });
});
