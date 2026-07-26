import { useState, useRef } from 'react';
import { Wrench, Mic, Play, Download, Loader2 } from 'lucide-react';
import { Panel, PanelTitle, PageTitle } from '../components/Primitives';
import { getToken } from '../../services/api';

export default function ToolsPage() {
  const [ttsText, setTtsText] = useState('');
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);

  const [asrLoading, setAsrLoading] = useState(false);
  const [asrResult, setAsrResult] = useState<string | null>(null);
  const [asrError, setAsrError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTtsGenerate = async () => {
    if (!ttsText.trim()) return;
    setTtsLoading(true);
    if (ttsAudioUrl) {
      URL.revokeObjectURL(ttsAudioUrl);
      setTtsAudioUrl(null);
    }
    
    try {
      const res = await fetch('/api/tools/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({ text: ttsText })
      });
      
      if (!res.ok) throw new Error('Failed to generate audio');
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setTtsAudioUrl(url);
    } catch (err) {
      console.error(err);
      alert('Error generating audio.');
    } finally {
      setTtsLoading(false);
    }
  };

  const handleAsrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setAsrLoading(true);
    setAsrResult(null);
    setAsrError(null);
    
    try {
      const formData = new FormData();
      formData.append('audio_file', file);
      
      const res = await fetch('/api/tools/transcribe', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`
        },
        body: formData
      });
      
      if (!res.ok) throw new Error('Failed to transcribe audio');
      
      const data = await res.json();
      setAsrResult(data.text);
    } catch (err) {
      console.error(err);
      setAsrError('Failed to transcribe audio.');
    } finally {
      setAsrLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full pb-12">
      <div className="flex items-center gap-3">
        <Wrench size={24} className="text-[var(--v4-trace)]" />
        <PageTitle>AI Tools</PageTitle>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* TTS Panel */}
        <Panel className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2">
            <Play size={18} className="text-[var(--v4-trace)]" />
            <PanelTitle>Text-to-Speech (Piper)</PanelTitle>
          </div>
          
          <div className="flex flex-col gap-3 flex-1">
            <textarea
              className="w-full bg-[var(--v4-well)] border border-white/5 rounded-md p-3 text-[0.875rem] text-white placeholder:text-[var(--v4-trace)] focus:outline-none focus:border-[var(--v4-signal)] transition-colors resize-none h-40"
              placeholder="Enter text to synthesize... (long texts are automatically chunked)"
              value={ttsText}
              onChange={(e) => setTtsText(e.target.value)}
            />
            
            <div className="flex items-center justify-between mt-2">
              <button
                className="bg-[var(--v4-primary)] hover:bg-[var(--v4-signal)] text-[var(--v4-void)] px-4 py-2 rounded-md text-[0.8125rem] font-semibold transition-colors flex items-center gap-2"
                onClick={handleTtsGenerate}
                disabled={ttsLoading || !ttsText.trim()}
              >
                {ttsLoading && <Loader2 size={16} className="animate-spin" />}
                {ttsLoading ? 'Generating...' : 'Generate Audio'}
              </button>
            </div>

            {ttsAudioUrl && (
              <div className="mt-4 p-4 bg-[var(--v4-bg-deep)] rounded-lg border border-white/5 flex flex-col gap-3">
                <audio src={ttsAudioUrl} controls className="w-full h-10" />
                <a
                  href={ttsAudioUrl}
                  download="synthesized.wav"
                  className="flex items-center justify-center gap-2 text-[0.75rem] text-[var(--v4-trace)] hover:text-white transition-colors py-2 bg-[var(--v4-well)] rounded-md"
                >
                  <Download size={14} /> Download WAV
                </a>
              </div>
            )}
          </div>
        </Panel>

        {/* ASR Panel */}
        <Panel className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2">
            <Mic size={18} className="text-[var(--v4-trace)]" />
            <PanelTitle>Speech-to-Text (Faster Whisper)</PanelTitle>
          </div>
          
          <div className="flex flex-col gap-4 flex-1">
            <p className="text-[0.875rem] text-[var(--v4-readout)]">
              Upload an audio file to transcribe it into text.
            </p>
            
            <div className="relative">
              <input
                type="file"
                accept="audio/*"
                onChange={handleAsrUpload}
                ref={fileInputRef}
                className="hidden"
                id="audio-upload"
              />
              <label
                htmlFor="audio-upload"
                className="flex items-center justify-center gap-2 w-full py-8 border-2 border-dashed border-white/10 rounded-lg hover:border-[var(--v4-signal)] hover:bg-[var(--v4-well)] cursor-pointer transition-colors"
              >
                {asrLoading ? (
                  <>
                    <Loader2 size={24} className="text-[var(--v4-trace)] animate-spin" />
                    <span className="text-[0.875rem] text-[var(--v4-trace)]">Transcribing...</span>
                  </>
                ) : (
                  <>
                    <Mic size={24} className="text-[var(--v4-trace)]" />
                    <span className="text-[0.875rem] text-[var(--v4-readout)]">Click to upload audio file</span>
                  </>
                )}
              </label>
            </div>

            {asrError && (
              <div className="p-3 text-[0.8125rem] text-[var(--v4-fault)] bg-[var(--v4-fault)]/10 rounded-md">
                {asrError}
              </div>
            )}

            {asrResult && (
              <div className="mt-2 flex-1 flex flex-col gap-2">
                <span className="text-[0.75rem] uppercase tracking-wider text-[var(--v4-trace)]">Transcript</span>
                <div className="flex-1 bg-[var(--v4-well)] rounded-md p-4 text-[0.875rem] text-white border border-white/5 whitespace-pre-wrap">
                  {asrResult}
                </div>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
