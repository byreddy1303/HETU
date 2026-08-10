import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/shared/Brand';

export default function PageHeader({
  title,
  description,
  actions,
  showMobileMark = false,
  className
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  showMobileMark?: boolean;
  className?: string;
}) {
  return (
    <header
      className={cn('u-page-header flex flex-wrap items-end justify-between gap-3 pb-6', className)}
    >
      <div className="u-margin-line min-w-0">
        <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-text">
          {title}
        </h1>
        {description && <p className="mt-0.5 text-[13.5px] text-text-muted">{description}</p>}
      </div>
      {(showMobileMark || actions) && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {showMobileMark && <BrandMark className="page-header-brand-mark h-9 w-9 md:hidden" />}
          {actions}
        </div>
      )}
    </header>
  );
}
