import { NextRequest } from 'next/server';

const DEFAULT_MODEL = 'gemma3:latest';

function sendEvent(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: Record<string, unknown>) {
  controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, chatHistory = [], model, options = {} } = body;

    if (!question?.trim()) {
      return Response.json({ error: 'Message is required' }, { status: 400 });
    }

    const selectedModel = model || DEFAULT_MODEL;

    const systemMessage = `You are a helpful, knowledgeable, and concise AI assistant. Answer the user's questions clearly and accurately. If you're unsure about something, say so. Use markdown formatting when it helps readability.`;

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemMessage },
    ];

    const recentHistory = chatHistory.slice(-10);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }
    messages.push({ role: 'user', content: question });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const ollamaOptions = {
            temperature: options.temperature ?? 0.7,
            top_p: options.top_p ?? 0.9,
            top_k: options.top_k ?? 40,
            repeat_penalty: options.repeat_penalty ?? 1.0,
            num_predict: options.num_predict ?? 1024,
          };

          const response = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: selectedModel,
              messages,
              stream: true,
              options: ollamaOptions,
            }),
          });

          if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Ollama request failed (${response.status}): ${errorBody}`);
          }

          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let answer = '';
          let promptTokens = 0;
          let completionTokens = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const chunk = JSON.parse(line);
                if (chunk.message?.content) {
                  answer += chunk.message.content;
                  sendEvent(controller, encoder, { type: 'token', content: chunk.message.content });
                }
                if (chunk.done) {
                  promptTokens = chunk.prompt_eval_count || 0;
                  completionTokens = chunk.eval_count || 0;
                }
              } catch {
                // skip malformed JSON
              }
            }
          }

          sendEvent(controller, encoder, {
            type: 'done',
            answer,
            tokens: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
          });
        } catch (error) {
          sendEvent(controller, encoder, {
            type: 'error',
            message: error instanceof Error ? error.message : 'Failed to generate answer',
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate answer';
    return Response.json({ error: message }, { status: 500 });
  }
}
