// Full-screen image preview for question scans. The viewer supports buttons,
// wheel/double-click zoom, drag-to-pan, and two-finger pinch zoom.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Maximize2, Minus, Plus, X } from 'lucide-react';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SCALE_STEP = 0.5;

interface Point {
  x: number;
  y: number;
}

type Gesture =
  | { kind: 'pan'; pointerId: number; origin: Point; startPan: Point }
  | { kind: 'pinch'; distance: number; startScale: number };

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function pointerDistance(points: Point[]): number {
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

export function ImagePreview({
  src,
  caption,
  open,
  onClose
}: {
  src: string | null;
  caption?: string;
  open: boolean;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(MIN_SCALE);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);

  function updateScale(next: number) {
    const bounded = clampScale(next);
    scaleRef.current = bounded;
    setScale(bounded);
    if (bounded === MIN_SCALE) {
      panRef.current = { x: 0, y: 0 };
      setPan({ x: 0, y: 0 });
    }
  }

  function updatePan(next: Point) {
    panRef.current = next;
    setPan(next);
  }

  function resetView() {
    gesture.current = null;
    pointers.current.clear();
    updateScale(MIN_SCALE);
    updatePan({ x: 0, y: 0 });
  }

  useEffect(() => {
    if (!open) return;
    resetView();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === '+' || event.key === '=') updateScale(scaleRef.current + SCALE_STEP);
      if (event.key === '-') updateScale(scaleRef.current - SCALE_STEP);
      if (event.key === '0') resetView();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
    // Reset only when a new image is opened. Live scale and pan state are kept
    // in refs so this effect does not need to re-register on every gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, src, onClose]);

  function startGesture(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length >= 2) {
      gesture.current = {
        kind: 'pinch',
        distance: pointerDistance(points),
        startScale: scaleRef.current
      };
      return;
    }
    gesture.current = {
      kind: 'pan',
      pointerId: event.pointerId,
      origin: points[0],
      startPan: panRef.current
    };
  }

  function moveGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const activeGesture = gesture.current;
    if (!activeGesture) return;
    if (activeGesture.kind === 'pinch') {
      const distance = pointerDistance([...pointers.current.values()]);
      if (activeGesture.distance > 0) {
        updateScale(activeGesture.startScale * (distance / activeGesture.distance));
      }
      return;
    }
    if (activeGesture.pointerId === event.pointerId && scaleRef.current > MIN_SCALE) {
      updatePan({
        x: activeGesture.startPan.x + event.clientX - activeGesture.origin.x,
        y: activeGesture.startPan.y + event.clientY - activeGesture.origin.y
      });
    }
  }

  function endGesture(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    const remaining = [...pointers.current.entries()];
    if (remaining.length === 1) {
      const [pointerId, point] = remaining[0];
      gesture.current = {
        kind: 'pan',
        pointerId,
        origin: point,
        startPan: panRef.current
      };
    } else if (remaining.length === 0) {
      gesture.current = null;
    }
  }

  return (
    <AnimatePresence>
      {open && src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="native-image-preview fixed inset-0 z-50 flex flex-col bg-text/85 p-3 backdrop-blur-[3px] sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          <div className="relative z-10 flex shrink-0 items-center justify-between gap-3">
            <p className="min-w-0 truncate text-[12px] font-medium text-bg-raised/90">
              {caption ?? 'Question image'}
            </p>
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-bg-raised/95 p-1 text-text shadow-lift">
              <button
                type="button"
                onClick={() => updateScale(scaleRef.current - SCALE_STEP)}
                disabled={scale <= MIN_SCALE}
                aria-label="Zoom out"
                className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-bg-overlay disabled:opacity-35"
              >
                <Minus size={17} />
              </button>
              <span className="u-num w-12 text-center text-[11px]" aria-live="polite">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => updateScale(scaleRef.current + SCALE_STEP)}
                disabled={scale >= MAX_SCALE}
                aria-label="Zoom in"
                className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-bg-overlay disabled:opacity-35"
              >
                <Plus size={17} />
              </button>
              <button
                type="button"
                onClick={resetView}
                aria-label="Reset zoom"
                className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-bg-overlay"
              >
                <Maximize2 size={16} />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close preview"
                className="native-image-preview-close flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-bg-overlay"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
          </div>

          <div
            className="relative mt-3 min-h-0 flex-1 touch-none overflow-hidden rounded-xl"
            onPointerDown={startGesture}
            onPointerMove={moveGesture}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
            onWheel={(event) => {
              event.preventDefault();
              updateScale(scaleRef.current + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP));
            }}
            onDoubleClick={() => updateScale(scaleRef.current === MIN_SCALE ? 2.5 : MIN_SCALE)}
          >
            <motion.img
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              src={src}
              alt={caption ?? 'Question image'}
              draggable={false}
              className="absolute left-1/2 top-1/2 max-h-full max-w-full select-none rounded bg-white shadow-lift"
              style={{
                transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${scale})`
              }}
            />
          </div>

          <p className="shrink-0 pt-2 text-center text-[11px] text-bg-raised/75">
            Pinch, scroll, or use the controls to zoom. Drag to inspect details.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
