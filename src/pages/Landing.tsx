import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Fingerprint,
  Layers3,
  LockKeyhole,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  ScanLine,
  SlidersHorizontal
} from 'lucide-react';
import Brand from '@/components/shared/Brand';
import ThemeToggle from '@/components/shared/ThemeToggle';
import LearningSculpture from '@/components/shared/LearningSculpture';
import '@/landing.css';

const STAGES = [
  {
    name: 'Practice',
    verb: 'Meet the question.',
    description:
      'Solve with intent. Capture your answer, pace, and confidence while the reasoning is fresh.',
    signal: 'An answer becomes evidence',
    icon: ScanLine,
    color: 'rose'
  },
  {
    name: 'Diagnose',
    verb: 'Find the reason.',
    description:
      'Look beneath right or wrong. Connect a recurring pattern to the cause you can actually change.',
    signal: 'A mistake becomes a connection',
    icon: Fingerprint,
    color: 'gold'
  },
  {
    name: 'Recall',
    verb: 'Make it stay.',
    description:
      'Return without the hints. Rebuild the method, then test your understanding on a fresh problem.',
    signal: 'A return becomes understanding',
    icon: RotateCcw,
    color: 'sage'
  }
] as const;

function QuestionExample() {
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const correct = answer === 8;
  const panelRef = useRef<HTMLDivElement>(null);
  const focusNextPanel = useRef(false);

  function advanceTo(nextStep: number) {
    focusNextPanel.current = true;
    setStep(nextStep);
  }

  useEffect(() => {
    if (focusNextPanel.current) {
      panelRef.current?.focus({ preventScroll: true });
      focusNextPanel.current = false;
    }
  }, [step]);

  return (
    <div className="observatory-example">
      <div className="observatory-example__toolbar">
        <span>
          <span className="observatory-status-dot" /> Interactive example
        </span>
        <span>Computer Organization</span>
      </div>
      <div className="observatory-example__steps" role="group" aria-label="Explore the example">
        {STAGES.map((stage, index) => (
          <button
            type="button"
            key={stage.name}
            aria-pressed={step === index}
            onClick={() => setStep(index)}
          >
            <span>{index + 1}</span>
            {stage.name}
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div
        ref={panelRef}
        className="observatory-example__body"
        role="region"
        aria-label={`${STAGES[step].name} example`}
        tabIndex={-1}
      >
        {step === 0 && (
          <>
            <div className="observatory-question-meta">
              <span>Cache addressing</span>
              <span>Try a quick question</span>
            </div>
            <h3>
              A 16 KiB direct-mapped cache has 64-byte blocks. How many index bits does it need?
            </h3>
            <div
              className="observatory-answers"
              role="group"
              aria-label="Choose the number of index bits"
            >
              {[6, 8, 10, 14].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={answer === value}
                  onClick={() => setAnswer(value)}
                >
                  <span>{value} bits</span>
                  {answer === value && <Check size={16} aria-hidden="true" />}
                </button>
              ))}
            </div>
            <div className="observatory-answer-feedback" aria-live="polite">
              {answer === null ? (
                <p>Your answer is just the beginning. Choose an option to see why.</p>
              ) : (
                <>
                  <p>
                    <strong>{correct ? 'That’s right.' : 'There’s a useful clue here.'}</strong>{' '}
                    {correct
                      ? 'Now make the reasoning explicit.'
                      : 'Separate the block offset from the cache index.'}
                  </p>
                  <button type="button" onClick={() => advanceTo(1)}>
                    Explore the reasoning <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <div className="observatory-question-meta">
              <span>Look beneath the answer</span>
              <Fingerprint size={18} aria-hidden="true" />
            </div>
            <h3>The block size and the number of lines answer different questions.</h3>
            <div
              className="observatory-address"
              aria-label="An address consists of tag bits, 8 index bits, and 6 offset bits"
            >
              <span>
                Tag<small>which block?</small>
              </span>
              <span>
                Index · 8 bits<small>which line?</small>
              </span>
              <span>
                Offset · 6 bits<small>which byte?</small>
              </span>
            </div>
            <p className="observatory-explanation">
              16,384 bytes ÷ 64 bytes = 256 cache lines. Selecting one of 256 lines needs log₂(256)
              = <strong>8 index bits</strong>.
            </p>
            <div className="observatory-cause">
              <Fingerprint size={19} aria-hidden="true" />
              <div>
                <strong>A cause worth checking</strong>
                <p>Confusing a location inside a block with a location inside the cache.</p>
              </div>
            </div>
            <button className="observatory-example-next" type="button" onClick={() => advanceTo(2)}>
              Try a fresh retrieval <ArrowRight size={15} aria-hidden="true" />
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <div className="observatory-question-meta">
              <span>Fresh transfer check</span>
              <RotateCcw size={18} aria-hidden="true" />
            </div>
            <h3>
              Same idea. A different cache.
              <br />
              What changes with 32 KiB and 128-byte blocks?
            </h3>
            <p className="observatory-explanation">
              Before revealing the answer, reconstruct the number of lines and the number of index
              bits.
            </p>
            <button
              className="observatory-recall-reveal"
              type="button"
              aria-expanded={revealed}
              aria-controls="recall-answer"
              onClick={() => setRevealed(!revealed)}
            >
              {revealed ? 'Hide the answer' : 'Reveal the reasoning'}
              <RotateCcw size={16} aria-hidden="true" />
            </button>
            <div id="recall-answer" className="observatory-recall-answer" hidden={!revealed}>
              <strong>Still 8 index bits. Now 7 offset bits.</strong>
              <p>
                32,768 ÷ 128 = 256 lines. The line count stays the same; the larger block needs one
                more offset bit.
              </p>
            </div>
            <p className="observatory-example-note">
              In your workspace, weak answers enter a spaced recall schedule. This example shows the
              method without saving any study data.
            </p>
          </>
        )}
      </div>
      <div className="observatory-example__footer">
        <LockKeyhole size={13} aria-hidden="true" /> A small demonstration. Your actual evidence
        stays yours.
      </div>
    </div>
  );
}

export default function Landing() {
  const [phase, setPhase] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const stage = STAGES[phase];
  const StageIcon = stage.icon;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'HETU — Understand. Rebuild. Remember.';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="observatory-landing">
      <a className="observatory-skip" href="#observatory-main">
        Skip to content
      </a>
      <div className="observatory-header-shell">
        <header className="observatory-nav">
          <Link to="/" aria-label="HETU home" className="observatory-brand">
            <Brand />
          </Link>
          <nav aria-label="Landing page">
            <a href="#method">The learning loop</a>
            <a href="#workspace">Your workspace</a>
          </nav>
          <div className="observatory-nav__actions">
            <ThemeToggle className="observatory-theme" />
            <Link to="/auth" className="observatory-signin">
              Sign in
            </Link>
            <Link to="/request-access" className="observatory-button observatory-button--small">
              Request access <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </header>
      </div>
      <main id="observatory-main" tabIndex={-1}>
        <div className="observatory-opening">
          <section className="observatory-hero" aria-labelledby="observatory-title">
            <div className="observatory-hero__copy">
              <p className="observatory-intro">
                <span className="observatory-status-dot" /> A focused workspace for GATE CS
              </p>
              <h1 id="observatory-title">
                Understand.
                <br />
                Rebuild.
                <br />
                Remember.
              </h1>
              <p className="observatory-hero__description">
                Every mistake has a reason. Find yours, connect the dots, and build understanding
                that stays with you.
              </p>
              <div className="observatory-hero__actions">
                <Link to="/request-access" className="observatory-button">
                  Request access <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <a href="#method" className="observatory-explore">
                  Explore the method <ArrowDown size={15} aria-hidden="true" />
                </a>
              </div>
              <div className="observatory-hero__footnote">
                <span>Built for GATE 2027</span>
                <span>Driven by your evidence</span>
              </div>
            </div>
            <div className="observatory-instrument" data-phase={stage.color}>
              <div className="observatory-instrument__top">
                <span>The learning loop</span>
                {!reduceMotion && (
                  <button
                    type="button"
                    onClick={() => setPaused(!paused)}
                    aria-label={paused ? 'Resume sculpture motion' : 'Pause sculpture motion'}
                    aria-pressed={paused}
                  >
                    {paused ? (
                      <Play size={13} aria-hidden="true" />
                    ) : (
                      <Pause size={13} aria-hidden="true" />
                    )}
                    {paused ? 'Resume' : 'Pause motion'}
                  </button>
                )}
              </div>
              <LearningSculpture className="observatory-sculpture" phase={phase} paused={paused} />
              <span className="observatory-orbit-label observatory-orbit-label--practice">
                Practice<span>Capture the evidence</span>
              </span>
              <span className="observatory-orbit-label observatory-orbit-label--diagnose">
                Diagnose<span>Find the connection</span>
              </span>
              <span className="observatory-orbit-label observatory-orbit-label--recall">
                Recall<span>Rebuild the method</span>
              </span>
              <div className="observatory-instrument__caption" aria-live="polite">
                <span className="observatory-instrument__icon">
                  <StageIcon size={21} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <div>
                  <span>{stage.name}</span>
                  <p>{stage.signal}</p>
                </div>
                <span className="observatory-instrument__index">0{phase + 1} / 03</span>
              </div>
              {!paused && !reduceMotion && (
                <span className="observatory-pointer-hint">
                  <MousePointer2 size={12} aria-hidden="true" /> Move your pointer to explore
                </span>
              )}
            </div>
          </section>
          <div
            className="observatory-stage-rail"
            role="group"
            aria-label="Explore the learning loop"
          >
            {STAGES.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.name}
                  type="button"
                  aria-pressed={phase === index}
                  onClick={() => setPhase(index)}
                >
                  <span className="observatory-stage-number">0{index + 1}</span>
                  <div>
                    <span className="observatory-stage-name">
                      <Icon size={16} aria-hidden="true" />
                      {item.name}
                    </span>
                    <strong>{item.verb}</strong>
                    <p>{item.description}</p>
                  </div>
                  <ArrowRight size={17} className="observatory-stage-arrow" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>

        <section
          className="observatory-method observatory-section"
          id="method"
          aria-labelledby="method-title"
        >
          <div className="observatory-method__copy">
            <span className="observatory-section-symbol">
              <Fingerprint size={26} strokeWidth={1.4} aria-hidden="true" />
            </span>
            <h2 id="method-title">
              The answer is
              <br />
              only the beginning.
            </h2>
            <p>
              Getting a question wrong is a moment. Understanding why is a turning point. HETU helps
              you take the next step, with a clear path from practice to lasting recall.
            </p>
            <div className="observatory-method__note">
              <span />
              <p>
                Try the loop for yourself.
                <br />
                <strong>One question. A little more clarity.</strong>
              </p>
            </div>
            <a className="observatory-inline-link" href="#workspace">
              See what’s in your workspace <ArrowDown size={15} aria-hidden="true" />
            </a>
          </div>
          <QuestionExample />
        </section>

        <section
          id="workspace"
          className="observatory-workspace observatory-section"
          aria-labelledby="workspace-title"
        >
          <div className="observatory-section-head">
            <h2 id="workspace-title">
              A place for your
              <br />
              best thinking.
            </h2>
            <p>
              Everything has a place in the loop.
              <br />
              Choose your next move, then give it your full attention.
            </p>
          </div>
          <div className="observatory-workspace-grid">
            <article className="observatory-feature observatory-feature--practice">
              <div className="observatory-feature__title">
                <BookOpen size={21} strokeWidth={1.5} aria-hidden="true" />
                <span>Focused practice</span>
              </div>
              <div className="observatory-book-scene" aria-hidden="true">
                <div className="observatory-book observatory-book--back">
                  <span>Retrieve</span>
                </div>
                <div className="observatory-book observatory-book--middle">
                  <span>Understand</span>
                </div>
                <div className="observatory-book observatory-book--front">
                  <span>HETU</span>
                  <strong>
                    Think it
                    <br />
                    through.
                  </strong>
                  <span>GATE CS / Practice</span>
                </div>
              </div>
              <h3>Go beyond the answer key.</h3>
              <p>
                Practice from the question bank, record your confidence, and keep full papers
                reserved for exam conditions.
              </p>
            </article>
            <article className="observatory-feature observatory-feature--plan">
              <div className="observatory-feature__title">
                <SlidersHorizontal size={21} strokeWidth={1.5} aria-hidden="true" />
                <span>A deliberate day</span>
              </div>
              <div className="observatory-plan-scene" aria-label="Illustrative daily plan">
                <span className="observatory-preview-label">An example study block</span>
                <div>
                  <span className="observatory-plan-dot" />
                  <span>
                    Recall what’s due<small>Rebuild before you review</small>
                  </span>
                  <RotateCcw size={15} aria-hidden="true" />
                </div>
                <div>
                  <span className="observatory-plan-dot" />
                  <span>
                    Make room to focus<small>Your capacity. Your plan.</small>
                  </span>
                  <Layers3 size={15} aria-hidden="true" />
                </div>
                <div>
                  <span className="observatory-plan-dot" />
                  <span>
                    Practice with intent<small>Turn the next answer into evidence</small>
                  </span>
                  <ArrowRight size={15} aria-hidden="true" />
                </div>
              </div>
              <h3>Know what deserves today.</h3>
              <p>
                Bring due reviews and planned practice into one ordered list, with room for the time
                you actually have.
              </p>
            </article>
            <article className="observatory-feature observatory-feature--insight">
              <div className="observatory-feature__title">
                <Fingerprint size={21} strokeWidth={1.5} aria-hidden="true" />
                <span>Connected evidence</span>
              </div>
              <div className="observatory-connections" aria-hidden="true">
                <svg viewBox="0 0 320 190">
                  <path d="M45 36 Q160 36 160 96M276 40 Q160 40 160 96M42 157 Q160 157 160 96M277 152 Q160 152 160 96" />
                  <circle cx="45" cy="36" r="5" />
                  <circle cx="276" cy="40" r="5" />
                  <circle cx="42" cy="157" r="5" />
                  <circle cx="277" cy="152" r="5" />
                </svg>
                <span className="observatory-connection-core">
                  <Fingerprint size={32} strokeWidth={1.2} />
                </span>
                <span>Patterns</span>
                <span>Triggers</span>
                <span>Outcomes</span>
                <span>Root causes</span>
              </div>
              <h3>See the reason underneath.</h3>
              <p>
                Connect recurring mistakes across sessions and use your weekly review to choose one
                upstream weakness to work on.
              </p>
            </article>
          </div>
        </section>

        <section className="observatory-invitation" aria-labelledby="invitation-title">
          <div className="observatory-invitation__halo" aria-hidden="true" />
          <p>Your next session can change what comes after it.</p>
          <h2 id="invitation-title">
            A little more clarity.
            <br />
            Every time you return.
          </h2>
          <Link to="/request-access" className="observatory-button">
            Request access <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link to="/auth" className="observatory-invitation__signin">
            Already have an account? Sign in
          </Link>
        </section>
      </main>
      <footer className="observatory-footer">
        <Link to="/" aria-label="HETU home">
          <Brand size="sm" />
        </Link>
        <p>Find the reason. Change the outcome.</p>
        <span>Made for thoughtful practice.</span>
      </footer>
    </div>
  );
}
