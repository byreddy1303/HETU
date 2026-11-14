import type { ReactNode } from 'react';
import MathText from '@/components/shared/MathText';
import { BrandMark } from '@/components/shared/Brand';
import { cn } from '@/lib/utils';

/** A shared, quiet heading keeps every study screen in the same visual system. */
export default function PageHeader({
  title,
  description,
  actions,
  showMobileMark = false,
  compact = false,
  className
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  showMobileMark?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <header className={cn('study-page-header', className)} data-compact={compact}>
      <div className="min-w-0">
        {showMobileMark && <BrandMark className="mb-3 h-7 w-7 md:hidden" />}
        <h1>
          <MathText>{title}</MathText>
        </h1>
        {description && <p className="study-page-header__description">{description}</p>}
      </div>
      {actions && <div className="study-page-header__actions">{actions}</div>}
    </header>
  );
}
