import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, Loader2, Radio, Trash2 } from 'lucide-react';
import { getToken } from '../services/api';

const JARVIS_API = '/api/jarvis';

type Msg = { role: 'user' | 'jarvis'; text: string; audioUrl?: string };

function getSessionId(): string {
  let id = localStorage.getItem('jarvis_session_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('jarvis_session_id', id);
  }
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
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await sendAudio(blob);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      setStatus('Listening...');
    } catch {
      setStatus('Microphone access denied');
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
    setStatus('Processing...');
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
      const resp = await fetch(JARVIS_API + '/voice', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      if (!resp.ok) throw new Error(await resp.text());
      const transcript = resp.headers.get('X-Transcript') || '(spoken)';
      const reply = resp.headers.get('X-Reply') || '';
      const audioBlob = await resp.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
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
    <div className="j-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 'calc(100vh - 120px)' }}>
      <div className="j-panel" style={{ padding: '10px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Radio size={16} color="var(--ok)" />
        <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ok)' }}>JARVIS ONLINE</span>
        <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 'auto' }}>{status}</span>
        <button
          onClick={clearHistory}
          title="Clear conversation memory"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 4, display: 'flex' }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '80%',
            background: m.role === 'user' ? 'var(--accent)' : 'var(--surface)',
            color: m.role === 'user' ? '#fff' : 'var(--t1)',
            borderRadius: 12,
            padding: '8px 12px',
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            {m.audioUrl && (
              <button onClick={() => new Audio(m.audioUrl!).play()}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: '0 4px 0 0' }}>
                <Volume2 size={12} />
              </button>
            )}
            {m.text}
          </div>
        ))}
        {loading && (
          <div className="j-panel" style={{ alignSelf: 'flex-start', padding: '8px 12px' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
        <button
          onClick={() => { if (recording) stopRecording(); else startRecording(); }}
          disabled={loading}
          style={{
            width: 80, height: 80, borderRadius: '50%',
            background: recording ? 'var(--err)' : 'var(--accent)',
            border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: loading ? 0.5 : 1,
            boxShadow: recording ? '0 0 0 12px rgba(239,68,68,0.25)' : '0 0 0 6px rgba(99,102,241,0.15)',
            transition: 'all 0.2s',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            touchAction: 'manipulation',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any}
        >
          {recording ? <MicOff size={32} color="#fff" /> : <Mic size={32} color="#fff" />}
        </button>
      </div>
      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--t3)', marginTop: 8 }}>
        {loading ? 'Thinking...' : recording ? 'Tap to send' : 'Tap to speak'}
      </p>
    </div>
  );
}
