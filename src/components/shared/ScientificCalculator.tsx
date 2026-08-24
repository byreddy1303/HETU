import { useCallback, useEffect, useRef, useState } from 'react';
import { Calculator, X, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─────────────────────────────────────────────────────────────
   Evaluation helpers
   ────────────────────────────────────────────────────────────── */

const DEG_TO_RAD = Math.PI / 180;

function safeEval(expr: string): number {
  // Replace display tokens with Math calls
  const transformed = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, String(Math.PI))
    .replace(/e(?![0-9])/g, String(Math.E));
  // eslint-disable-next-line no-new-func
  return Function('"use strict"; return (' + transformed + ')')() as number;
}

/* ─────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────── */

type AngleMode = 'DEG' | 'RAD';

interface CalcState {
  display: string; // what the user sees in the input field
  result: string; // computed result shown below
  angleMode: AngleMode;
  memory: number;
  justEvaluated: boolean; // after = is pressed, next digit starts fresh
  isShift: boolean; // 2nd / shift mode (for inverses)
}

const INIT: CalcState = {
  display: '0',
  result: '',
  angleMode: 'DEG',
  memory: 0,
  justEvaluated: false,
  isShift: false
};

/* ─────────────────────────────────────────────────────────────
   Calculator logic
   ────────────────────────────────────────────────────────────── */

function processKey(state: CalcState, key: string): CalcState {
  const { display, angleMode, memory, justEvaluated, isShift } = state;

  const angle = (v: number) => (angleMode === 'DEG' ? v * DEG_TO_RAD : v);
  const fromAngle = (v: number) => (angleMode === 'DEG' ? v / DEG_TO_RAD : v);

  const applyUnary = (fn: (v: number) => number): CalcState => {
    try {
      const val = safeEval(display);
      const res = fn(val);
      const resStr = formatResult(res);
      return { ...state, display: resStr, result: '', justEvaluated: true, isShift: false };
    } catch {
      return { ...state, result: 'Error', isShift: false };
    }
  };

  const appendToDisplay = (token: string): CalcState => {
    if (justEvaluated && /[0-9π.e]/.test(token)) {
      return { ...state, display: token, justEvaluated: false };
    }
    const next = display === '0' && /[0-9]/.test(token) ? token : display + token;
    return { ...state, display: next, justEvaluated: false };
  };

  switch (key) {
    // ── Digits & decimal ──
    case '0':
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
      return appendToDisplay(key);

    case '.':
      if (justEvaluated) return { ...state, display: '0.', justEvaluated: false };
      if (display.split(/[+\-*/]/).pop()?.includes('.')) return state;
      return { ...state, display: display + '.', justEvaluated: false };

    // ── Operators ──
    case '+':
    case '-':
    case '×':
    case '÷':
    case '**': {
      const d = justEvaluated ? display : display;
      return { ...state, display: d + key, justEvaluated: false };
    }

    case '(': return appendToDisplay('(');
    case ')': return appendToDisplay(')');
    case '%': return applyUnary((v) => v / 100);

    // ── Constants ──
    case 'π': return appendToDisplay('π');
    case 'e': return appendToDisplay('e');

    // ── Equals ──
    case '=': {
      try {
        const val = safeEval(display);
        if (!Number.isFinite(val)) return { ...state, result: 'Error' };
        const resStr = formatResult(val);
        return { ...state, display: resStr, result: '', justEvaluated: true };
      } catch {
        return { ...state, result: 'Error' };
      }
    }

    // ── Clear ──
    case 'AC':
      return { ...INIT, angleMode, memory };
    case 'DEL': {
      if (justEvaluated) return { ...state, display: '0', justEvaluated: false };
      const next = display.length > 1 ? display.slice(0, -1) : '0';
      return { ...state, display: next };
    }

    // ── Angle mode ──
    case 'DEG':
      return { ...state, angleMode: 'DEG' };
    case 'RAD':
      return { ...state, angleMode: 'RAD' };

    // ── Shift toggle ──
    case 'SHIFT':
      return { ...state, isShift: !isShift };

    // ── Trig ──
    case 'sin':
      return isShift
        ? applyUnary((v) => fromAngle(Math.asin(v)))
        : applyUnary((v) => Math.sin(angle(v)));
    case 'cos':
      return isShift
        ? applyUnary((v) => fromAngle(Math.acos(v)))
        : applyUnary((v) => Math.cos(angle(v)));
    case 'tan':
      return isShift
        ? applyUnary((v) => fromAngle(Math.atan(v)))
        : applyUnary((v) => Math.tan(angle(v)));

    // ── Log / exp ──
    case 'log':
      return isShift
        ? applyUnary((v) => Math.pow(10, v))
        : applyUnary((v) => Math.log10(v));
    case 'ln':
      return isShift
        ? applyUnary((v) => Math.exp(v))
        : applyUnary((v) => Math.log(v));

    // ── Powers / roots ──
    case 'x²':
      return applyUnary((v) => v * v);
    case 'x³':
      return applyUnary((v) => v * v * v);
    case '√':
      return isShift
        ? applyUnary((v) => v * v)
        : applyUnary((v) => Math.sqrt(v));
    case '∛':
      return applyUnary((v) => Math.cbrt(v));
    case 'xʸ':
      return appendToDisplay('**');
    case '1/x':
      return applyUnary((v) => 1 / v);
    case '|x|':
      return applyUnary((v) => Math.abs(v));
    case 'n!':
      return applyUnary((v) => {
        if (!Number.isInteger(v) || v < 0 || v > 170) throw new Error('domain');
        let r = 1;
        for (let i = 2; i <= v; i++) r *= i;
        return r;
      });

    // ── Memory ──
    case 'MC':
      return { ...state, memory: 0 };
    case 'MR': {
      const ms = formatResult(memory);
      if (justEvaluated) return { ...state, display: ms, justEvaluated: false };
      return { ...state, display: display === '0' ? ms : display + ms };
    }
    case 'M+': {
      try {
        return { ...state, memory: memory + safeEval(display) };
      } catch {
        return state;
      }
    }
    case 'M-': {
      try {
        return { ...state, memory: memory - safeEval(display) };
      } catch {
        return state;
      }
    }
    case 'MS': {
      try {
        return { ...state, memory: safeEval(display) };
      } catch {
        return state;
      }
    }

    default:
      return state;
  }
}

