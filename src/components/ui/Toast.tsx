import { useEffect, useRef } from 'react';
import { useUiStore, type ToastTone } from '@/stores/ui';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/native';

const toneBar: Record<ToastTone, string> = {
  neutral: 'border-l-text-faint',
  success: 'border-l-success',
  danger: 'border-l-danger'
};

/** Bottom-right toast stack. Mount once in App. */
export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  const notified = useRef(new Set<number>());

  useEffect(() => {
    for (const item of toasts) {
      if (notified.current.has(item.id)) continue;
      notified.current.add(item.id);
      if (item.tone === 'success') haptic('success');
      if (item.tone === 'danger') haptic('error');
    }
  }, [toasts]);

  return (
    <div
      aria-live="polite"
      className="u-toaster pointer-events-none fixed bottom-[calc(1rem+var(--safe-bottom))] right-[calc(1rem+var(--safe-right))] z-50 flex w-[min(300px,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cn(
            'u-toast latency-toast-enter pointer-events-auto rounded border border-border border-l-[3px] bg-bg-raised px-3 py-2.5 text-left shadow-lift',
            'text-[13px] font-medium text-text',
            toneBar[t.tone]
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
