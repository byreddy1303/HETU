import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Dialog({
  open,
  onClose,
  title,
  children,
  className
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="u-dialog-overlay fixed inset-0 z-[60] flex items-center justify-center bg-text/30 px-[calc(1rem+var(--safe-left))] pb-[calc(1rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))] backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={{ scale: 0.92, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className={cn(
              'u-dialog-panel u-panel flex max-h-[calc(100vh-32px)] w-full max-w-md flex-col shadow-lift outline-none',
              className
            )}
          >
            <div className="u-dialog-header flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-display text-[15px] font-semibold text-text">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="u-dialog-close rounded-full p-1 text-text-faint transition-colors hover:bg-bg-overlay hover:text-text"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
            <div className="u-dialog-body min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