function formatResult(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  // Show up to 10 significant digits; strip trailing zeros
  const s = parseFloat(n.toPrecision(10)).toString();
  return s;
}

/* ─────────────────────────────────────────────────────────────
   Button config
   ────────────────────────────────────────────────────────────── */

type BtnVariant = 'digit' | 'op' | 'fn' | 'eq' | 'clear' | 'mem' | 'shift';

interface BtnDef {
  key: string;
  label?: string; // shown on button (defaults to key)
  shiftLabel?: string; // shown when shift active
  variant: BtnVariant;
  wide?: boolean;
}

const BUTTONS: BtnDef[][] = [
  // Row 1 – angle / memory / shift
  [
    { key: 'SHIFT', label: '2nd', variant: 'shift' },
    { key: 'DEG', label: 'DEG', variant: 'fn' },
    { key: 'RAD', label: 'RAD', variant: 'fn' },
    { key: 'MC', variant: 'mem' },
    { key: 'MR', variant: 'mem' },
    { key: 'MS', variant: 'mem' },
    { key: 'M+', variant: 'mem' },
    { key: 'M-', variant: 'mem' }
  ],
  // Row 2 – trig
  [
    { key: 'sin', shiftLabel: 'sin⁻¹', variant: 'fn' },
    { key: 'cos', shiftLabel: 'cos⁻¹', variant: 'fn' },
    { key: 'tan', shiftLabel: 'tan⁻¹', variant: 'fn' },
    { key: 'log', shiftLabel: '10ˣ', variant: 'fn' },
    { key: 'ln', shiftLabel: 'eˣ', variant: 'fn' },
    { key: 'n!', variant: 'fn' },
    { key: '|x|', variant: 'fn' },
    { key: '1/x', variant: 'fn' }
  ],
  // Row 3 – powers / roots / constants
  [
    { key: 'x²', variant: 'fn' },
    { key: 'x³', variant: 'fn' },
    { key: 'xʸ', label: 'xʸ', variant: 'fn' },
    { key: '√', shiftLabel: 'x²', variant: 'fn' },
    { key: '∛', variant: 'fn' },
    { key: 'π', variant: 'fn' },
    { key: 'e', variant: 'fn' },
    { key: '%', variant: 'fn' }
  ],
  // Row 4 – parens / clear
  [
    { key: '(', variant: 'op' },
    { key: ')', variant: 'op' },
    { key: 'AC', variant: 'clear' },
    { key: 'DEL', label: '⌫', variant: 'clear' },
    { key: '÷', variant: 'op' },
    { key: '×', variant: 'op' },
    { key: '-', variant: 'op' },
    { key: '+', variant: 'op' }
  ],
  // Row 5 – digits & equals
  [
    { key: '7', variant: 'digit' },
    { key: '8', variant: 'digit' },
    { key: '9', variant: 'digit' },
    { key: '4', variant: 'digit' },
    { key: '5', variant: 'digit' },
    { key: '6', variant: 'digit' },
    { key: '1', variant: 'digit' },
    { key: '2', variant: 'digit' }
  ],
  // Row 6 – bottom digits & equals
  [
    { key: '3', variant: 'digit' },
    { key: '0', variant: 'digit', wide: true },
    { key: '.', variant: 'digit' },
    { key: '=', variant: 'eq', wide: true }
  ]
];

