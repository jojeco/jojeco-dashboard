/** 10px uppercase section label with hairline rule — matches Lab/Services design system. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--t3)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  );
}
