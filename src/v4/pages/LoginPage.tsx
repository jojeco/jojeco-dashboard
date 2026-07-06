/**
 * v4 Login — DESIGN.md styled. Reuses existing auth logic.
 * No floating labels. Amber focus ring. Fault error text below field.
 * Fullscreen — bypasses AppShell.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../components/Primitives';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signInWithEmail } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    try {
      setError('');
      setLoading(true);
      await signInWithEmail(email, password);
      navigate('/v4');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="v4-root flex items-center justify-center min-h-[100dvh] px-4"
      style={{ background: 'var(--v4-void)' }}
    >
      <div
        className="w-full rounded-[1rem]"
        style={{
          maxWidth: 380,
          background: 'var(--v4-console)',
          boxShadow: '0 1px 0 rgba(0,0,0,0.4)',
          padding: '2rem',
        }}
      >
        {/* Header */}
        <div className="mb-8">
          {/* Logo mark */}
          <div
            className="flex items-center justify-center w-10 h-10 rounded-[0.625rem] mb-5 font-semibold text-base"
            style={{ background: 'var(--v4-amber)', color: 'var(--v4-void)' }}
          >
            J
          </div>

          <h1
            className="text-[1.25rem] font-semibold tracking-tight"
            style={{ color: 'var(--v4-signal)', letterSpacing: '-0.02em' }}
          >
            Sign in
          </h1>
          <p
            className="font-mono text-[0.75rem] mt-1"
            style={{ color: 'var(--v4-trace)' }}
          >
            jojeco · ops dashboard
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="v4-email"
              className="text-[0.75rem] font-medium"
              style={{ color: 'var(--v4-readout)' }}
            >
              Email
            </label>
            <input
              id="v4-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-[0.5rem] px-3 py-2.5 text-[0.875rem] font-sans w-full"
              style={{
                background: 'var(--v4-raised)',
                color: 'var(--v4-signal)',
                border: 'none',
                outline: 'none',
                fontFamily: 'inherit',
              }}
              onFocus={e => {
                e.currentTarget.style.boxShadow = '0 0 0 2px var(--v4-amber)';
              }}
              onBlur={e => {
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="v4-password"
              className="text-[0.75rem] font-medium"
              style={{ color: 'var(--v4-readout)' }}
            >
              Password
            </label>
            <input
              id="v4-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="rounded-[0.5rem] px-3 py-2.5 text-[0.875rem] font-sans w-full"
              style={{
                background: 'var(--v4-raised)',
                color: 'var(--v4-signal)',
                border: 'none',
                outline: 'none',
                fontFamily: 'inherit',
              }}
              onFocus={e => {
                e.currentTarget.style.boxShadow = '0 0 0 2px var(--v4-amber)';
              }}
              onBlur={e => {
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            {/* Error text below field per DESIGN.md */}
            {error && (
              <p
                className="text-[0.75rem] mt-0.5"
                style={{ color: 'var(--v4-fault)' }}
                role="alert"
              >
                {error}
              </p>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            className="mt-2 w-full h-10"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
