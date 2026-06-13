import { ReactNode } from 'react';
import { X } from 'lucide-react';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Makes the content area scrollable with a max viewport height */
  scrollable?: boolean;
  error?: string;
  success?: string;
}

const maxWidthMap = {
  sm:  380,
  md:  448,
  lg:  520,
  xl:  600,
  '2xl': 672,
};

export function BaseModal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'lg',
  scrollable = false,
  error,
  success,
}: BaseModalProps) {
  if (!isOpen) return null;

  const mw = maxWidthMap[maxWidth];

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--r-lg)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.07), 0 24px 64px rgba(0,0,0,0.6)',
          width: '100%',
          maxWidth: mw,
          minWidth: 0,
          ...(scrollable ? { maxHeight: '90vh', display: 'flex', flexDirection: 'column' } : {}),
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — never scrolls */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px',
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
        }}>
          <h2 style={{
            fontSize: 16, fontWeight: 700,
            color: 'var(--t1)',
            letterSpacing: '-0.01em',
            minWidth: 0,
          }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none',
              color: 'var(--t3)', cursor: 'pointer',
              padding: 4, display: 'flex', alignItems: 'center',
              borderRadius: 6, transition: 'color 120ms',
              flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--t1)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Inline alerts — also don't scroll */}
        {error && (
          <div style={{
            margin: '12px 20px 0',
            background: 'var(--err-dim)',
            border: '1px solid rgba(239,68,68,0.20)',
            color: 'var(--err)',
            padding: '10px 14px',
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            flexShrink: 0,
          }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{
            margin: '12px 20px 0',
            background: 'var(--ok-dim)',
            border: '1px solid rgba(34,197,94,0.20)',
            color: 'var(--ok)',
            padding: '10px 14px',
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            flexShrink: 0,
          }}>
            {success}
          </div>
        )}

        {/* Content */}
        <div style={{
          padding: '20px',
          ...(scrollable ? { overflowY: 'auto', flex: 1 } : {}),
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}
