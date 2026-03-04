/**
 * @jest-environment node
 */
import { GET } from '@/app/api/health/route';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GET /api/health', () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it('returns ok status when Ollama is running with models', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: [
          { name: 'gemma3:latest' },
          { name: 'phi4-mini:latest' },
        ],
      }),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.ollama).toBe(true);
    expect(data.models).toEqual(['gemma3:latest', 'phi4-mini:latest']);
    expect(data.hasGranite).toBe(false);
    expect(data.hint).toBeDefined();
  });

  it('detects granite model when present', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: [{ name: 'granite4:350m-h-q8_0' }],
      }),
    });

    const response = await GET();
    const data = await response.json();

    expect(data.hasGranite).toBe(true);
    expect(data.hint).toBeUndefined();
  });

  it('returns 503 when Ollama responds with error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('error');
    expect(data.message).toContain('not responding');
  });

  it('returns 503 when Ollama is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('error');
    expect(data.ollama).toBe(false);
    expect(data.message).toContain('Cannot connect to Ollama');
    expect(data.hint).toContain('ollama serve');
  });

  it('handles empty models list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [] }),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.models).toEqual([]);
    expect(data.hasGranite).toBe(false);
  });

  it('handles missing models field in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.models).toEqual([]);
  });

  it('includes uptime and timestamp in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [] }),
    });

    const response = await GET();
    const data = await response.json();

    expect(data.uptime).toBeDefined();
    expect(typeof data.uptime).toBe('number');
    expect(data.timestamp).toBeDefined();
    expect(data.version).toBe('1.0.0');
  });

  it('includes ollamaLatency in successful response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'gemma3:latest' }] }),
    });

    const response = await GET();
    const data = await response.json();

    expect(data.ollamaLatency).toBeDefined();
    expect(typeof data.ollamaLatency).toBe('number');
    expect(data.ollamaLatency).toBeGreaterThanOrEqual(0);
  });

  it('includes modelCount in successful response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: [{ name: 'gemma3:latest' }, { name: 'phi4-mini:latest' }],
      }),
    });

    const response = await GET();
    const data = await response.json();

    expect(data.modelCount).toBe(2);
  });

  it('calls Ollama on correct endpoint with timeout', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [] }),
    });

    await GET();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/tags',
      expect.objectContaining({
        method: 'GET',
        signal: expect.any(AbortSignal),
      })
    );
  });
});
