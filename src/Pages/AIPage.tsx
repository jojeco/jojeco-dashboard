import { useState, useRef, useEffect, useCallback } from 'react';

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const h = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return mobile;
}
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
| Server 2 LXC | 192.168.50.13 | Main Docker host — all 66 services run here |
| Server 3 | 192.168.50.12 | Primary LLM inference (Ollama :11434), Ubuntu 24.04 |
| Server 1 | 192.168.50.10 | Media server (Plex :32400), Windows 10 — not in inference pool |
| JoPc | 192.168.50.20 | Gaming PC, burst inference (Ollama :11434), Windows 10 |
| MacBook M4 | 192.168.50.40 | Burst inference (Ollama :11434), macOS, M4 chip |
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
  { id: 'none',  label: 'None',  accentColor: null,          prompt: null,               defaultModel: null },
  { id: 'lab',   label: 'Lab',   accentColor: 'var(--accent)', prompt: LAB_SYSTEM_PROMPT,  defaultModel: 'local-smart' },
  { id: 'code',  label: 'Code',  accentColor: '#a78bfa',       prompt: CODE_SYSTEM_PROMPT, defaultModel: 'local-code' },
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
    <button onClick={onClick} title={model.desc}
      style={{
        padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 120ms',
        background: selected ? 'var(--accent-dim)' : 'var(--raised)',
        color: selected ? 'var(--accent)' : 'var(--t2)',
        border: `1px solid ${selected ? 'var(--accent-border)' : 'var(--line)'}`,
      }}>
      {model.label}
    </button>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', gap: 10, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      <div style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isUser ? 'var(--accent)' : 'var(--raised)',
        border: isUser ? 'none' : '1px solid var(--line)',
      }}>
        {isUser
          ? <User size={14} style={{ color: '#fff' }} />
          : <Bot size={14} style={{ color: 'var(--t2)' }} />}
      </div>
      <div style={{
        maxWidth: '80%', borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        padding: '10px 14px', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        background: isUser ? 'var(--accent)' : 'var(--surface)',
        color: isUser ? '#fff' : 'var(--t1)',
        border: isUser ? 'none' : '1px solid var(--line)',
      }}>
        {msg.content || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>thinking…</span>}
      </div>
    </div>
  );
}

const API = '/api';

