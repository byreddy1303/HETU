import { cn } from '@/lib/utils';
import './brand.css';

type BrandSize = 'sm' | 'md' | 'lg';

export function BrandMark({
  className,
  decorative = false
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <img
      src="/brand/rebuild-mark.svg"
      alt={decorative ? '' : 'rebuild logo'}
      aria-hidden={decorative || undefined}
      width={512}
      height={512}
      decoding="async"
      draggable={false}
      className={cn('rebuild-mark block shrink-0 select-none', className)}
    />
  );
}

export default function Brand({
  size = 'md',
  className,
  tagline = false
}: {
  size?: BrandSize;
  className?: string;
  tagline?: boolean;
}) {
  return (
    <span className={cn('rebuild-brand', `rebuild-brand--${size}`, className)}>
      <span className="rebuild-brand__lockup" role="img" aria-label="rebuild">
        <BrandMark decorative />
        <span className="rebuild-wordmark" aria-hidden="true" />
      </span>
      {tagline && <span className="rebuild-tagline">Every mistake. One step higher.</span>}
    </span>
  );
}
