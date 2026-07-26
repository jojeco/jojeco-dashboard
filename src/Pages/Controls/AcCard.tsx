import { useState, useEffect, useCallback } from 'react';
import { Power, Wind, ChevronUp, ChevronDown } from 'lucide-react';
import { getToken } from '@/services/api';

const BASE = (import.meta.env.VITE_API_URL || 'http://192.168.50.13:3001/api').replace('/api', '');
const MODES = ['AUTO', 'COOL', 'FAN_ONLY', 'DRY'] as const;
type Mode = typeof MODES[number];
const MODE_LABEL: Record<Mode, string> = { AUTO:'Auto', COOL:'Cool', FAN_ONLY:'Fan', DRY:'Dry' };

interface AcState { power: boolean; mode: string; indoor_temp: number|null; outdoor_temp: number|null; target_temp: number; fan_speed: string; }
const btn: React.CSSProperties = { display:'flex', alignItems:'center', justifyContent:'center', border:'none', borderRadius:'var(--r-sm)', cursor:'pointer', fontFamily:'inherit', fontWeight:500, transition:'background 120ms' };

export function AcCard() {
  const [state, setState] = useState<AcState|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const token = getToken();
      const r = await fetch(`${BASE}/api/ac/status`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setState(await r.json()); setError(null);
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => { fetchStatus(); const id = setInterval(fetchStatus, 30000); return () => clearInterval(id); }, [fetchStatus]);

  const post = async (path: string, body: object) => {
    setLoading(true);
    try {
      const token = getToken();
      const r = await fetch(`${BASE}/api/ac/${path}`, { method:'POST', headers:{'Content-Type':'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, credentials:'include', body:JSON.stringify(body) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setState(await r.json());
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const isOn = state?.power ?? false;
  const currentMode = (state?.mode ?? 'AUTO') as Mode;

  return (
    <div style={{ background:'var(--surface)', borderRadius:'var(--r)', padding:16, display:'flex', flexDirection:'column', gap:12, boxShadow:'var(--shadow-ring), var(--shadow-card)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <Wind size={15} style={{ color:'var(--accent)', flexShrink:0 }} />
        <span style={{ fontSize:13, fontWeight:600, color:'var(--t1)', flex:1 }}>Air Conditioner</span>
        <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:99, background:isOn?'rgba(20,184,166,0.15)':'var(--raised)', color:isOn?'var(--accent)':'var(--t3)' }}>
          {state==null?'…':isOn?'ON':'OFF'}
        </span>
      </div>

      {error && <div style={{ fontSize:11, color:'var(--err)', background:'rgba(239,68,68,0.08)', padding:'6px 10px', borderRadius:6 }}>{error}</div>}

      {state && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          {([['Indoor', state.indoor_temp],['Outdoor', state.outdoor_temp],['Target', state.target_temp]] as [string,number|null][]).map(([label,value]) => (
            <div key={label} style={{ background:'var(--canvas)', borderRadius:8, padding:'10px 8px', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <span style={{ fontSize:10, color:'var(--t3)' }}>{label}</span>
              <span style={{ fontSize:20, fontWeight:700, color:'var(--t1)', fontVariantNumeric:'tabular-nums' }}>{value!=null?`${value}°`:'—'}</span>
              <span style={{ fontSize:9, color:'var(--t3)' }}>°C</span>
            </div>
          ))}
        </div>
      )}

      {/* Mode selector */}
      {state && isOn && (
        <div style={{ display:'flex', gap:4 }}>
          {MODES.map(m => (
            <button key={m} style={{ ...btn, flex:1, padding:'6px 4px', fontSize:10,
              background: currentMode===m ? 'var(--accent-dim)' : 'var(--raised)',
              color: currentMode===m ? 'var(--accent)' : 'var(--t3)',
              boxShadow: currentMode===m ? '0 0 0 1px var(--accent-border)' : 'none' }}
              disabled={loading} onClick={() => post('mode', { mode: m })}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      )}

      <div style={{ display:'flex', gap:8, marginTop:2 }}>
        <button style={{ ...btn, flex:1, gap:6, padding:'9px 12px', fontSize:12,
          background:isOn?'rgba(239,68,68,0.12)':'var(--accent-dim)',
          color:isOn?'var(--err)':'var(--accent)',
          boxShadow:isOn?'0 0 0 1px rgba(239,68,68,0.3)':'0 0 0 1px var(--accent-border)' }}
          disabled={loading||state==null} onClick={() => post('power',{power:!isOn})}>
          <Power size={13}/>{isOn?'Turn Off':'Turn On'}
        </button>
        <button style={{ ...btn, width:38, height:38, background:'var(--raised)', color:!isOn||loading?'var(--t3)':'var(--t2)' }}
          disabled={loading||!isOn||state==null} onClick={() => post('temperature',{temperature:state!.target_temp-1})}>
          <ChevronDown size={16}/>
        </button>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, color:'var(--t1)', minWidth:36, fontVariantNumeric:'tabular-nums' }}>
          {state?`${state.target_temp}°`:'—'}
        </div>
        <button style={{ ...btn, width:38, height:38, background:'var(--raised)', color:!isOn||loading?'var(--t3)':'var(--t2)' }}
          disabled={loading||!isOn||state==null} onClick={() => post('temperature',{temperature:state!.target_temp+1})}>
          <ChevronUp size={16}/>
        </button>
      </div>
    </div>
  );
}