/* ─────────────────────────────────────────────────────────────
   Variant styles
   ────────────────────────────────────────────────────────────── */

const VARIANT_CLASSES: Record<BtnVariant, string> = {
  digit:
    'bg-bg-raised border-border text-text hover:bg-bg-overlay hover:border-border-hover font-mono text-[14px] font-semibold',
  op: 'bg-accent-faint border-accent/30 text-accent hover:bg-accent/20 font-semibold text-[14px]',
  fn: 'bg-bg-overlay border-border text-text-muted hover:bg-bg-raised hover:text-text text-[11px] font-medium',
  eq: 'bg-accent border-accent text-accent-contrast hover:opacity-90 font-bold text-[15px]',
  clear: 'bg-danger-faint border-danger/30 text-danger hover:bg-danger/20 font-semibold text-[12px]',
  mem: 'bg-guess-faint border-guess/30 text-guess hover:bg-guess/20 text-[11px] font-medium',
  shift: 'border font-semibold text-[11px]'
};

/* ─────────────────────────────────────────────────────────────
   Draggable floating calculator
   ────────────────────────────────────────────────────────────── */

interface ScientificCalculatorProps {
  open: boolean;
  onClose: () => void;
}

export default function ScientificCalculator({ open, onClose }: ScientificCalculatorProps) {
  const [calc, setCalc] = useState<CalcState>(INIT);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) setCalc(INIT);
  }, [open]);

  // Set initial position on first open
  useEffect(() => {
    if (open && pos === null) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setPos({ x: Math.max(0, w - 420), y: Math.max(0, (h - 560) / 2) });
    }
  }, [open, pos]);

  const press = useCallback((key: string) => {
    setCalc((prev) => processKey(prev, key));
  }, []);

  // ── Keyboard support ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const map: Record<string, string> = {
        '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
        '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
        '.': '.', '+': '+', '-': '-', '*': '×', '/': '÷',
        Enter: '=', '=': '=', Backspace: 'DEL', Escape: 'AC',
        '(': '(', ')': ')'
      };
      if (map[e.key]) {
        e.preventDefault();
        press(map[e.key]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, press]);

  // ── Drag logic ──
  const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    dragging.current = true;
    dragOffset.current = {
      x: e.clientX - (pos?.x ?? 0),
      y: e.clientY - (pos?.y ?? 0)
    };
    const move = (me: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(me.clientX - dragOffset.current.x, window.innerWidth - 400)),
        y: Math.max(0, Math.min(me.clientY - dragOffset.current.y, window.innerHeight - 100))
      });
    };
    const up = () => { dragging.current = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up, { once: true });
  };

  if (!open || pos === null) return null;

  const isError = calc.display === 'Error' || calc.result === 'Error';
  const displayTruncated = calc.display.length > 20
    ? calc.display.slice(-20)
    : calc.display;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Scientific calculator"
      aria-modal="false"
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 70 }}
      className="w-[400px] rounded-xl border border-border bg-bg-raised shadow-lift select-none"
    >
      {/* ── Header / drag handle ── */}
      <div
        className="flex items-center justify-between gap-2 rounded-t-xl border-b border-border bg-bg-overlay/60 px-3 py-2 cursor-grab active:cursor-grabbing"
        onMouseDown={startDrag}
      >
        <div className="flex items-center gap-1.5 text-text-muted">
          <GripHorizontal size={14} />
          <Calculator size={14} />
          <span className="text-[12px] font-semibold text-text">Scientific Calculator</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
              calc.angleMode === 'DEG'
                ? 'bg-accent-faint text-accent'
                : 'bg-guess-faint text-guess'
            )}
          >
            {calc.angleMode}
          </span>
          {calc.memory !== 0 && (
            <span className="rounded bg-guess-faint px-1.5 py-0.5 text-[10px] font-bold text-guess">
              M
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close calculator"
            className="rounded p-1 text-text-faint hover:bg-bg-overlay hover:text-text transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Display ── */}
      <div className="bg-bg px-4 py-3 rounded-none border-b border-border">
        <div
          className={cn(
            'font-mono text-right text-[22px] font-semibold leading-tight break-all min-h-[34px]',
            isError ? 'text-danger' : 'text-text'
          )}
          aria-live="polite"
          aria-label={`Display: ${displayTruncated}`}
        >
          {displayTruncated}
        </div>
        {calc.result && !isError && (
          <div className="mt-0.5 text-right font-mono text-[12px] text-text-faint">
            = {calc.result}
          </div>
        )}
      </div>

      {/* ── Buttons ── */}
      <div className="p-2 flex flex-col gap-1">
        {BUTTONS.map((row, ri) => (
          <div key={ri} className="flex gap-1">
            {row.map((btn) => {
              const isActive =
                (btn.key === 'DEG' && calc.angleMode === 'DEG') ||
                (btn.key === 'RAD' && calc.angleMode === 'RAD') ||
                (btn.key === 'SHIFT' && calc.isShift);

              const shiftLabel =
                calc.isShift && btn.shiftLabel ? btn.shiftLabel : (btn.label ?? btn.key);

              return (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => press(btn.key)}
                  aria-label={shiftLabel}
                  aria-pressed={
                    btn.key === 'SHIFT' || btn.key === 'DEG' || btn.key === 'RAD'
                      ? isActive
                      : undefined
                  }
                  className={cn(
                    'flex-1 rounded border py-2 transition-all active:scale-95',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    btn.wide ? 'flex-[2]' : '',
                    btn.variant === 'shift'
                      ? cn(
                          'border',
                          isActive
                            ? 'bg-accent border-accent text-accent-contrast'
                            : 'bg-bg-overlay border-border text-text-muted hover:bg-bg-raised hover:text-text'
                        )
                      : VARIANT_CLASSES[btn.variant],
                    (btn.key === 'DEG' && calc.angleMode === 'DEG') ||
                    (btn.key === 'RAD' && calc.angleMode === 'RAD')
                      ? 'ring-1 ring-accent'
                      : ''
                  )}
                >
                  {shiftLabel}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Shift hint ── */}
      {calc.isShift && (
        <div className="border-t border-border px-3 py-1.5 text-center text-[10px] text-accent">
          2nd functions active — press a trig/log key or tap 2nd to cancel
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Floating trigger button (shown during sessions)
   ────────────────────────────────────────────────────────────── */

export function CalculatorTrigger({
  onClick,
  active
}: {
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active ? 'Close calculator' : 'Open scientific calculator'}
      aria-expanded={active}
      title="Scientific Calculator"
      className={cn(
        'flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[12px] font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        active
          ? 'border-accent bg-accent-faint text-accent'
          : 'border-border bg-bg-raised text-text-muted hover:border-border-hover hover:text-text'
      )}
    >
      <Calculator size={13} />
      Calc
    </button>
  );
}
