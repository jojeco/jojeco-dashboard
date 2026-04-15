import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Trash2, Bot, User, ChevronDown, FlaskConical, MessageSquare, Plus, X, Clock, ChevronLeft } from 'lucide-react';
import { getToken } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  model: string;
  preset: string;
  messages: Message[];
  created_at: number;
  updated_at: number;
}

const MODELS = [
  { id: 'local-fast',   label: 'Fast',   desc: 'gemma4:e4b — quick answers' },
  { id: 'local-smart',  label: 'Smart',  desc: 'gemma4:26b — reasoning' },
  { id: 'local-code',   label: 'Code',   desc: 'gemma4:e4b — coding' },
  { id: 'local-reason', label: 'Reason', desc: 'deepseek-r1:14b — hard problems' },
];

const LAB_SYSTEM_PROMPT = `You are the JojeCo home lab assistant. You have full knowledge of this lab's infrastructure.

## Lab Machines
| Host | IP | Role |
|------|----|------|
| Server 2 LXC | 192.168.50.13 | Main Docker host — all 49 services run here |
| Server 3 | 192.168.50.12 | Primary LLM inference (Ollama :11434), Ubuntu 24.04 |
| Server 1 | 192.168.50.10 | Media server (Plex :32400), Windows 10 — not in inference pool |
| JoPc | 192.168.50.20 | Gaming PC, burst inference (Ollama :11434), Windows 10 |
| Mac Mini | 192.168.50.30 | AdGuard DNS, Uptime Kuma, macOS Monterey |

## Key Services (on 192.168.50.13 unless noted)
| Service | Port |
|---------|------|
| LiteLLM | :4000 |
| LibreChat | :3080 |
| JojeCo Dashboard | :3005 |
| Plex | 192.168.50.10:32400 |
| Sonarr | :8989 |
| Radarr | :7878 |
| qBittorrent | :9091 |
| Nextcloud | :8880 |
| Grafana | :3002 |
| ntfy | :8080 |
| n8n | :5678 |

Owner: Jordan — CS student, personal home lab project.`;

const CODE_SYSTEM_PROMPT = `You are an expert software engineer and sysadmin. Be concise and precise. Always show working code examples. Prefer practical solutions over theoretical ones.`;

const PRESETS = [
  { id: 'none',  label: 'None',   color: '',       prompt: null,               defaultModel: null },
  { id: 'lab',   label: '🏠 Lab', color: 'blue',   prompt: LAB_SYSTEM_PROMPT,  defaultModel: 'local-smart' },
  { id: 'code',  label: '💻 Code', color: 'purple', prompt: CODE_SYSTEM_PROMPT, defaultModel: 'local-code' },
];

function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

