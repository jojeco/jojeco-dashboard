/** Fixed-position toast stack — success and error toasts. */
import type { Toast } from './types';

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 320,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            padding: '10px 16px',
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            fontWeight: 500,
            background: t.ok ? 'var(--raised)' : 'rgba(239,68,68,0.15)',
            boxShadow: t.ok
              ? '0 0 0 1px rgba(255,255,255,0.07), 0 8px 32px rgba(0,0,0,0.5)'
              : '0 0 0 1px rgba(239,68,68,0.3), 0 8px 32px rgba(0,0,0,0.5)',
            color: t.ok ? 'var(--t1)' : 'var(--err)',
            wordBreak: 'break-word',
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
