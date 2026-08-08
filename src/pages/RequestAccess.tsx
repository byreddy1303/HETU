// Public landing + access-request form. Rendered outside RequireAuth.
// Sells what HETU is in one screen, then lets an outsider ask to join.
// The owner receives a mail and decides from Settings → Access requests.
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { motion } from 'motion/react';
import { useAuth } from '@/hooks/useAuth';
import { EXAM_DATE_DEFAULT } from '@/lib/constants';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { requestAccess } from '@/lib/edge';
import { cn } from '@/lib/utils';
import Brand, { BrandMark } from '@/components/shared/Brand';
import ThemeToggle from '@/components/shared/ThemeToggle';

type FormState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; dedup?: boolean }
  | { kind: 'error'; message: string };

const PURPOSE_MIN = 10;
const PURPOSE_MAX = 500;

export default function RequestAccess() {
  const { status } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [purpose, setPurpose] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [state, setState] = useState<FormState>({ kind: 'idle' });
  const honeypotRef = useRef<HTMLInputElement>(null);

  if (status === 'signed_in') return <Navigate to="/" replace />;

  const daysLeft = differenceInCalendarDays(parseISO(EXAM_DATE_DEFAULT), new Date());
  const purposeLen = purpose.trim().length;
  const purposeValid = purposeLen >= PURPOSE_MIN && purposeLen <= PURPOSE_MAX;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const nameValid = name.trim().length >= 1;
  const canSubmit = state.kind !== 'sending' && nameValid && emailValid && purposeValid;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setState({ kind: 'sending' });
    const res = await requestAccess({
      name: name.trim(),
      email: email.trim(),
      purpose: purpose.trim(),
      website: website.trim()
    });
    if (res.ok) {
      setState({ kind: 'sent', dedup: res.dedup });
      return;
    }
    setState({ kind: 'error', message: res.error });
  }

  return (
    <div className="native-auth-page relative flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center justify-between px-6 py-4">
        <Brand size="sm" />
        <div className="flex items-center gap-3">
          <Link to="/auth" className="u-label hover:text-text">
            I have an invite
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="native-request-grid grid w-full max-w-[960px] grid-cols-1 gap-6 md:grid-cols-[1fr_1fr]">
          {/* Left: what this is */}
          <Pitch daysLeft={daysLeft} />

          {/* Right: form */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="native-auth-panel u-panel relative p-7"
          >
            <span className="u-stamp absolute right-6 top-6">request access</span>
            <div className="u-margin-line">
              <h2 className="font-display text-[22px] font-bold leading-tight tracking-tight text-text">
                Ask to join.
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
                Three fields. Real reply, usually within a day.
              </p>
            </div>

            <div className="u-rule my-5" />

            {state.kind === 'sent' ? (
              <SentPanel dedup={!!state.dedup} onReset={() => setState({ kind: 'idle' })} />
            ) : (
              <form onSubmit={onSubmit} noValidate>
                {/* Honeypot: hidden from users, visible to bots. */}
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: '-10000px',
                    width: '1px',
                    height: '1px',
                    overflow: 'hidden'
                  }}
                >
                  <label htmlFor="ra-website">Website</label>
                  <input
                    ref={honeypotRef}
                    id="ra-website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>

                <Field label="Name" htmlFor="ra-name" hint="What we should call you.">
                  <Input
                    id="ra-name"
                    autoComplete="name"
                    maxLength={80}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={state.kind === 'sending'}
                  />
                </Field>

                <Field label="Email" htmlFor="ra-email" hint="We'll send the invite here.">
                  <Input
                    id="ra-email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={state.kind === 'sending'}
                  />
                </Field>

                <Field
                  label="Why HETU?"
                  htmlFor="ra-purpose"
                  hint={`One paragraph is plenty. ${purposeLen}/${PURPOSE_MAX}`}
                  hintTone={purposeValid || purposeLen === 0 ? 'faint' : 'warn'}
                >
                  <Textarea
                    id="ra-purpose"
                    required
                    rows={5}
                    maxLength={PURPOSE_MAX}
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="What are you preparing for? How do you plan to use a tagging tool?"
                    disabled={state.kind === 'sending'}
                  />
                </Field>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={!canSubmit}
                  className="mt-5 w-full"
                >
                  {state.kind === 'sending' ? 'Sending your request…' : 'Send request'}
                </Button>

                <div className="mt-4 min-h-[18px]" aria-live="polite">
                  {state.kind === 'error' && (
                    <p className="text-xs font-medium text-danger">{state.message}</p>
                  )}
                </div>

                <p className="mt-2 text-[11.5px] leading-relaxed text-text-faint">
                  We store only the fields above and a hash of your IP for anti-spam. No tracking,
                  no analytics, no third-party emails.
                </p>
              </form>
            )}
          </motion.div>
        </div>
      </main>

      <footer className="flex items-center justify-between px-6 py-4">
        <span className="u-label">GATE CS · {EXAM_DATE_DEFAULT}</span>
        <span className="u-num text-xs text-text-muted">
          T−{daysLeft}
          <span className="text-text-faint">d</span>
        </span>
      </footer>
    </div>
  );
}