function titlify(text: string) {
  return text.slice(0, 60).replace(/\n/g, ' ').trim() + (text.length > 60 ? '…' : '');
}

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ModelPill({ model, selected, onClick }: { model: typeof MODELS[0]; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
        selected
          ? 'bg-blue-600 border-blue-600 text-white'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400'
      }`}
      title={model.desc}>
      {model.label}
    </button>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${isUser ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
        {isUser ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-gray-600 dark:text-gray-300" />}
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

const API = '/api';

export default function AIPage() {
  const { currentUser } = useAuth();
  const isGuest = !currentUser;
  const [model, setModel] = useState('local-smart');
  const [preset, setPreset] = useState('none');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [convLoading, setConvLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Load conversations list
  const loadConversations = useCallback(async () => {
    if (isGuest) return;
    const h = { Authorization: `Bearer ${getToken()}` };
    try {
      const r = await fetch(`${API}/ai/conversations`, { headers: h });
      if (r.ok) setConversations(await r.json());
    } catch { }
  }, [isGuest]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Auto-save current conversation after each exchange
  const scheduleAutoSave = useCallback((msgs: Message[], convId: string | null, title?: string) => {
    if (isGuest || msgs.length === 0) return;
    if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current);
    pendingSaveRef.current = setTimeout(async () => {
      const h = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
      const convTitle = title || titlify(msgs[0]?.content || 'Untitled');
      try {
        if (convId) {
          await fetch(`${API}/ai/conversations/${convId}`, {
            method: 'PUT', headers: h,
            body: JSON.stringify({ title: convTitle, model, preset, messages: msgs }),
          });
        } else {
          const r = await fetch(`${API}/ai/conversations`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ id: genId(), title: convTitle, model, preset, messages: msgs }),
          });
          if (r.ok) {
            const conv: Conversation = await r.json();
            setActiveConvId(conv.id);
          }
        }
        loadConversations();
      } catch { }
    }, 1500);
  }, [isGuest, model, preset, loadConversations]);

  const applyPreset = (presetId: string) => {
    const p = PRESETS.find(p => p.id === presetId);
    if (!p) return;
    setPreset(presetId);
    if (p.defaultModel) setModel(p.defaultModel);
    setMessages([]);
    setActiveConvId(null);
    setError(null);
  };

  const newChat = () => {
    setMessages([]);
    setActiveConvId(null);
    setError(null);
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const loadConversation = async (conv: Conversation) => {
    setConvLoading(true);
    setMessages(conv.messages);
    setActiveConvId(conv.id);
    setModel(conv.model);
    setPreset(conv.preset || 'none');
    setSidebarOpen(false);
    setError(null);
    setConvLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const h = { Authorization: `Bearer ${getToken()}` };
    await fetch(`${API}/ai/conversations/${id}`, { method: 'DELETE', headers: h });
    if (activeConvId === id) newChat();
    loadConversations();
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

    const apiMessages = [
      ...(activePreset.prompt ? [{ role: 'system', content: activePreset.prompt }] : []),
      ...history.map(m => ({ role: m.role, content: m.content })),
    ];

    let accumulated = '';

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ model, messages: apiMessages }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error((await res.text()) || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

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
              setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: accumulated }]);
            }
          } catch { }
        }
      }

      // Save after complete response
      const finalMessages = [...history, { role: 'assistant' as const, content: accumulated }];
      scheduleAutoSave(finalMessages, activeConvId);

    } catch (err: unknown) {
      if (!(err instanceof Error) || err.name !== 'AbortError') {
        setError(err instanceof Error ? err.message : String(err));
        setMessages(prev => prev.slice(0, -1));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }, [input, messages, model, streaming, activePreset, activeConvId, scheduleAutoSave]);

  const stop = () => { abortRef.current?.abort(); };
  const clear = () => { if (!streaming) { setMessages([]); setActiveConvId(null); setError(null); } };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-120px)] relative">
      {/* Sidebar */}
      {!isGuest && (
        <>
          {/* Overlay on mobile */}
          {sidebarOpen && (
            <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
          )}
          <div className={`
            fixed md:relative z-30 md:z-auto
            w-64 h-full flex flex-col
            bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
            transition-transform duration-200
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            ${sidebarOpen || window.innerWidth >= 768 ? '' : 'md:w-64'}
          `} style={{ minWidth: '16rem', maxWidth: '16rem' }}>
            <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-800">
              <MessageSquare className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">Conversations</span>
              <button onClick={newChat}
                className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white" title="New chat">
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 md:hidden">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {conversations.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">No saved conversations</div>
              ) : (
                conversations
                  .sort((a, b) => b.updated_at - a.updated_at)
                  .map(conv => (
                    <button key={conv.id} onClick={() => loadConversation(conv)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group relative ${
                        activeConvId === conv.id
                          ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}>
                      <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate pr-5">{conv.title}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-2.5 h-2.5 text-gray-400" />
                        <span className="text-[10px] text-gray-400">{timeAgo(conv.updated_at)}</span>
                        <span className="text-[10px] text-gray-400">· {conv.model.replace('local-', '')}</span>
                      </div>
                      <button onClick={(e) => deleteConversation(conv.id, e)}
                        className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                    </button>
                  ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {isGuest && (
          <div className="mx-4 mt-4 rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-300 shrink-0">
            <span className="font-semibold">AI Chat</span> — direct access to the local AI fleet. Sign in to use the chat.
          </div>
        )}

        {/* Toolbar */}
        <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0 space-y-2">
          <div className="flex items-center gap-1.5">
            {/* Sidebar toggle on mobile */}
            {!isGuest && (
              <button onClick={() => setSidebarOpen(v => !v)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 md:hidden">
                <MessageSquare className="w-4 h-4" />
              </button>
            )}
            <FlaskConical className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => applyPreset(p.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  preset === p.id
                    ? p.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                      : p.color === 'purple' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}>
                {p.label}
              </button>
            ))}
            {messages.length > 0 && (
              <button onClick={clear} disabled={streaming}
                className="ml-auto flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-40">
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span className="text-xs text-gray-400 shrink-0">Model:</span>
            {MODELS.map(m => (
              <ModelPill key={m.id} model={m} selected={model === m.id} onClick={() => setModel(m.id)} />
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50 dark:bg-gray-950">
          {convLoading ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading…</div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 opacity-50">
              <Bot className="w-12 h-12 text-gray-400" />
              <div>
                {activePreset.id !== 'none' ? (
                  <>
                    <p className="text-gray-600 dark:text-gray-400 font-medium">{activePreset.label} mode active</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {activePreset.id === 'lab' ? 'Ask anything about the JojeCo lab' : 'Coding assistant mode'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-gray-600 dark:text-gray-400 font-medium">Local AI — no cloud, no logging</p>
                    <p className="text-xs text-gray-500 mt-1">Pick a preset or just start typing</p>
                  </>
                )}
                <p className="text-xs text-gray-400 mt-2">Shift+Enter for new line · Enter to send</p>
              </div>
            </div>
          ) : (
            messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)
          )}
          {error && (
            <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          {activePreset.id !== 'none' && (
            <div className={`text-xs mb-2 px-1 ${activePreset.color === 'blue' ? 'text-blue-500' : 'text-purple-500'}`}>
              {activePreset.label} preset active
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={
                activePreset.id === 'lab' ? 'Ask about the lab…'
                  : activePreset.id === 'code' ? 'Ask a coding question…'
                  : `Ask ${MODELS.find(m => m.id === model)?.label ?? 'AI'}…`
              }
              rows={1}
              disabled={streaming || isGuest}
              className="flex-1 resize-none overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 max-h-40"
              style={{ height: 'auto' }}
              onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; }}
            />
            {streaming ? (
              <button onClick={stop}
                className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors"
                title="Stop generation">
                <ChevronDown className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={send} disabled={!input.trim() || isGuest}
                className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Send (Enter)">
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
