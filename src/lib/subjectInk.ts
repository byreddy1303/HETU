// Static Tailwind class literals — the scanner must see them whole.
import { canonicalSubjectLabel } from '@/lib/subjects';

export interface SubjectInk {
  text: string;
  dot: string;
  selected: string;
}

const INKS = {
  cobalt: {
    text: 'text-ink-cobalt',
    dot: 'bg-ink-cobalt',
    selected: 'border-ink-cobalt bg-ink-cobalt/10 text-ink-cobalt'
  },
  teal: {
    text: 'text-ink-teal',
    dot: 'bg-ink-teal',
    selected: 'border-ink-teal bg-ink-teal/10 text-ink-teal'
  },
  violet: {
    text: 'text-ink-violet',
    dot: 'bg-ink-violet',
    selected: 'border-ink-violet bg-ink-violet/10 text-ink-violet'
  },
  rose: {
    text: 'text-ink-rose',
    dot: 'bg-ink-rose',
    selected: 'border-ink-rose bg-ink-rose/10 text-ink-rose'
  },
  marigold: {
    text: 'text-ink-marigold',
    dot: 'bg-ink-marigold',
    selected: 'border-ink-marigold bg-ink-marigold/10 text-ink-marigold'
  },
  slate: {
    text: 'text-ink-slate',
    dot: 'bg-ink-slate',
    selected: 'border-ink-slate bg-ink-slate/10 text-ink-slate'
  }
} satisfies Record<string, SubjectInk>;

const SUBJECT_INK: Record<string, SubjectInk> = {
  'Discrete Mathematics': INKS.violet,
  'Engineering Mathematics': INKS.cobalt,
  'Digital Logic': INKS.teal,
  COA: INKS.slate,
  'Programming & DS': INKS.rose,
  Algorithms: INKS.marigold,
  'Theory of Computation': INKS.violet,
  'Compiler Design': INKS.cobalt,
  'Operating Systems': INKS.teal,
  Databases: INKS.slate,
  'Computer Networks': INKS.rose,
  'General Aptitude': INKS.marigold
};

export function subjectInk(subject: string): SubjectInk {
  return SUBJECT_INK[canonicalSubjectLabel(subject)] ?? INKS.slate;
}