function Pitch({ daysLeft }: { daysLeft: number }) {
  const bullets = useMemo(
    () => [
      {
        head: 'Tag every question.',
        body: 'Four keystrokes turn a solved question into structured data: outcome, pattern, trigger, root cause.'
      },
      {
        head: 'Re-attempts on their own schedule.',
        body: 'Mistakes come back at D3, D10, D30. Clean each stage and it graduates to mastered.'
      },
      {
        head: 'One fix per week.',
        body: 'The Sunday review lands on a single upstream weakness. Not five. One.'
      },
      {
        head: 'One trusted study buddy, kept focused.',
        body: 'Share questions, discuss approaches, and see presence without turning study into a social feed.'
      }
    ],
    []
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut', delay: 0.05 }}
      className="u-panel relative p-8"
    >
      <div className="u-margin-line">
        <span className="u-label text-accent">find the reason</span>
        <div className="mt-2 flex items-center gap-3">
          <BrandMark className="h-14 w-auto" />
          <h1 className="font-sans text-[32px] font-semibold uppercase leading-none tracking-[0.18em] text-text">
            HETU
          </h1>
        </div>
        <p className="mt-3 text-[14.5px] leading-relaxed text-text-muted">
          Every solved question becomes data.{' '}
          <span className="u-highlight font-medium text-text">
            Compress your mistake surface for GATE 2027.
          </span>
        </p>
      </div>
      <div className="u-rule my-6" />
      <ul className="flex flex-col gap-4">
        {bullets.map((b) => (
          <li key={b.head} className="flex gap-3">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            <div>
              <p className="font-display text-[14px] font-semibold text-text">{b.head}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-muted">{b.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="u-rule my-6" />
      <p className="text-[12px] leading-relaxed text-text-faint">
        HETU is invite-only on purpose: it is a quiet tool built for one demanding use case, not
        an engagement feed. You ask; a human replies. T−
        <span className="u-num text-text-muted">{daysLeft}</span> days to the exam.
      </p>
    </motion.div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  hintTone = 'faint',
  children
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  hintTone?: 'faint' | 'warn';
  children: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="u-label">
        {label}
      </label>
      {children}
      {hint && (
        <p
          className={cn(
            'text-[11.5px]',
            hintTone === 'warn' ? 'text-warn' : 'text-text-faint'
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function SentPanel({ dedup, onReset }: { dedup: boolean; onReset: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="rounded border border-success/30 bg-success/5 px-4 py-4">
        <p className="font-display text-[15px] font-semibold text-success">
          {dedup ? 'Already on the list.' : 'Request received.'}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
          {dedup
            ? 'We already have an open request from this email — a reply is on the way.'
            : 'You’ll get a reply at the email you provided, usually within a day. Approvals come with an invite link that expires in 7 days.'}
        </p>
      </div>
      <div className="mt-5 flex items-center justify-between text-[12px]">
        <Link to="/auth" className="text-accent hover:underline">
          Already have an invite? Sign in
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="text-text-faint hover:text-text-muted"
        >
          Send another request
        </button>
      </div>
    </motion.div>
  );
}
