import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PrivateChatApp from '@/components/PrivateChatApp';

// Mock react-markdown to avoid ESM issues in Jest
jest.mock('react-markdown', () => {
  return function MockReactMarkdown({ children }: { children: string }) {
    return <div data-testid="markdown">{children}</div>;
  };
});

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  MessageCircle: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-message" {...props} />,
  Copy: (props: Record<string, unknown>) => <span data-testid="icon-copy" {...props} />,
  Check: (props: Record<string, unknown>) => <span data-testid="icon-check" {...props} />,
  Trash2: (props: Record<string, unknown>) => <span data-testid="icon-trash" {...props} />,
  Send: (props: Record<string, unknown>) => <span data-testid="icon-send" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-loader" {...props} />,
  AlertCircle: (props: Record<string, unknown>) => <span data-testid="icon-alert" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <span data-testid="icon-chevron-down" {...props} />,
  ChevronUp: (props: Record<string, unknown>) => <span data-testid="icon-chevron-up" {...props} />,
  Info: (props: Record<string, unknown>) => <span data-testid="icon-info" {...props} />,
  Settings: (props: Record<string, unknown>) => <span data-testid="icon-settings" {...props} />,
  X: (props: Record<string, unknown>) => <span data-testid="icon-x" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <span data-testid="icon-refresh" {...props} />,
  ShieldAlert: (props: Record<string, unknown>) => <span data-testid="icon-shield" {...props} />,
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockHealthOk(models: string[] = ['gemma3:latest']) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      status: 'ok',
      ollama: true,
      models,
      hasGranite: false,
    }),
  });
}

function mockHealthError() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      status: 'error',
      ollama: false,
      message: 'Cannot connect to Ollama',
    }),
  });
}

describe('PrivateChatApp', () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it('renders the app title', async () => {
    mockHealthOk();
    render(<PrivateChatApp />);
    expect(screen.getByText('Private Chat')).toBeInTheDocument();
  });

  it('shows empty state when no messages', async () => {
    mockHealthOk();
    render(<PrivateChatApp />);
    await waitFor(() => {
      expect(screen.getByText('Start a conversation with your local AI.')).toBeInTheDocument();
    });
  });

  it('shows Connected badge when Ollama is healthy', async () => {
    mockHealthOk();
    render(<PrivateChatApp />);
    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });

  it('shows Offline badge when Ollama is down', async () => {
    mockHealthError();
    render(<PrivateChatApp />);
    await waitFor(() => {
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });
  });

  it('disables input when Ollama is offline', async () => {
    mockHealthError();
    render(<PrivateChatApp />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a message...')).toBeDisabled();
    });
  });

  it('enables input when Ollama is online', async () => {
    mockHealthOk();
    render(<PrivateChatApp />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a message...')).not.toBeDisabled();
    });
  });

  it('shows AI disclaimer in header', async () => {
    mockHealthOk();
    render(<PrivateChatApp />);
    expect(screen.getByText(/AI-generated content may be inaccurate/)).toBeInTheDocument();
  });

  it('shows privacy message in footer', async () => {
    mockHealthOk();
    render(<PrivateChatApp />);
    expect(screen.getByText(/100% local/)).toBeInTheDocument();
  });

  it('shows Checking status initially', () => {
    // Don't resolve the fetch yet
    mockFetch.mockReturnValueOnce(new Promise(() => {}));
    render(<PrivateChatApp />);
    expect(screen.getByText('Checking...')).toBeInTheDocument();
  });

  it('displays error banner when Ollama is offline', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'error',
        ollama: false,
        message: 'Cannot connect to Ollama. Make sure Ollama is running.',
      }),
    });
    render(<PrivateChatApp />);
    await waitFor(() => {
      expect(screen.getByText('Cannot connect to Ollama. Make sure Ollama is running.')).toBeInTheDocument();
    });
  });

  it('send button is disabled when input is empty', async () => {
    mockHealthOk();
    render(<PrivateChatApp />);
    await waitFor(() => {
      const sendButton = screen.getByTitle('Send message');
      expect(sendButton).toBeDisabled();
    });
  });

  it('send button is enabled when input has text', async () => {
    mockHealthOk();
    const user = userEvent.setup();
    render(<PrivateChatApp />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a message...')).not.toBeDisabled();
    });

    await user.type(screen.getByPlaceholderText('Type a message...'), 'Hello');
    expect(screen.getByTitle('Send message')).not.toBeDisabled();
  });

  it('shows model settings dropdown when clicked', async () => {
    mockHealthOk();
    const user = userEvent.setup();
    render(<PrivateChatApp />);

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    await user.click(screen.getByTitle('Model settings'));
    expect(screen.getByText('Model Settings')).toBeInTheDocument();
  });

  it('handles network error on health check', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    render(<PrivateChatApp />);
    await waitFor(() => {
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });
  });
});
