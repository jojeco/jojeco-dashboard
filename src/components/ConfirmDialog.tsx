/**
 * ConfirmDialog — shared destructive-action confirmation dialog.
 * Lifted from src/Pages/Controls/ConfirmDialog.tsx so Media and other pages can import it.
 * Controls/ConfirmDialog.tsx re-exports from here.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  destructive = true,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <DialogContent
        style={{
          background: 'var(--surface)',
          border: 'none',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 24px 64px rgba(0,0,0,0.6)',
          borderRadius: 'var(--r-lg)',
          maxWidth: 380,
          padding: 24,
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.01em' }}>
            {title}
          </DialogTitle>
          <DialogDescription style={{ fontSize: 13, color: 'var(--t2)', marginTop: 6, lineHeight: 1.5 }}>
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter style={{ marginTop: 20, gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '9px 18px',
              background: 'var(--raised)',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--t2)',
              cursor: 'pointer',
              minHeight: 40,
              fontFamily: 'inherit',
              transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised-2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised)'; }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onCancel(); }}
            style={{
              padding: '9px 18px',
              background: destructive ? 'rgba(239,68,68,0.18)' : 'var(--accent-dim)',
              border: `1px solid ${destructive ? 'rgba(239,68,68,0.4)' : 'var(--accent-border)'}`,
              borderRadius: 'var(--r-sm)',
              fontSize: 13,
              fontWeight: 600,
              color: destructive ? 'var(--err)' : 'var(--accent)',
              cursor: 'pointer',
              minHeight: 40,
              fontFamily: 'inherit',
              transition: 'background 120ms',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = destructive ? 'rgba(239,68,68,0.28)' : 'rgba(20,184,166,0.22)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = destructive ? 'rgba(239,68,68,0.18)' : 'var(--accent-dim)'; }}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
