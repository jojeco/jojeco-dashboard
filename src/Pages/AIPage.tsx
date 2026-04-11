import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Trash2, Bot, User, ChevronDown, FlaskConical } from 'lucide-react';
import { getToken } from '../services/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const MODELS = [
  { id: 'local-fast',   label: 'Fast',   desc: 'qwen2.5:7b — quick answers' },
  { id: 'local-smart',  label: 'Smart',  desc: 'qwen2.5:14b — reasoning' },
  { id: 'local-code',   label: 'Code',   desc: 'qwen2.5-coder — coding' },
  { id: 'local-reason', label: 'Reason', desc: 'qwq:32b — hard problems (slow)' },
];

const LAB_SYSTEM_PROMPT = `You are the JojeCo home lab assistant. You have full knowledge of this lab's infrastructure.

## Lab Machines
| Host | IP | Role |
|------|----|------|
| Server 2 LXC | 192.168.50.13 | Main Docker host — all 49 services run here |
| Server 3 | 192.168.50.12 | Primary LLM inference (Ollama :11434), Ubuntu 24.04 |
| Server 1 | 192.168.50.10 | Media server (Plex :32400), idle inference, Windows 10 |
| JoPc | 192.168.50.20 | Gaming PC, burst inference (Ollama :11434), Windows 10 |
| Mac Mini | 192.168.50.30 | AdGuard DNS, Uptime Kuma, macOS Monterey |

## Key Services (on 192.168.50.13 unless noted)
| Service | Port | URL |
|---------|------|-----|
| LiteLLM | :4000 | AI router / gateway |
| LibreChat | :3080 | ai.jojeco.ca — main chat UI |
| JojeCo Dashboard | :3005 | dash.jojeco.ca — this dashboard |
| AI Playground | :3100 | Model comparison tool |
| Plex | 192.168.50.10:32400 | plex.jojeco.ca — media server |
| Seerr | :5055 | seerr.jojeco.ca — media requests |
| Sonarr | :8989 | TV automation |
| Radarr | :7878 | Movie automation |
| Prowlarr | :9696 | Indexer manager |
| qBittorrent | :9091 | Behind VPN |
| Nextcloud | :8880 | cloud.jojeco.ca — file storage |
| Grafana | :3002 | Dashboards + alerting |
| Prometheus | :9090 | Metrics collection |
| ntfy | :8080 | Push notifications (channel: jojeco-alerts) |
| Homepage | :3010 | jojeco.ca — service launcher |
| n8n | :5678 | Workflow automation |
| Netdata | :19999 | System performance metrics |
| Portainer | :9000 | Docker management UI |
| NPM | :81 | Nginx Proxy Manager |
| Tdarr | :8265 | Media transcoding (GPU node on Server 1 pending) |
| JojeCo MCP | :8766 | Custom MCP server (10 tools) |
| jojeco-router | :4001 | Smart AI routing proxy |

## LiteLLM Model Tiers
| Alias | Model | Hardware | Best For |
|-------|-------|----------|----------|
| local-fast | qwen2.5:7b | Server 3, Server 1 | Quick tasks, drafts |
| local-smart | qwen2.5:14b | Server 3, MacBook, JoPc (LB) | General reasoning |
| local-code | qwen2.5-coder:7b/:14b | Server 3, JoPc | Code, configs, scripts |
| local-reason | qwq:32b + deepseek-r1:14b | Server 3, JoPc | Hard reasoning |
| local-vision | llava:7b | Server 3 | Image analysis |

## Owner
Jordan — CS student, runs this as a personal home lab project. Budget ~$10–20/month operational.

When answering questions about the lab, be specific and reference the actual IPs, ports, and service names above. If asked about something not in this context, say so rather than guessing.`;

const CODE_SYSTEM_PROMPT = `You are an expert software engineer and sysadmin. Be concise and precise. Always show working code examples. Prefer practical solutions over theoretical ones. When writing scripts or configs, include comments only where the logic isn't obvious.`;

const PRESETS = [
  { id: 'none',        label: 'None',          color: '', prompt: null,               defaultModel: null },
  { id: 'lab',         label: '🏠 Lab',         color: 'blue', prompt: LAB_SYSTEM_PROMPT,  defaultModel: 'local-smart' },
  { id: 'code',        label: '💻 Code',        color: 'purple', prompt: CODE_SYSTEM_PROMPT, defaultModel: 'local-code' },
];