export default function AIPage() {
  const { currentUser } = useAuth();
  const isGuest = !currentUser;
  const isMobile = useIsMobile();
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

  const loadConversations = useCallback(async () => {
    if (isGuest) return;
    const h = { Authorization: `Bearer ${getToken()}` };
    try {
      const r = await fetch(`${API}/ai/conversations`, { headers: h });
      if (r.ok) setConversations(await r.json());
    } catch { }
  }, [isGuest]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

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
    <div style={{ display: 'flex', height: isMobile ? 'calc(100dvh - 104px)' : 'calc(100dvh - 52px)', position: 'relative', overflow: 'hidden' }}>

      {/* Conversations sidebar */}
      {!isGuest && (
        <>
          {sidebarOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20 }}
              onClick={() => setSidebarOpen(false)} />
          )}
          <div style={{
            position: isMobile ? 'fixed' : 'relative',
            zIndex: 30, width: 240, minWidth: 240, maxWidth: 240,
            height: isMobile ? '100dvh' : '100%', display: 'flex', flexDirection: 'column',
            background: 'var(--surface)', borderRight: '1px solid var(--line)',
            transform: sidebarOpen || !isMobile ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 200ms',
            top: isMobile ? 0 : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
              <MessageSquare size={13} style={{ color: 'var(--t3)' }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--t2)', flex: 1 }}>Conversations</span>
              <button onClick={newChat} style={{ padding: '4px 6px', borderRadius: 6, background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="New chat">
                <Plus size={12} style={{ color: '#fff' }} />
              </button>
              <button onClick={() => setSidebarOpen(false)} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
                <ChevronLeft size={13} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px' }}>
              {conversations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 11, color: 'var(--t3)' }}>No saved conversations</div>
              ) : (
                conversations
                  .sort((a, b) => b.updated_at - a.updated_at)
                  .map(conv => (
                    <button key={conv.id} onClick={() => loadConversation(conv)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, marginBottom: 2,
                        background: activeConvId === conv.id ? 'var(--raised)' : 'transparent',
                        border: `1px solid ${activeConvId === conv.id ? 'var(--accent-border)' : 'transparent'}`,
                        cursor: 'pointer', position: 'relative', transition: 'background 120ms',
                      }}
                      onMouseEnter={e => { if (activeConvId !== conv.id) (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised)'; }}
                      onMouseLeave={e => { if (activeConvId !== conv.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 20 }}>{conv.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Clock size={9} style={{ color: 'var(--t3)' }} />
                        <span style={{ fontSize: 10, color: 'var(--t3)' }}>{timeAgo(conv.updated_at)}</span>
                        <span style={{ fontSize: 10, color: 'var(--t3)' }}>· {conv.model.replace('local-', '')}</span>
                      </div>
                      <button onClick={(e) => deleteConversation(conv.id, e)}
                        style={{ position: 'absolute', right: 8, top: 8, padding: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', opacity: 0, transition: 'opacity 120ms, color 120ms' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--err)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t3)'; }}
                        className="conv-delete">
                        <X size={11} />
                      </button>
                    </button>
                  ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Main chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {isGuest && (
          <div style={{ margin: '12px 16px 0', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--accent-border)', background: 'var(--accent-dim)', fontSize: 12, color: 'var(--t2)', flexShrink: 0 }}>
            <strong style={{ color: 'var(--t1)' }}>AI Chat</strong> — direct access to the local AI fleet. Sign in to use.
          </div>
        )}

        {/* Toolbar */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', background: 'var(--surface)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {!isGuest && (
              <button onClick={() => setSidebarOpen(v => !v)} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
                <MessageSquare size={14} />
              </button>
            )}
            <FlaskConical size={12} style={{ color: 'var(--t3)', flexShrink: 0 }} />
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => applyPreset(p.id)}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', transition: 'all 120ms',
                  background: preset === p.id ? (p.accentColor ? `${p.accentColor}18` : 'var(--raised)') : 'transparent',
                  color: preset === p.id ? (p.accentColor ?? 'var(--t1)') : 'var(--t3)',
                }}>
                {p.label}
              </button>
            ))}
            {messages.length > 0 && (
              <button onClick={clear} disabled={streaming}
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', opacity: streaming ? 0.4 : 1, transition: 'color 120ms' }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--err)'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--t3)'}>
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto' }} className="scrollbar-none">
            <span style={{ fontSize: 11, color: 'var(--t3)', flexShrink: 0 }}>Model:</span>
            {MODELS.map(m => (
              <ModelPill key={m.id} model={m} selected={model === m.id} onClick={() => setModel(m.id)} />
            ))}
          </div>
        </div>

        {/* Messages area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--canvas)' }}>
          {convLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, color: 'var(--t3)' }}>Loading…</div>
          ) : isEmpty ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', gap: 12, opacity: 0.5 }}>
              <Bot size={40} style={{ color: 'var(--t3)' }} />
              <div>
                {activePreset.id !== 'none' ? (
                  <>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>{activePreset.label} mode active</p>
                    <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                      {activePreset.id === 'lab' ? 'Ask anything about the JojeCo lab' : 'Coding assistant mode'}
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>Local AI — no cloud, no logging</p>
                    <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Pick a preset or just start typing</p>
                  </>
                )}
                <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 8 }}>Shift+Enter for new line · Enter to send</p>
              </div>
            </div>
          ) : (
            messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)
          )}
          {error && (
            <div style={{ fontSize: 11, color: 'var(--err)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.20)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ flexShrink: 0, padding: '10px 14px 12px', borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
          {activePreset.id !== 'none' && activePreset.accentColor && (
            <div style={{ fontSize: 11, marginBottom: 6, paddingLeft: 2, color: activePreset.accentColor }}>
              {activePreset.label} preset active
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
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
              style={{
                flex: 1, resize: 'none', overflow: 'hidden', background: 'var(--raised)',
                border: '1px solid var(--line)', borderRadius: 10, padding: '9px 14px',
                fontSize: 13, color: 'var(--t1)', outline: 'none', maxHeight: 160,
                fontFamily: 'Geist, system-ui, sans-serif', transition: 'border-color 120ms',
                opacity: (streaming || isGuest) ? 0.6 : 1,
              }}
              onFocus={e => (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'var(--accent-border)'}
              onBlur={e => (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'var(--line)'}
              onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; }}
            />
            {streaming ? (
              <button onClick={stop}
                style={{ flexShrink: 0, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'var(--err)', border: 'none', cursor: 'pointer' }}
                title="Stop generation">
                <ChevronDown size={15} style={{ color: '#fff' }} />
              </button>
            ) : (
              <button onClick={send} disabled={!input.trim() || isGuest}
                style={{ flexShrink: 0, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'var(--accent)', border: 'none', cursor: (!input.trim() || isGuest) ? 'not-allowed' : 'pointer', opacity: (!input.trim() || isGuest) ? 0.4 : 1, transition: 'opacity 120ms' }}
                title="Send (Enter)">
                <Send size={14} style={{ color: '#fff' }} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
