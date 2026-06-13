import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn } from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signInWithEmail } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    try {
      setError('');
      setLoading(true);
      await signInWithEmail(email, password);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to authenticate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--canvas)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 16px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: 'var(--surface)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-card), 0 0 0 1px rgba(255,255,255,0.05)',
        padding: '36px 32px',
        minWidth: 0,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52,
            borderRadius: 14,
            background: 'var(--accent-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 0 24px var(--accent-glow)',
          }}>
            <LogIn size={24} color="var(--accent)" />
          </div>
          <h2 style={{
            fontSize: 22, fontWeight: 700,
            color: 'var(--t1)', marginBottom: 6,
            letterSpacing: '-0.02em',
          }}>
            Sign In
          </h2>
          <p style={{ fontSize: 13, color: 'var(--t3)', fontFamily: 'Geist Mono, monospace', letterSpacing: '0.04em' }}>
            jojeco
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'var(--err-dim)',
            border: '1px solid rgba(239,68,68,0.25)',
            color: 'var(--err)',
            padding: '10px 14px',
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Email */}
          <div>
            <label htmlFor="email" style={{ display: 'none' }}>Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                display: 'block', width: '100%', minWidth: 0,
                padding: '10px 14px',
                background: 'var(--raised)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r-sm)',
                color: 'var(--t1)',
                fontSize: 14,
                outline: 'none',
                transition: 'border-color 120ms',
                fontFamily: 'Geist, system-ui, sans-serif',
              }}
              placeholder="Email address"
              disabled={loading}
              autoComplete="email"
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-border)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--line-2)')}
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" style={{ display: 'none' }}>Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                display: 'block', width: '100%', minWidth: 0,
                padding: '10px 14px',
                background: 'var(--raised)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r-sm)',
                color: 'var(--t1)',
                fontSize: 14,
                outline: 'none',
                transition: 'border-color 120ms',
                fontFamily: 'Geist, system-ui, sans-serif',
              }}
              placeholder="Password"
              disabled={loading}
              autoComplete="current-password"
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-border)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--line-2)')}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', minWidth: 0,
              padding: '11px 0',
              background: loading ? 'var(--raised)' : 'var(--accent)',
              color: loading ? 'var(--t3)' : '#000',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 120ms, opacity 120ms',
              opacity: loading ? 0.6 : 1,
              fontFamily: 'Geist, system-ui, sans-serif',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--line)', margin: '20px 0 0' }} />
        <div style={{ paddingTop: 16, textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => { sessionStorage.setItem('guestMode', '1'); navigate('/'); }}
            style={{
              fontSize: 13,
              color: 'var(--t3)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'color 120ms',
              fontFamily: 'Geist, system-ui, sans-serif',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--t1)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
          >
            Continue as Guest →
          </button>
        </div>
      </div>
    </div>
  );
}
