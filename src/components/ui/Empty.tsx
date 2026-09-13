import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import WorkspaceEmblem from '@/components/shared/WorkspaceEmblem';

export function Empty({
  title,
  hint,
  action,
  className
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'u-empty workspace-empty flex flex-col items-center justify-center gap-2 px-6 py-10 text-center',
        className
      )}
    >
      <WorkspaceEmblem variant="empty" className="workspace-empty__emblem" />
      <p className="workspace-empty__title font-display font-semibold text-text">{title}</p>
      {hint && <p className="workspace-empty__hint text-text-muted">{hint}</p>}
      {action && <div className="workspace-empty__action">{action}</div>}
    </div>
  );
}
