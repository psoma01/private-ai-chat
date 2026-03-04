// Test the formatTokenCount utility extracted from PrivateChatApp
// Since it's inline in the component, we test it directly here

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

describe('formatTokenCount', () => {
  it('returns raw number for values under 1000', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(1)).toBe('1');
    expect(formatTokenCount(500)).toBe('500');
    expect(formatTokenCount(999)).toBe('999');
  });

  it('formats values >= 1000 with k suffix', () => {
    expect(formatTokenCount(1000)).toBe('1.0k');
    expect(formatTokenCount(1500)).toBe('1.5k');
    expect(formatTokenCount(2000)).toBe('2.0k');
    expect(formatTokenCount(10000)).toBe('10.0k');
    expect(formatTokenCount(99999)).toBe('100.0k');
  });

  it('formats with one decimal place', () => {
    expect(formatTokenCount(1234)).toBe('1.2k');
    expect(formatTokenCount(1250)).toBe('1.3k'); // .toFixed rounds half up
    expect(formatTokenCount(1260)).toBe('1.3k'); // rounds up
  });
});

describe('NDJSON stream parsing', () => {
  // Test the parsing logic used by both client and server

  it('parses newline-delimited JSON correctly', () => {
    const input = '{"type":"token","content":"Hello"}\n{"type":"token","content":" world"}\n{"type":"done","answer":"Hello world"}\n';
    const lines = input.split('\n').filter(l => l.trim());
    const events = lines.map(l => JSON.parse(l));

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('token');
    expect(events[0].content).toBe('Hello');
    expect(events[2].type).toBe('done');
    expect(events[2].answer).toBe('Hello world');
  });

  it('handles buffered chunks that split mid-line', () => {
    // Simulate receiving data in two chunks where a JSON line is split
    const chunk1 = '{"type":"token","content":"He';
    const chunk2 = 'llo"}\n{"type":"done","answer":"Hello"}\n';

    let buffer = '';
    const events: Record<string, unknown>[] = [];

    // Process chunk1
    buffer += chunk1;
    const lines1 = buffer.split('\n');
    buffer = lines1.pop() || '';
    for (const line of lines1) {
      if (line.trim()) events.push(JSON.parse(line));
    }
    expect(events).toHaveLength(0); // nothing complete yet
    expect(buffer).toBe('{"type":"token","content":"He');

    // Process chunk2
    buffer += chunk2;
    const lines2 = buffer.split('\n');
    buffer = lines2.pop() || '';
    for (const line of lines2) {
      if (line.trim()) events.push(JSON.parse(line));
    }
    expect(events).toHaveLength(2);
    expect(events[0].content).toBe('Hello');
  });

  it('skips malformed JSON lines gracefully', () => {
    const lines = ['{"type":"token","content":"ok"}', 'not-json', '{"type":"done"}'];
    const events: Record<string, unknown>[] = [];

    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch {
        // skip malformed - matches app behavior
      }
    }

    expect(events).toHaveLength(2);
  });
});
