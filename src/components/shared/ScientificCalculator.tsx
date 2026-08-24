import { useCallback, useEffect, useRef, useState } from 'react';
import { Calculator, X, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─────────────────────────────────────────────────────────────
   Evaluation helpers
   ────────────────────────────────────────────────────────────── */

const DEG_TO_RAD = Math.PI / 180;

/**
 * Converts the user-visible display string into a JS-evaluable expression and
 * evaluates it. Returns a finite number or throws.
 */
function safeEval(expr: string): number {
  const transformed = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\^/g, '**')          // display uses ^, JS uses **
    .replace(/π/g, String(Math.PI))
    // Replace standalone 'e' (Euler's number) — not followed by a digit (scientific notation)
    // and not preceded by a digit followed by nothing (handled by lookahead below)
    .replace(/(?<![0-9])e(?![0-9+\-])/g, String(Math.E));

  // eslint-disable-next-line no-new-func
  const result = Function('"use strict"; return (' + transformed + ')')() as number;
  if (typeof result !== 'number') throw new Error('Not a number');
  return result;
}

function formatResult(n: number): string {
  if (!Number.isFinite(n) || Number.isNaN(n)) return 'Error';
  const s = parseFloat(n.toPrecision(10)).toString();
  return s;
}

/* ─────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────── */

type AngleMode = 'DEG' | 'RAD';

interface CalcState {
  display: string;       // what the user sees (uses ^ for power, ÷ ×)
  angleMode: AngleMode;
  memory: number;
  justEvaluated: boolean; // after = or a unary fn, next digit starts fresh
  isShift: boolean;       // 2nd / shift mode (for inverses)
  error: boolean;
}

const INIT: CalcState = {
  display: '0',
  angleMode: 'DEG',
  memory: 0,
  justEvaluated: false,
  isShift: false,
  error: false
};

const OPERATORS = ['+', '-', '×', '÷', '^'];

function endsWithOperator(s: string): boolean {
  return OPERATORS.some((op) => s.endsWith(op));
}

/* ─────────────────────────────────────────────────────────────
   Calculator logic
   ────────────────────────────────────────────────────────────── */

