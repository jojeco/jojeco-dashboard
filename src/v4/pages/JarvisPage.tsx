import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, Loader2, Radio, Trash2 } from 'lucide-react';
import { Panel } from '../components/Primitives';
import { getToken } from '../../services/api';

const JARVIS_API = '/api/jarvis';

type Msg = { role: 'user' | 'jarvis'; text: string; audioUrl?: string };

function genUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getSessionId(): string {
  let id = localStorage.getItem('jarvis_session_id');
  if (!id) { id = genUUID(); localStorage.setItem('jarvis_session_id', id); }
  return id;
}

export default function JarvisPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'jarvis', text: 'Jarvis online. Tap the mic and speak.' }
  ]);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [sessionId] = useState(getSessionId);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        await sendAudio(new Blob(chunksRef.current, { type: 'audio/webm' }));
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      setStatus('Listening…');
    } catch {
      setStatus('Microphone access denied');
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
    setStatus('Processing…');
  }

  async function clearHistory() {
    await fetch(`${JARVIS_API}/history/${sessionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setMsgs([{ role: 'jarvis', text: 'Memory cleared. Fresh start.' }]);
  }

  async function sendAudio(blob: Blob) {
    setLoading(true);
    const fd = new FormData();
    fd.append('audio', blob, 'audio.webm');
    fd.append('session_id', sessionId);
    try {
      const resp = await fetch(`${JARVIS_API}/voice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      if (!resp.ok) throw new Error(await resp.text());
      const transcript = resp.headers.get('X-Transcript') || '(spoken)';
      const reply = resp.headers.get('X-Reply') || '';
      const audioUrl = URL.createObjectURL(await resp.blob());
      const audio = new Audio(audioUrl);
      setMsgs(m => [...m, { role: 'user', text: transcript }, { role: 'jarvis', text: reply, audioUrl }]);
      audio.play();
      setStatus('Ready');
    } catch (e: unknown) {
      setStatus('Error: ' + String(e).slice(0, 60));
      setMsgs(m => [...m, { role: 'jarvis', text: 'Something went wrong. Try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col p-4 pb-24 gap-4 max-w-xl mx-auto" style={{ height: 'calc(100dvh - 80px)' }}>
      {/* Status bar */}
      <Panel className="flex items-center gap-2 px-4 py-2 shrink-0">
        <Radio size={13} style={{ color: 'var(--v4-nominal)' }} />
        <span className="text-[0.6875rem] font-mono" style={{ color: 'var(--v4-nominal)' }}>JARVIS ONLINE</span>
        <span className="text-[0.6875rem] ml-auto" style={{ color: 'var(--v4-trace)' }}>{status}</span>
        <button
          onClick={clearHistory}
          title="Clear conversation memory"
          className="p-1 rounded"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--v4-trace)' }}
        >
          <Trash2 size={13} />
        </button>
      </Panel>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0">
        {msgs.map((m, i) => (
          <div
            key={i}
            className="max-w-[82%] rounded-xl px-3 py-2 text-[0.875rem] leading-relaxed"
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              background: m.role === 'user' ? 'var(--v4-blue)' : 'var(--v4-surface)',
              color: m.role === 'user' ? '#fff' : 'var(--v4-text)',
            }}
          >
            {m.audioUrl && (
              <button
                onClick={() => new Audio(m.audioUrl!).play()}
                className="mr-1 opacity-60 hover:opacity-100"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', verticalAlign: 'middle' }}
              >
                <Volume2 size={11} />
              </button>
            )}
            {m.text}
          </div>
        ))}
        {loading && (
          <div
            className="rounded-xl px-3 py-2 text-[0.875rem] flex items-center gap-1.5"
            style={{ alignSelf: 'flex-start', background: 'var(--v4-surface)', color: 'var(--v4-trace)' }}
          >
            <Loader2 size={13} className="animate-spin" /> Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Mic button */}
      <div className="flex flex-col items-center gap-2 shrink-0 pb-2">
        <button
          onClick={() => { if (recording) stopRecording(); else startRecording(); }}
          disabled={loading}
          className="w-20 h-20 rounded-full flex items-center justify-center transition-all"
          style={{
            background: recording ? 'var(--v4-fault)' : 'var(--v4-blue)',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
            boxShadow: recording
              ? '0 0 0 12px rgba(239,68,68,0.2)'
              : '0 0 0 6px rgba(99,150,255,0.15)',
            touchAction: 'manipulation',
          }}
        >
          {recording ? <MicOff size={32} color="#fff" /> : <Mic size={32} color="#fff" />}
        </button>
        <p className="text-[0.6875rem]" style={{ color: 'var(--v4-trace)' }}>
          {loading ? 'Thinking…' : recording ? 'Tap to send' : 'Tap to speak'}
        </p>
      </div>
    </div>
  );
}
