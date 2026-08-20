import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  CircleDot,
  Clock3,
  Fingerprint,
  Focus,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import Brand, { BrandMark } from '@/components/shared/Brand';
import ThemeToggle from '@/components/shared/ThemeToggle';
import { EXAM_DATE_DEFAULT } from '@/lib/constants';
import '@/landing.css';

const EVIDENCE = [
  {
    code: 'W-C',
    detail: 'concept',
    subject: 'Theory of Computation',
    className: 'landing-evidence--one'
  },
  {
    code: 'RBS',
    detail: 'over target',
    subject: 'Algorithms',
    className: 'landing-evidence--two'
  },
  {
    code: 'RBG',
    detail: 'could not justify',
    subject: 'Computer Networks',
    className: 'landing-evidence--three'
  },
  {
    code: 'W-R',
    detail: 'reading',
    subject: 'Operating Systems',
    className: 'landing-evidence--four'
  },
  {
    code: 'W-E',
    detail: 'execution',
    subject: 'Engineering Mathematics',
    className: 'landing-evidence--five'
  }
] as const;

const DIAGNOSIS = [
  { label: 'Outcome', value: 'RBS · right, but slow', tone: 'warn' },
  { label: 'Pattern', value: 'Cache address breakdown', tone: 'cobalt' },
  { label: 'Trigger', value: 'Index and offset looked interchangeable', tone: 'violet' },
  { label: 'Root cause', value: 'Representation', tone: 'accent' }
] as const;

const RECALL_STAGES = [
  { day: 'D3', title: 'Interrupt the path', body: 'Solve again before the wrong route settles.' },
  {
    day: 'D10',
    title: 'Rebuild it cleanly',
    body: 'Recall the method without recognition doing the work.'
  },
  {
    day: 'D30',
    title: 'Prove it stayed',
    body: 'One final retrieval before the evidence graduates.'
  }
] as const;

