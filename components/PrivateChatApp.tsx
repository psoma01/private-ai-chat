'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  Copy,
  Check,
  Trash2,
  Send,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Info,
  Settings,
  X,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  tokens?: { prompt: number; completion: number; total: number };
}

interface ModelParams {
  temperature: number;
  top_p: number;
  top_k: number;
  repeat_penalty: number;
  num_predict: number;
}

const DEFAULT_MODEL = 'gemma3:latest';
const MODEL_PREFERENCE = ['gemma3', 'phi4-mini', 'mistral-small', 'llama3'];

const DEFAULT_PARAMS: ModelParams = {
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  repeat_penalty: 1.0,
  num_predict: 1024,
};

// --- Streaming NDJSON reader ---
async function readStreamNDJSON(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          onEvent(JSON.parse(line));
        } catch {
          // skip malformed
        }
      }
    }
    if (buffer.trim()) {
      try { onEvent(JSON.parse(buffer)); } catch { /* skip */ }
    }
  } finally {
    reader.releaseLock();
  }
}

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function PrivateChatApp() {
  // Chat state
  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);

  // Model settings state
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [showParamsPanel, setShowParamsPanel] = useState(false);
  const [modelParams, setModelParams] = useState<ModelParams>({ ...DEFAULT_PARAMS });

  // Token tracking
  const [tokenStats, setTokenStats] = useState({ totalPrompt: 0, totalCompletion: 0 });

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [statusMessage, setStatusMessage] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const questionInputRef = useRef<HTMLTextAreaElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Check Ollama health on mount
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        if (data.status === 'ok') {
          setOllamaStatus('ok');
          if (data.models && data.models.length > 0) {
            const chatModels = data.models.filter(
              (m: string) => !m.includes('embed')
            );
            setAvailableModels(chatModels);
            const preferred = MODEL_PREFERENCE.find(pref =>
              chatModels.some((m: string) => m.includes(pref))
            );
            if (preferred) {
              const match = chatModels.find((m: string) => m.includes(preferred));
              if (match) setSelectedModel(match);
            } else if (chatModels.length > 0) {
              setSelectedModel(chatModels[0]);
            }
          }
          if (data.hint) {
            setStatusMessage(data.hint);
          }
        } else {
          setOllamaStatus('error');
          setStatusMessage(data.message || 'Ollama is not available');
        }
      } catch {
        setOllamaStatus('error');
        setStatusMessage('Cannot connect to the app server');
      }
    }
    checkHealth();
  }, []);

  // Close settings dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowModelSettings(false);
      }
    }
    if (showModelSettings) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showModelSettings]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // --- STREAMING CHAT ---
  const handleAsk = useCallback(async () => {
    if (!question.trim()) return;

    const userMessage = question.trim();
    setQuestion('');
    setError(null);
    setIsAsking(true);

    // Add user message + placeholder assistant message
    setChatHistory(prev => [
      ...prev,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: '' },
    ]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          chatHistory,
          model: selectedModel,
          options: modelParams,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to get answer');
      }

      let currentAnswer = '';

      await readStreamNDJSON(res, (event) => {
        switch (event.type) {
          case 'token':
            currentAnswer += event.content as string;
            setChatHistory(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: currentAnswer };
              return updated;
            });
            break;
          case 'done': {
            const tokens = event.tokens as { prompt: number; completion: number; total: number };
            setChatHistory(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: event.answer as string,
                tokens,
              };
              return updated;
            });
            setTokenStats(prev => ({
              totalPrompt: prev.totalPrompt + tokens.prompt,
              totalCompletion: prev.totalCompletion + tokens.completion,
            }));
            break;
          }
          case 'error':
            throw new Error(event.message as string);
        }
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get answer';
      setError(errorMsg);
      // Remove the placeholder assistant message, keep the user message
      setChatHistory(prev => {
        if (prev.length >= 2 && prev[prev.length - 1].role === 'assistant') {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsAsking(false);
      questionInputRef.current?.focus();
    }
  }, [question, chatHistory, selectedModel, modelParams]);

  const handleCopy = useCallback(async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const handleClearChat = useCallback(() => {
    setChatHistory([]);
    setTokenStats({ totalPrompt: 0, totalCompletion: 0 });
    setError(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleAsk();
      }
    },
    [handleAsk]
  );

  const updateParam = useCallback((key: keyof ModelParams, value: number) => {
    setModelParams(prev => ({ ...prev, [key]: value }));
  }, []);

  const totalTokens = tokenStats.totalPrompt + tokenStats.totalCompletion;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <MessageCircle size={24} className="header-icon" />
            <h1>Private Chat</h1>
          </div>
          <div className="ai-disclaimer-header">
            <ShieldAlert size={12} />
            <span>AI-generated content may be inaccurate. Please verify independently.</span>
          </div>
          <div className="header-meta">
            {/* Token counter */}
            {totalTokens > 0 && (
              <span className="token-badge" title={`Input: ${formatTokenCount(tokenStats.totalPrompt)} | Output: ${formatTokenCount(tokenStats.totalCompletion)}`}>
                {formatTokenCount(totalTokens)} tokens
              </span>
            )}

            {/* Model Settings */}
            <div className="model-settings-wrapper" ref={settingsRef}>
              <button
                className="btn-model-settings"
                onClick={() => setShowModelSettings(!showModelSettings)}
                title="Model settings"
              >
                <Settings size={14} />
                <span className="model-name-display">{selectedModel}</span>
                <ChevronDown size={12} />
              </button>
              {showModelSettings && (
                <div className="model-dropdown">
                  <div className="model-dropdown-header">
                    <span>Model Settings</span>
                    <button className="btn-icon" onClick={() => setShowModelSettings(false)}>
                      <X size={14} />
                    </button>
                  </div>

                  {/* Model selection */}
                  <div className="settings-section">
                    <div className="settings-section-label">Model</div>
                    {availableModels.length > 0 ? (
                      <div className="model-list">
                        {availableModels.map((model) => (
                          <button
                            key={model}
                            className={`model-option ${model === selectedModel ? 'model-option-active' : ''}`}
                            onClick={() => {
                              setSelectedModel(model);
                            }}
                          >
                            <span>{model}</span>
                            {model === selectedModel && <Check size={14} />}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="model-dropdown-empty">
                        No models found. Pull a model with:<br />
                        <code>ollama pull gemma3</code>
                      </div>
                    )}
                  </div>

                  {/* Parameters */}
                  <div className="settings-section">
                    <button
                      className="settings-section-toggle"
                      onClick={() => setShowParamsPanel(!showParamsPanel)}
                    >
                      <span className="settings-section-label">Parameters</span>
                      <Info size={12} className="param-info-icon" />
                      {showParamsPanel ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {showParamsPanel && (
                      <div className="params-panel">
                        <div className="param-row">
                          <div className="param-header">
                            <label>Temperature</label>
                            <span className="param-value">{modelParams.temperature.toFixed(1)}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.1"
                            value={modelParams.temperature}
                            onChange={(e) => updateParam('temperature', parseFloat(e.target.value))}
                            className="param-slider"
                          />
                          <span className="param-hint">Lower = focused, higher = creative</span>
                        </div>

                        <div className="param-row">
                          <div className="param-header">
                            <label>Top P</label>
                            <span className="param-value">{modelParams.top_p.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={modelParams.top_p}
                            onChange={(e) => updateParam('top_p', parseFloat(e.target.value))}
                            className="param-slider"
                          />
                          <span className="param-hint">Nucleus sampling threshold</span>
                        </div>

                        <div className="param-row">
                          <div className="param-header">
                            <label>Top K</label>
                            <span className="param-value">{modelParams.top_k}</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="100"
                            step="1"
                            value={modelParams.top_k}
                            onChange={(e) => updateParam('top_k', parseInt(e.target.value))}
                            className="param-slider"
                          />
                          <span className="param-hint">Top candidates per token</span>
                        </div>

                        <div className="param-row">
                          <div className="param-header">
                            <label>Repeat Penalty</label>
                            <span className="param-value">{modelParams.repeat_penalty.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="2"
                            step="0.05"
                            value={modelParams.repeat_penalty}
                            onChange={(e) => updateParam('repeat_penalty', parseFloat(e.target.value))}
                            className="param-slider"
                          />
                          <span className="param-hint">Penalize repeated tokens</span>
                        </div>

                        <div className="param-row">
                          <div className="param-header">
                            <label>Max Tokens</label>
                            <span className="param-value">{modelParams.num_predict}</span>
                          </div>
                          <input
                            type="range"
                            min="64"
                            max="4096"
                            step="64"
                            value={modelParams.num_predict}
                            onChange={(e) => updateParam('num_predict', parseInt(e.target.value))}
                            className="param-slider"
                          />
                          <span className="param-hint">Max output length per response</span>
                        </div>

                        <button
                          className="btn-toolbar param-reset"
                          onClick={() => setModelParams({ ...DEFAULT_PARAMS })}
                        >
                          <RefreshCw size={11} />
                          <span>Reset defaults</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <span className={`badge ${ollamaStatus === 'ok' ? 'badge-ok' : ollamaStatus === 'error' ? 'badge-error' : 'badge-checking'}`}>
              {ollamaStatus === 'ok' ? 'Connected' : ollamaStatus === 'error' ? 'Offline' : 'Checking...'}
            </span>
          </div>
        </div>
        {statusMessage && ollamaStatus === 'error' && (
          <div className="status-banner">
            <AlertCircle size={14} />
            <span>{statusMessage}</span>
          </div>
        )}
      </header>

      {/* Error Display */}
      {error && (
        <div className="error-box">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="error-dismiss">&times;</button>
        </div>
      )}

      {/* Chat Area */}
      <main className="chat-main">
        <section className="chat-panel">
          <div className="chat-panel-header">
            <div className="panel-title">
              <MessageCircle size={16} />
              <span>Chat</span>
            </div>
            <div className="panel-actions">
              {chatHistory.length > 0 && (
                <button
                  onClick={handleClearChat}
                  className="btn-icon"
                  title="Clear chat"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Chat History */}
          <div className="chat-area">
            {chatHistory.length === 0 && (
              <div className="empty-state">
                <MessageCircle size={28} className="empty-icon" />
                <p>Start a conversation with your local AI.</p>
                <p className="context-note">All messages are processed locally via Ollama. Nothing leaves your machine.</p>
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.role}`}>
                <div className="chat-bubble">
                  {msg.role === 'assistant' ? (
                    msg.content ? (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    ) : (
                      <span className="chat-streaming-placeholder">
                        <Loader2 size={14} className="spin" />
                      </span>
                    )
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
                {msg.role === 'assistant' && msg.content && (
                  <div className="chat-meta">
                    <button
                      onClick={() => handleCopy(msg.content, `chat-${i}`)}
                      className="btn-icon chat-copy"
                      title="Copy answer"
                    >
                      {copiedField === `chat-${i}` ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    {msg.tokens && (
                      <span className="chat-token-info">
                        {formatTokenCount(msg.tokens.total)} tokens
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="ask-input-area">
            <textarea
              ref={questionInputRef}
              className="ask-input"
              placeholder="Type a message..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              disabled={ollamaStatus !== 'ok'}
            />
            <button
              onClick={handleAsk}
              disabled={!question.trim() || isAsking || ollamaStatus !== 'ok'}
              className="btn-send"
              title="Send message"
            >
              {isAsking ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <span>Powered by <strong>Ollama</strong></span>
        <span className="footer-sep">|</span>
        <span>100% local — no data leaves your machine</span>
        {totalTokens > 0 && (
          <>
            <span className="footer-sep">|</span>
            <span className="footer-tokens">
              Session: {formatTokenCount(tokenStats.totalPrompt)} in + {formatTokenCount(tokenStats.totalCompletion)} out = {formatTokenCount(totalTokens)} tokens
            </span>
          </>
        )}
      </footer>
    </div>
  );
}
