import { Link } from 'react-router-dom';
import PageHeader from '@/components/layout/PageHeader';

const destinations = {
  review: [
    [
      '/skills',
      'Skill repairs',
      'Contrast checks, targeted practice, and delayed application evidence.'
    ],
    ['/reattempts', 'Due retrieval', 'Reattempt your saved questions before revealing answers.'],
    ['/concept-review', 'Concept recall', 'Retrieve an idea before opening the explanation.'],
    [
      '/memory?view=followups',
      'Practice follow-ups',
      'Continue prepared work and inspect scheduled checks.'
    ],
    ['/mocks', 'Mock debriefs', 'Inspect a test and choose your next priorities.'],
    ['/weekly-review', 'Weekly focus', 'Choose one upstream difficulty for the week.'],
    ['/journal', 'Journal', 'Review the reasoning behind individual questions.'],
    ['/workflows', 'Saved workflows', 'Resume an unfinished learning workflow.']
  ],
  knowledge: [
    [
      '/learning-library',
      'Saved discussions',
      'Find explanations, examples, and their original sources.'
    ],
    ['/memory', 'Search study history', 'Search across your recorded learning and attempts.'],
    ['/formulas', 'Formulas', 'Keep expressions connected to their conditions and use.'],
    ['/topper-notes', 'Study notes', 'Open the existing topic reference library.'],
    ['/capture', 'Capture', 'Bring a question or screenshot into your local workspace.'],
    ['/revision-pack', 'Revision pack', 'Gather linked material for focused revision.'],
    ['/trigger-drill', 'Recognition cues', 'Practise recognizing when a method applies.'],
    [
      '/linear-algebra-lab',
      'Linear algebra lab',
      'Explore linear algebra through the existing visual tools.'
    ]
  ],
  progress: [
    [
      '/skills',
      'Skill evidence',
      'Separate fresh application, delayed checks, and missing conditions.'
    ],
    ['/readiness', 'Exam readiness', 'Inspect qualified exam evidence and its limits.'],
    ['/syllabus', 'Syllabus coverage', 'Distinguish studied topics from gaps in coverage.'],
    [
      '/calibration',
      'Confidence calibration',
      'Compare reported confidence with recorded answers.'
    ],
    ['/heatmap', 'Topic history', 'Explore your existing topic-level practice evidence.'],
    ['/patterns', 'Recurring patterns', 'Inspect supported patterns in your mistakes.'],
    [
      '/progress/overview',
      'Detailed overview',
      'Open the full existing dashboard and historical charts.'
    ]
  ]
};
export default function StudyHub({ kind }: { kind: keyof typeof destinations }) {
  const title = { review: 'Review', knowledge: 'Knowledge', progress: 'Progress' }[kind];
  return (
    <div className="space-y-5">
      <PageHeader
        compact
        title={title}
        description={
          {
            review: 'Retrieve, repair, and check what changed.',
            knowledge: 'Your sources, explanations, and learning history.',
            progress: 'Inspect what the evidence supports and what remains untested.'
          }[kind]
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {destinations[kind].map(([href, label, detail]) => (
          <Link
            key={href}
            to={href}
            className="rounded-lg border border-border bg-bg-raised p-4 hover:border-accent"
          >
            <h2 className="font-display text-lg font-semibold">{label}</h2>
            <p className="mt-1 text-sm text-text-muted">{detail}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