function processKey(state: CalcState, key: string): CalcState {
  const { display, angleMode, memory, justEvaluated, isShift } = state;

  const toRad = (v: number) => (angleMode === 'DEG' ? v * DEG_TO_RAD : v);
  const fromRad = (v: number) => (angleMode === 'DEG' ? v / DEG_TO_RAD : v);

  /** Apply a unary function to the current display value and show result. */
  const applyUnary = (fn: (v: number) => number): CalcState => {
    try {
      const val = safeEval(display);
      const res = fn(val);
      if (!Number.isFinite(res) || Number.isNaN(res)) {
        return { ...state, display: 'Error', error: true, isShift: false };
      }
      return {
        ...state,
        display: formatResult(res),
        justEvaluated: true,
        isShift: false,
        error: false
      };
    } catch {
      return { ...state, display: 'Error', error: true, isShift: false };
    }
  };

  /** Append a token (digit, constant, paren) to the display. */
  const append = (token: string): CalcState => {
    if (state.error) {
      // After an error, any input starts fresh
      if (/[0-9]/.test(token)) return { ...state, display: token, error: false };
      return state;
    }
    // After = or a unary result: a digit/constant starts a new expression
    if (justEvaluated && /[0-9π(]/.test(token)) {
      return { ...state, display: token, justEvaluated: false };
    }
    // Replace leading zero only for plain digits
    const next =
      display === '0' && /^[0-9]$/.test(token) ? token : display + token;
    return { ...state, display: next, justEvaluated: false, error: false };
  };

  /** Append an infix operator (+, -, ×, ÷, ^). */
  const appendOp = (op: string): CalcState => {
    if (state.error) return state;
    let base = display;
    // If the display already ends with an operator, replace it
    if (endsWithOperator(base)) {
      base = base.slice(0, -1);
    }
    return { ...state, display: base + op, justEvaluated: false };
  };

  if (state.error && key !== 'AC') {
    // Only AC works when in error state
    if (key === 'AC') return { ...INIT, angleMode, memory };
    return state;
  }

  switch (key) {
    /* ── Digits ── */
    case '0': case '1': case '2': case '3': case '4':
    case '5': case '6': case '7': case '8': case '9':
      return append(key);

    /* ── Decimal point ── */
    case '.': {
      if (state.error) return state;
      if (justEvaluated) return { ...state, display: '0.', justEvaluated: false };
      // Only add a dot if the current number segment doesn't already have one
      const lastSegment = display.split(/[+\-×÷^(]/).pop() ?? '';
      if (lastSegment.includes('.')) return state;
      return { ...state, display: display + '.', justEvaluated: false };
    }

    /* ── Infix operators ── */
    case '+': return appendOp('+');
    case '-': return appendOp('-');
    case '×': return appendOp('×');
    case '÷': return appendOp('÷');
    case '^': return appendOp('^');    // xʸ maps to this

    /* ── Parentheses ── */
    case '(': return append('(');
    case ')': return append(')');

    /* ── Percent ── */
    case '%': return applyUnary((v) => v / 100);

    /* ── Constants ── */
    case 'π': return append('π');
    case 'e': return append('e');

    /* ── Equals ── */
    case '=': {
      try {
        const val = safeEval(display);
        if (!Number.isFinite(val) || Number.isNaN(val)) {
          return { ...state, display: 'Error', error: true };
        }
        return { ...state, display: formatResult(val), justEvaluated: true, error: false };
      } catch {
        return { ...state, display: 'Error', error: true };
      }
    }

    /* ── Clear / backspace ── */
    case 'AC':
      return { ...INIT, angleMode, memory };
    case 'DEL': {
      if (justEvaluated || display === '0') return { ...state, display: '0', justEvaluated: false };
      const next = display.length > 1 ? display.slice(0, -1) : '0';
      return { ...state, display: next };
    }

    /* ── Angle mode ── */
    case 'DEG': return { ...state, angleMode: 'DEG' };
    case 'RAD': return { ...state, angleMode: 'RAD' };

    /* ── Shift / 2nd ── */
    case 'SHIFT': return { ...state, isShift: !isShift };

    /* ── Trig ── */
    case 'sin':
      return isShift
        ? applyUnary((v) => fromRad(Math.asin(v)))
        : applyUnary((v) => Math.sin(toRad(v)));
    case 'cos':
      return isShift
        ? applyUnary((v) => fromRad(Math.acos(v)))
        : applyUnary((v) => Math.cos(toRad(v)));
    case 'tan':
      return isShift
        ? applyUnary((v) => fromRad(Math.atan(v)))
        : applyUnary((v) => Math.tan(toRad(v)));

    /* ── Log / exp ── */
    case 'log':
      return isShift
        ? applyUnary((v) => Math.pow(10, v))
        : applyUnary((v) => Math.log10(v));
    case 'ln':
      return isShift
        ? applyUnary((v) => Math.exp(v))
        : applyUnary((v) => Math.log(v));

    /* ── Powers / roots ── */
    case 'x²': return applyUnary((v) => v * v);
    case 'x³': return applyUnary((v) => v * v * v);
    case 'xʸ': return appendOp('^');   // enter base, press xʸ, enter exponent, press =
    case '√':
      return isShift
        ? applyUnary((v) => v * v)
        : applyUnary((v) => Math.sqrt(v));
    case '∛': return applyUnary((v) => Math.cbrt(v));
    case '1/x': return applyUnary((v) => 1 / v);
    case '|x|': return applyUnary((v) => Math.abs(v));
    case 'n!':
      return applyUnary((v) => {
        if (!Number.isInteger(v) || v < 0 || v > 170) throw new Error('Domain error');
        let r = 1;
        for (let i = 2; i <= v; i++) r *= i;
        return r;
      });

    /* ── Memory ── */
    case 'MC': return { ...state, memory: 0 };
    case 'MR': {
      const ms = formatResult(memory);
      if (justEvaluated || display === '0') return { ...state, display: ms, justEvaluated: false };
      return { ...state, display: display + ms };
    }
    case 'M+': {
      try { return { ...state, memory: memory + safeEval(display) }; } catch { return state; }
    }
    case 'M-': {
      try { return { ...state, memory: memory - safeEval(display) }; } catch { return state; }
    }
    case 'MS': {
      try { return { ...state, memory: safeEval(display) }; } catch { return state; }
    }

    default: return state;
  }
}

/* ─────────────────────────────────────────────────────────────
   Button layout
   ────────────────────────────────────────────────────────────── */

type BtnVariant = 'digit' | 'op' | 'fn' | 'eq' | 'clear' | 'mem' | 'shift';

interface BtnDef {
  key: string;
  label?: string;
  shiftLabel?: string;
  variant: BtnVariant;
  span?: number; // flex grow factor (default 1)
}

// Each row MUST have the same total span = 8 so columns stay aligned.
const BUTTONS: BtnDef[][] = [
  // Row 1 — 8 equal cols
  [
    { key: 'SHIFT',  label: '2nd', variant: 'shift' },
    { key: 'DEG',   variant: 'fn' },
    { key: 'RAD',   variant: 'fn' },
    { key: 'MC',    variant: 'mem' },
    { key: 'MR',    variant: 'mem' },
    { key: 'MS',    variant: 'mem' },
    { key: 'M+',    variant: 'mem' },
    { key: 'M-',    variant: 'mem' }
  ],
  // Row 2 — 8 trig/fn cols
  [
    { key: 'sin',  shiftLabel: 'sin⁻¹', variant: 'fn' },
    { key: 'cos',  shiftLabel: 'cos⁻¹', variant: 'fn' },
    { key: 'tan',  shiftLabel: 'tan⁻¹', variant: 'fn' },
    { key: 'log',  shiftLabel: '10ˣ',   variant: 'fn' },
    { key: 'ln',   shiftLabel: 'eˣ',    variant: 'fn' },
    { key: 'n!',   variant: 'fn' },
    { key: '|x|',  variant: 'fn' },
    { key: '1/x',  variant: 'fn' }
  ],
  // Row 3 — 8 power/constant cols
  [
    { key: 'x²',  variant: 'fn' },
    { key: 'x³',  variant: 'fn' },
    { key: 'xʸ',  shiftLabel: 'xʸ', variant: 'fn' },
    { key: '√',   shiftLabel: 'x²', variant: 'fn' },
    { key: '∛',   variant: 'fn' },
    { key: 'π',   variant: 'fn' },
    { key: 'e',   variant: 'fn' },
    { key: '%',   variant: 'fn' }
  ],
  // Row 4 — parens + clear + operators (8 cols)
  [
    { key: '(',   variant: 'op' },
    { key: ')',   variant: 'op' },
    { key: 'AC',  variant: 'clear' },
    { key: 'DEL', label: '⌫', variant: 'clear' },
    { key: '÷',   variant: 'op' },
    { key: '×',   variant: 'op' },
    { key: '-',   variant: 'op' },
    { key: '+',   variant: 'op' }
  ],
  // Row 5 — 7 8 9 | 4 5 6 | 1 2  (8 cols)
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
  // Row 6 — 3(1) + 0(2) + .(1) + =(2) + 3 = 8 … but 4 items × flex = wrong
  // FIX: use span to make total = 8: 3=1, 0=2, .=1, =3 → 1+2+1+3=7 ✗
  // Better: give = span 2 and 0 span 2 → 1+2+1+2=6, add 2 more: keep explicit widths
  // SOLUTION: 8 cols = 3(1) + 0(3) + .(1) + =(3) → 1+3+1+3=8 ✓
  [
    { key: '3', variant: 'digit', span: 1 },
    { key: '0', variant: 'digit', span: 3 },
    { key: '.', variant: 'digit', span: 1 },
    { key: '=', variant: 'eq',    span: 3 }
  ]
];

const VARIANT_CLASSES: Record<BtnVariant, string> = {
  digit: 'bg-bg-raised border-border text-text hover:bg-bg-overlay hover:border-border-hover font-mono text-[14px] font-semibold',
  op:    'bg-accent-faint border-accent/30 text-accent hover:bg-accent/20 font-semibold text-[15px]',
  fn:    'bg-bg-overlay border-border text-text-muted hover:bg-bg-raised hover:text-text text-[11px] font-medium',
  eq:    'bg-accent border-accent text-accent-contrast hover:opacity-90 font-bold text-[16px]',
  clear: 'bg-danger-faint border-danger/30 text-danger hover:bg-danger/20 font-semibold text-[12px]',
  mem:   'bg-guess-faint border-guess/30 text-guess hover:bg-guess/20 text-[10.5px] font-medium',
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
  const dragState = useRef<{ active: boolean; ox: number; oy: number }>({
    active: false, ox: 0, oy: 0
  });

  // Reset calc on open
  useEffect(() => {
    if (open) setCalc((s) => ({ ...INIT, angleMode: s.angleMode, memory: s.memory }));
  }, [open]);

  // Set initial position once
  useEffect(() => {
    if (open && pos === null) {
      setPos({
        x: Math.max(8, window.innerWidth - 416),
        y: Math.max(8, Math.round((window.innerHeight - 580) / 2))
      });
    }
  }, [open, pos]);

  const press = useCallback((key: string) => {
    setCalc((prev) => processKey(prev, key));
  }, []);

  // ── Keyboard support ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      const map: Record<string, string> = {
        '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
        '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
        '.': '.', '+': '+', '-': '-', '*': '×', '/': '÷',
        '^': '^', Enter: '=', '=': '=', Backspace: 'DEL', Delete: 'AC',
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

  // ── Drag logic with proper cleanup ──
  const startDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragState.current = {
      active: true,
      ox: e.clientX - (pos?.x ?? 0),
      oy: e.clientY - (pos?.y ?? 0)
    };

    const move = (me: MouseEvent) => {
      if (!dragState.current.active) return;
      setPos({
        x: Math.max(0, Math.min(me.clientX - dragState.current.ox, window.innerWidth - 408)),
        y: Math.max(0, Math.min(me.clientY - dragState.current.oy, window.innerHeight - 80))
      });
    };

    const up = () => {
      dragState.current.active = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [pos]);

  if (!open || pos === null) return null;

  const displayText = calc.display.length > 22
    ? '…' + calc.display.slice(-21)
    : calc.display;

  return (
    <div
      role="dialog"
      aria-label="Scientific calculator"
      aria-modal="false"
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 70 }}
      className="w-[400px] rounded-xl border border-border bg-bg-raised shadow-lift select-none"
    >
      {/* ── Drag handle / header ── */}
      <div
        className="flex cursor-grab items-center justify-between gap-2 rounded-t-xl border-b border-border bg-bg-overlay/60 px-3 py-2 active:cursor-grabbing"
        onMouseDown={startDrag}
      >
        <div className="flex items-center gap-1.5 text-text-muted pointer-events-none">
          <GripHorizontal size={13} />
          <Calculator size={13} />
          <span className="text-[12px] font-semibold text-text">Scientific Calculator</span>
        </div>
        <div className="flex items-center gap-2 pointer-events-none">
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
          {calc.isShift && (
            <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-contrast">
              2nd
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close calculator"
          className="pointer-events-auto rounded p-1 text-text-faint transition-colors hover:bg-bg-overlay hover:text-text"
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Display ── */}
      <div className="bg-bg px-4 py-3 border-b border-border">
        <div
          className={cn(
            'min-h-[34px] break-all text-right font-mono text-[22px] font-semibold leading-tight',
            calc.error ? 'text-danger' : 'text-text'
          )}
          aria-live="polite"
          aria-atomic="true"
          aria-label={`Calculator display: ${displayText}`}
        >
          {displayText}
        </div>
        <div className="mt-0.5 h-3.5 text-right font-mono text-[11px] text-text-faint">
          {calc.isShift ? '2nd functions active' : ''}
        </div>
      </div>

      {/* ── Buttons ── */}
      <div className="flex flex-col gap-1 p-2">
        {BUTTONS.map((row, ri) => (
          <div key={ri} className="flex gap-1">
            {row.map((btn) => {
              const span = btn.span ?? 1;
              const isDegActive = btn.key === 'DEG' && calc.angleMode === 'DEG';
              const isRadActive = btn.key === 'RAD' && calc.angleMode === 'RAD';
              const isShiftActive = btn.key === 'SHIFT' && calc.isShift;
              const isActive = isDegActive || isRadActive || isShiftActive;

              const label =
                calc.isShift && btn.shiftLabel ? btn.shiftLabel : (btn.label ?? btn.key);

              return (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => press(btn.key)}
                  aria-label={label}
                  aria-pressed={
                    btn.key === 'SHIFT' || btn.key === 'DEG' || btn.key === 'RAD'
                      ? isActive
                      : undefined
                  }
                  style={{ flex: span }}
                  className={cn(
                    'rounded border py-2 transition-all active:scale-95',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    btn.variant === 'shift'
                      ? isActive
                        ? 'border-accent bg-accent text-accent-contrast'
                        : 'border-border bg-bg-overlay text-text-muted hover:bg-bg-raised hover:text-text'
                      : VARIANT_CLASSES[btn.variant],
                    (isDegActive || isRadActive) && 'ring-1 ring-accent'
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Trigger button shown in the session toolbars
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
      id="pyq-calculator-trigger"
      onClick={onClick}
      aria-label={active ? 'Close scientific calculator' : 'Open scientific calculator'}
      aria-expanded={active}
      title="Scientific Calculator (keyboard: digits, +−×÷^, Enter, Backspace)"
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
