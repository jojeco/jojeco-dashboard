/**
 * v4 Placeholder pages — styled empty states per DESIGN.md §4
 * "No jobs have run yet — trigger one from Controls"
 * These come alive in slice 2.
 */
import { LucideIcon } from 'lucide-react';
import { PageTitle } from '../components/Primitives';

interface PlaceholderPageProps {
  title: string;
  icon: LucideIcon;
  message: string;
  action?: string;
}

export function PlaceholderPage({ title, icon: Icon, message, action }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{title}</PageTitle>

      <div
        className="flex flex-col items-center justify-center gap-4 rounded-[1rem] py-20"
        style={{ background: 'var(--v4-console)' }}
      >
        <div
          className="flex items-center justify-center rounded-[0.75rem] w-14 h-14"
          style={{ background: 'var(--v4-well)' }}
        >
          <Icon size={28} strokeWidth={1.5} style={{ color: 'var(--v4-readout)' }} />
        </div>
        <div className="flex flex-col items-center gap-1 text-center max-w-xs">
          <p className="text-[0.9375rem]" style={{ color: 'var(--v4-readout)' }}>
            {message}
          </p>
          {action && (
            <p className="text-[0.8125rem]" style={{ color: 'var(--v4-trace)' }}>
              {action}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
