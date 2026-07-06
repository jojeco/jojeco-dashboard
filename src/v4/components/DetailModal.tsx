/**
 * v4 DetailModal — Radix Dialog wrapper for tap-for-detail expansions.
 * DESIGN.md §6 motion: spring open (transform/opacity only).
 * Desktop: mid-screen max-w-lg. Mobile: bottom-sheet with drag handle + safe-area.
 * Overlay: rgba(13,17,23,0.7) backdrop-blur-sm.
 * Header: title + optional StatusChip. Body: scrollable. Consistent padding.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '../lib/utils';
import { StatusChip } from './Primitives';
import type { ReactNode } from 'react';

type StatusLevel = 'nominal' | 'degraded' | 'fault' | 'standby';

interface DetailModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  statusLevel?: StatusLevel;
  statusLabel?: string;
  children: ReactNode;
  /** Additional class on the content panel */
  className?: string;
}

export function DetailModal({
  open,
  onClose,
  title,
  statusLevel,
  statusLabel,
  children,
  className,
}: DetailModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        {/* ── Overlay ──────────────────────────────────────────────────── */}
        <Dialog.Overlay
          className="v4-modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(13,17,23,0.72)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 200,
          }}
        />

        {/* ── Content ──────────────────────────────────────────────────── */}
        <Dialog.Content
          className={cn('v4-modal-content', className)}
          style={{
            position: 'fixed',
            zIndex: 201,
            background: 'var(--v4-console)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 var(--v4-hairline)',
            outline: 'none',
          }}
          onEscapeKeyDown={onClose}
          onPointerDownOutside={onClose}
        >
          {/* Drag handle — mobile only, decorative */}
          <div
            className="v4-modal-handle"
            aria-hidden
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: 'var(--v4-hairline)',
              margin: '0 auto',
            }}
          />

          {/* Header */}
          <div
            className="flex items-center justify-between gap-3 px-5 pt-4 pb-3"
            style={{ borderBottom: '1px solid var(--v4-hairline)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Dialog.Title
                className="text-[0.9375rem] font-semibold tracking-tight truncate"
                style={{ color: 'var(--v4-signal)' }}
              >
                {title}
              </Dialog.Title>
              {statusLevel && statusLabel && (
                <StatusChip level={statusLevel} label={statusLabel} className="shrink-0" />
              )}
            </div>

            {/* Close button — 44px tap target */}
            <Dialog.Close asChild>
              <button
                onClick={onClose}
                aria-label="Close"
                style={{
                  width: 44,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--v4-readout)',
                  borderRadius: '0.5rem',
                  flexShrink: 0,
                  marginRight: -8,
                }}
              >
                {/* X icon — 16px lucide-style */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="M12 4L4 12M4 4l8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          {/* Scrollable body */}
          <div
            className="v4-modal-body overflow-y-auto px-5 py-4"
            style={{ maxHeight: 'calc(var(--v4-modal-max-body-h, 60vh) - 80px)' }}
          >
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
