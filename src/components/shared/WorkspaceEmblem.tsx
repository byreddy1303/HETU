import { cn } from '@/lib/utils';
import './workspace-emblem.css';

export type WorkspaceEmblemVariant = 'plan' | 'practice' | 'analysis' | 'library' | 'empty';

/** Small material studies that identify each part of the workspace. */
export default function WorkspaceEmblem({
  variant = 'practice',
  className
}: {
  variant?: WorkspaceEmblemVariant;
  className?: string;
}) {
  return (
    <div
      className={cn('workspace-emblem', `workspace-emblem--${variant}`, className)}
      aria-hidden="true"
    >
      <div className="workspace-emblem__stage">
        {variant === 'practice' && (
          <>
            <span className="workspace-emblem__orbit workspace-emblem__orbit--one" />
            <span className="workspace-emblem__orbit workspace-emblem__orbit--two" />
            <span className="workspace-emblem__core" />
            <span className="workspace-emblem__satellite" />
          </>
        )}
        {variant === 'plan' &&
          [0, 1, 2].map((layer) => (
            <span key={layer} className={`workspace-emblem__slab workspace-emblem__slab--${layer}`}>
              <i />
              <i />
              <i />
            </span>
          ))}
        {variant === 'analysis' &&
          [0, 1, 2].map((column) => (
            <span
              key={column}
              className={`workspace-emblem__pillar workspace-emblem__pillar--${column}`}
            />
          ))}
        {variant === 'library' && (
          <>
            <span className="workspace-emblem__book workspace-emblem__book--back" />
            <span className="workspace-emblem__book workspace-emblem__book--front">
              <i />
              <i />
              <i />
            </span>
            <span className="workspace-emblem__bookmark" />
          </>
        )}
        {variant === 'empty' && (
          <>
            <span className="workspace-emblem__sheet workspace-emblem__sheet--back" />
            <span className="workspace-emblem__sheet workspace-emblem__sheet--front">
              <i />
              <i />
            </span>
          </>
        )}
      </div>
    </div>
  );
}