function ModelPill({ model, selected, onClick }: { model: typeof MODELS[0]; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
        selected
          ? 'bg-blue-600 border-blue-600 text-white'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400'
      }`}
      title={model.desc}
    >
      {model.label}
    </button>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
        isUser ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
      }`}>
        {isUser
          ? <User className="w-4 h-4 text-white" />
          : <Bot className="w-4 h-4 text-gray-600 dark:text-gray-300" />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
        isUser
          ? 'bg-blue-600 text-white rounded-tr-sm'
          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-tl-sm'
      }`}>
        {msg.content || <span className="opacity-40 italic">thinking…</span>}
      </div>
    </div>
  );
}

import { useAuth } from '../contexts/AuthContext';

export default function AIPage() {
  const { currentUser } = useAuth();
  const isGuest = !currentUser;
  const [model, setModel] = useState('local-smart');
  const [preset, setPreset] = useState('none');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const applyPreset = (presetId: string) => {
    const p = PRESETS.find(p => p.id === presetId);
    if (!p) return;
    setPreset(presetId);
    if (p.defaultModel) setModel(p.defaultModel);
    setMessages([]);
    setError(null);
  };

  const activePreset = PRESETS.find(p => p.id === preset) ?? PRESETS[0];

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setError(null);
    setInput('');

    const userMsg: Message = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Build messages array — prepend system prompt if preset is active
    const apiMessages = [
      ...(activePreset.prompt ? [{ role: 'system', content: activePreset.prompt }] : []),
      ...history.map(m => ({ role: m.role, content: m.content })),
    ];

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ model, messages: apiMessages }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const chunk = JSON.parse(payload);
            if (chunk.error) throw new Error(chunk.error);
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              accumulated += delta;
              setMessages(prev => [
                ...prev.slice(0, -1),
                { role: 'assistant', content: accumulated },
              ]);
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // user cancelled — keep partial response
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setMessages(prev => prev.slice(0, -1));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }, [input, messages, model, streaming, activePreset]);

  const stop = () => { abortRef.current?.abort(); };
  const clear = () => { if (!streaming) { setMessages([]); setError(null); } };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Guest info */}
      {isGuest && (
        <div className="mx-4 mt-4 rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-300 shrink-0">
          <span className="font-semibold">AI Chat</span> — direct access to the local AI fleet. 20+ open-source models running on-premises across 4 GPU nodes. Sign in to use the chat.
        </div>
      )}
      {/* Toolbar */}
      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0 space-y-2">
        {/* Row 1: presets + clear */}
        <div className="flex items-center gap-1.5">
          <FlaskConical className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              title={p.id === 'none' ? 'No system prompt' : `${p.label} preset`}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                preset === p.id
                  ? p.color === 'blue'
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                    : p.color === 'purple'
                    ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {p.label}
            </button>
          ))}
          {messages.length > 0 && (
            <button
              onClick={clear}
              disabled={streaming}
              className="ml-auto flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
        {/* Row 2: model picker */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <span className="text-xs text-gray-400 shrink-0">Model:</span>
          {MODELS.map(m => (
            <ModelPill key={m.id} model={m} selected={model === m.id} onClick={() => setModel(m.id)} />
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50 dark:bg-gray-950">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 opacity-50">
            <Bot className="w-12 h-12 text-gray-400" />
            <div>
              {activePreset.id !== 'none' ? (
                <>
                  <p className="text-gray-600 dark:text-gray-400 font-medium">{activePreset.label} mode active</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    {activePreset.id === 'lab' ? 'Ask anything about the JojeCo lab' : 'Coding assistant mode'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-gray-600 dark:text-gray-400 font-medium">Local AI — no cloud, no logging</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Pick a preset or just start typing</p>
                </>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-2">Shift+Enter for new line · Enter to send</p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        {error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        {activePreset.id !== 'none' && (
          <div className={`text-xs mb-2 px-1 ${
            activePreset.color === 'blue' ? 'text-blue-500' : 'text-purple-500'
          }`}>
            {activePreset.label} preset active — model context injected
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              activePreset.id === 'lab'
                ? 'Ask about the lab… e.g. "What port is Radarr on?" or "Why would LiteLLM be unhealthy?"'
                : activePreset.id === 'code'
                ? 'Ask a coding question…'
                : `Ask ${MODELS.find(m => m.id === model)?.label ?? 'AI'}…`
            }
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 max-h-40"
            style={{ height: 'auto' }}
            onInput={e => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 160) + 'px';
            }}
          />
          {streaming ? (
            <button
              onClick={stop}
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors"
              title="Stop generation"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!input.trim()}
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Send (Enter)"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