function Reveal({
  children,
  className,
  delay = 0
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.22 }}
      transition={{ duration: 0.72, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function SectionHeading({
  label,
  title,
  body,
  light = false
}: {
  label: string;
  title: React.ReactNode;
  body: string;
  light?: boolean;
}) {
  return (
    <Reveal className="landing-section-heading">
      <p className={`landing-kicker${light ? ' landing-kicker--light' : ''}`}>{label}</p>
      <h2>{title}</h2>
      <p className={light ? 'landing-copy landing-copy--light' : 'landing-copy'}>{body}</p>
    </Reveal>
  );
}

function FloatingEvidence() {
  return (
    <div className="landing-evidence-field" aria-hidden="true">
      {EVIDENCE.map((item) => (
        <div key={item.code} className={`landing-evidence ${item.className}`}>
          <span>{item.code}</span>
          <div>
            <strong>{item.detail}</strong>
            <small>{item.subject}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function DiagnosticSheet() {
  const reduceMotion = useReducedMotion();
  return (
    <Reveal className="landing-sheet-wrap" delay={0.08}>
      <motion.div
        className="landing-sheet-shadow landing-sheet-shadow--back"
        initial={reduceMotion ? false : { rotate: 0, x: 0, y: 0 }}
        whileInView={{ rotate: -4, x: -24, y: 18 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden="true"
      />
      <motion.div
        className="landing-sheet-shadow landing-sheet-shadow--middle"
        initial={reduceMotion ? false : { rotate: 0, x: 0, y: 0 }}
        whileInView={{ rotate: 3, x: 20, y: 10 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ duration: 0.9, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden="true"
      />
      <article className="landing-sheet">
        <header className="landing-sheet__header">
          <div>
            <span>Practice evidence</span>
            <strong>Computer Organization</strong>
          </div>
          <div className="landing-sheet__time">
            <Clock3 size={14} aria-hidden="true" />
            <span>02:41</span>
          </div>
        </header>

        <div className="landing-question">
          <span>Question 17 · 2 marks</span>
          <p>
            The solve was correct. The address split took nearly twice the target time. What
            actually slowed it down?
          </p>
          <div className="landing-question__marks" aria-hidden="true">
            <i />
            <i />
            <i className="is-selected" />
            <i />
          </div>
        </div>

        <div className="landing-diagnosis" aria-label="Example question diagnosis">
          {DIAGNOSIS.map((item, index) => (
            <motion.div
              key={item.label}
              className={`landing-diagnosis__row landing-diagnosis__row--${item.tone}`}
              initial={reduceMotion ? false : { opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.52, delay: 0.16 + index * 0.1 }}
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </motion.div>
          ))}
        </div>

        <footer className="landing-sheet__footer">
          <div>
            <RotateCcw size={15} aria-hidden="true" />
            <span>Returns in 3 days</span>
          </div>
          <span>4 tags · about 30 sec</span>
        </footer>
      </article>
    </Reveal>
  );
}

function RecallOrbit() {
  const reduceMotion = useReducedMotion();
  return (
    <Reveal className="landing-orbit-wrap">
      <div className="landing-orbit" aria-hidden="true">
        <div className="landing-orbit__halo" />
        <div className="landing-orbit__ring landing-orbit__ring--thirty">
          <span className="landing-orbit__node landing-orbit__node--thirty">D30</span>
        </div>
        <div className="landing-orbit__ring landing-orbit__ring--ten">
          <span className="landing-orbit__node landing-orbit__node--ten">D10</span>
        </div>
        <div className="landing-orbit__ring landing-orbit__ring--three">
          <span className="landing-orbit__node landing-orbit__node--three">D3</span>
        </div>
        <div className="landing-orbit__core">
          <BrandMark decorative className="landing-orbit__mark" />
          <span>one mistake</span>
          <strong>three clean recalls</strong>
        </div>
      </div>
      <div className="landing-recall-list">
        {RECALL_STAGES.map((stage, index) => (
          <motion.div
            className="landing-recall-row"
            key={stage.day}
            initial={reduceMotion ? false : { opacity: 0, x: 22 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.7 }}
            transition={{ duration: 0.52, delay: index * 0.12 }}
          >
            <span>{stage.day}</span>
            <div>
              <strong>{stage.title}</strong>
              <p>{stage.body}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </Reveal>
  );
}

function SurfaceCard() {
  const reduceMotion = useReducedMotion();
  const points = [
    { cx: 44, cy: 67, tone: 'danger' },
    { cx: 100, cy: 52, tone: 'warn' },
    { cx: 159, cy: 58, tone: 'danger' },
    { cx: 219, cy: 34, tone: 'violet' },
    { cx: 279, cy: 40, tone: 'warn' },
    { cx: 340, cy: 22, tone: 'success' }
  ];

  return (
    <Reveal className="landing-surface-card" delay={0.08}>
      <div className="landing-surface-card__top">
        <div>
          <span className="landing-ui-label">Mistake surface</span>
          <strong>17 open</strong>
        </div>
        <span className="landing-surface-card__movement">−6 this month</span>
      </div>

      <div className="landing-surface-chart">
        <div className="landing-surface-chart__axis">
          <span>noisy</span>
          <span>clear</span>
        </div>
        <svg viewBox="0 0 384 96" role="img" aria-label="Mistake surface trending down">
          <path className="landing-surface-chart__grid" d="M12 76H372M12 48H372M12 20H372" />
          <motion.path
            className="landing-surface-chart__area"
            d="M12 74 C48 72, 72 47, 104 52 S157 65, 184 49 S231 27, 260 39 S318 40, 372 17 L372 88 L12 88 Z"
            initial={reduceMotion ? false : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.8 }}
          />
          <motion.path
            className="landing-surface-chart__line"
            d="M12 74 C48 72, 72 47, 104 52 S157 65, 184 49 S231 27, 260 39 S318 40, 372 17"
            initial={reduceMotion ? false : { pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 1.35, ease: [0.22, 1, 0.36, 1] }}
          />
          {points.map((point, index) => (
            <motion.circle
              key={`${point.cx}-${point.cy}`}
              className={`landing-surface-chart__point landing-surface-chart__point--${point.tone}`}
              cx={point.cx}
              cy={point.cy}
              r="4"
              initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 18,
                delay: 0.25 + index * 0.08
              }}
            />
          ))}
        </svg>
        <div className="landing-surface-chart__months">
          <span>Aug</span>
          <span>Sep</span>
          <span>Oct</span>
          <span>Nov</span>
          <span>Dec</span>
        </div>
      </div>

      <div className="landing-surface-card__grid">
        <div className="landing-upstream">
          <span className="landing-ui-label">Upstream weakness · this week</span>
          <p>Translating a verbal constraint into the right representation.</p>
          <div>
            <Focus size={15} aria-hidden="true" />
            <span>One fix, not five</span>
          </div>
        </div>
        <div className="landing-cause-bars">
          <span className="landing-ui-label">Root-cause mix</span>
          {[
            ['Strategy', '68%'],
            ['Reading', '44%'],
            ['Concept', '31%']
          ].map(([label, width], index) => (
            <div className="landing-cause-bar" key={label}>
              <div>
                <span>{label}</span>
                <small>{width}</small>
              </div>
              <i>
                <motion.b
                  initial={reduceMotion ? false : { width: 0 }}
                  whileInView={{ width }}
                  viewport={{ once: true, amount: 0.8 }}
                  transition={{ duration: 0.8, delay: 0.12 + index * 0.1 }}
                />
              </i>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

function CausalThread() {
  const path =
    'M680 160 C810 310 440 410 520 690 C590 930 720 920 628 1190 C540 1450 350 1470 420 1770 C476 2015 666 2030 595 2310 C520 2600 382 2670 470 2940 C550 3190 720 3280 610 3540 C530 3730 395 3820 500 4060 C552 4180 580 4300 505 4480';

  return (
    <svg
      className="landing-causal-thread"
      viewBox="0 0 1000 4600"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className="landing-causal-thread__ghost" d={path} />
      <path className="landing-causal-thread__live" d={path} />
    </svg>
  );
}

export default function Landing() {
  const reduceMotion = useReducedMotion();
  const daysLeft = Math.max(0, differenceInCalendarDays(parseISO(EXAM_DATE_DEFAULT), new Date()));

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'HETU — Find the reason behind every mistake';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="landing-page">
      <a className="landing-skip" href="#landing-main">
        Skip to the method
      </a>
      <CausalThread />

      <header className="landing-nav">
        <Link to="/" aria-label="HETU home" className="landing-nav__brand">
          <Brand size="sm" />
        </Link>
        <nav aria-label="Landing page">
          <a href="#method">The method</a>
          <a href="#reattempt">Re-attempts</a>
          <a href="#evidence">Evidence</a>
        </nav>
        <div className="landing-nav__actions">
          <span className="landing-countdown">T−{daysLeft}d</span>
          <ThemeToggle className="landing-theme-toggle" />
          <Link to="/auth" className="landing-sign-in">
            Sign in
          </Link>
          <Link to="/request-access" className="landing-nav-cta">
            Request access <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main id="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero__grid" aria-hidden="true" />
          <div className="landing-hero__glow" aria-hidden="true" />
          <FloatingEvidence />

          <motion.div className="landing-hero__content">
            <motion.div
              className="landing-hero__mark-wrap"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.88, rotate: -5 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            >
              <BrandMark decorative className="landing-hero__mark" />
              <span className="landing-hero__mark-ring" aria-hidden="true" />
            </motion.div>
            <motion.p
              className="landing-kicker"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.12 }}
            >
              A mistake-surface instrument for GATE CS
            </motion.p>
            <motion.h1
              id="landing-title"
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.78, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              Your mistakes
              <span>are not random.</span>
            </motion.h1>
            <motion.p
              className="landing-hero__lede"
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.72, delay: 0.26 }}
            >
              HETU traces every wrong, slow, or guessed solve back to its cause—then brings it back
              when recall can change the outcome.
            </motion.p>
            <motion.div
              className="landing-hero__actions"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.68, delay: 0.34 }}
            >
              <Link to="/request-access" className="landing-primary-cta">
                Trace my weak spots <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <a href="#method" className="landing-text-link">
                See the method <ArrowDown size={15} aria-hidden="true" />
              </a>
            </motion.div>
            <motion.div
              className="landing-hero__proof"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.5 }}
            >
              <span>
                <Fingerprint size={14} /> Local-first
              </span>
              <span>
                <CircleDot size={14} /> No streaks
              </span>
              <span>
                <Focus size={14} /> One fix per week
              </span>
            </motion.div>
          </motion.div>

          <div className="landing-scroll-cue" aria-hidden="true">
            <span>trace the cause</span>
            <i>
              <b />
            </i>
          </div>
        </section>

        <section className="landing-section landing-method">
          <div id="method" className="landing-section__inner landing-method__grid">
            <div className="landing-method__copy">
              <SectionHeading
                label="01 · Capture the signal"
                title={
                  <>
                    A solved question is only the <em>surface.</em>
                  </>
                }
                body="The useful part comes next. Four quick tags turn a vague feeling—‘I knew this’—into evidence you can revisit and compare."
              />
              <Reveal className="landing-principle">
                <span>30 sec</span>
                <p>
                  Outcome, pattern, trigger, root cause. Short enough to do after every question;
                  specific enough to reveal repetition.
                </p>
              </Reveal>
            </div>
            <DiagnosticSheet />
          </div>
        </section>

        <section className="landing-section landing-reattempt">
          <div id="reattempt" className="landing-section__inner landing-reattempt__grid">
            <SectionHeading
              light
              label="02 · Return with intent"
              title={
                <>
                  A mistake should move through time—not live in a <em>graveyard.</em>
                </>
              }
              body="Anything wrong, slow, or guessed enters a quiet recall ladder. Each return asks for a cleaner reconstruction, not a familiar-looking answer."
            />
            <RecallOrbit />
          </div>
        </section>

        <section className="landing-section landing-evidence-section">
          <div id="evidence" className="landing-section__inner landing-evidence-section__grid">
            <SurfaceCard />
            <div className="landing-evidence-section__copy">
              <SectionHeading
                label="03 · Compress the surface"
                title={
                  <>
                    The mess becomes a shape you can <em>act on.</em>
                  </>
                }
                body="Across subjects and sessions, HETU connects repeated causes. Your dashboard orders today’s work and your weekly review chooses one upstream weakness to fix."
              />
              <Reveal className="landing-evidence-notes">
                <div>
                  <Check size={16} />
                  <span>Due work rises to the top.</span>
                </div>
                <div>
                  <Check size={16} />
                  <span>Your own tags explain why.</span>
                </div>
                <div>
                  <Check size={16} />
                  <span>No leaderboard decides what matters.</span>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="landing-section landing-manifesto">
          <div className="landing-manifesto__field" aria-hidden="true">
            <span>W-C</span>
            <span>RBS</span>
            <span>W-R</span>
            <span>RBG</span>
            <span>W-E</span>
          </div>
          <Reveal className="landing-manifesto__content">
            <Sparkles size={22} aria-hidden="true" />
            <p>
              The goal is not to <em>feel</em> prepared.
            </p>
            <h2>The goal is to have evidence.</h2>
            <span>
              A quiet record of what failed, what changed, and what you can now retrieve cleanly.
            </span>
          </Reveal>
        </section>

        <section className="landing-section landing-final">
          <div className="landing-final__mark" aria-hidden="true">
            <BrandMark decorative />
          </div>
          <Reveal className="landing-final__content">
            <p className="landing-kicker">GATE 2027 · AIR &lt; 100</p>
            <h2>
              Find the reason.
              <br />
              Change the outcome.
            </h2>
            <p>
              Start with five real questions. Tag them honestly. Let the evidence decide what
              deserves another look.
            </p>
            <div className="landing-final__actions">
              <Link to="/request-access" className="landing-primary-cta">
                Request access <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link to="/auth" className="landing-text-link">
                I already have an invite
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="landing-footer">
        <Brand size="sm" />
        <p>The tool compresses your mistake surface. It does not replace your reasoning.</p>
        <span className="landing-countdown">GATE CS · T−{daysLeft}d</span>
      </footer>
    </div>
  );
}
