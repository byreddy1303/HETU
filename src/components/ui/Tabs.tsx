import { useId, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/native';

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const id = useId();
  const reduced = useReducedMotion();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = items.findIndex((item) => item.value === value);

  function select(index: number) {
    const item = items[index];
    if (!item) return;
    if (item.value !== value) haptic('selection');
    onChange(item.value);
  }

  return (
    <div role="tablist" className={cn('u-tabs flex gap-5 border-b border-border', className)}>
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            ref={(element) => { buttons.current[index] = element; }}
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active || (selectedIndex === -1 && index === 0) ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === 'ArrowRight') next = (index + 1) % items.length;
              else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = items.length - 1;
              else return;
              event.preventDefault();
              buttons.current[next]?.focus();
              select(next);
            }}
            className={cn(
              'u-tab relative -mb-px border-b-2 pb-2 pt-1 text-[13px] transition-colors',
              active
                ? 'border-accent font-semibold text-text'
                : 'border-transparent font-medium text-text-faint hover:text-text-muted'
            )}
          >
            {active && <motion.span aria-hidden="true" className="u-tab-indicator" layoutId={`tabs-${id}`} transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }} />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
