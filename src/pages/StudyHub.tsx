import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/layout/PageHeader';
import ProgressDashboard from '@/components/progress/ProgressDashboard';

const destinations = {
  review: [
    [
      '/practice-lab',
      'Mistake repairs',
      'Short original exercises, selective reflection, and dated checks.'
    ],
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
      '/practice-lab?tab=traps',
      'My principles',
      'Keep useful corrections linked to the attempts behind them.'
    ],
    [
      '/practice-lab?tab=notebook',
      'Notebook sessions',
      'Log a whole set of external questions together.'
    ],
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
      '/practice-lab?tab=progress',
      'Practice evidence',
      'Original exercise results and your next exam strategy experiment.'
    ],
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
    <div className="space-y-6">
      <PageHeader
        compact
        title={title}
        description={
          {
            review: 'Retrieve, repair, and check what changed.',
            knowledge: 'Your sources, explanations, and learning history.',
            progress: 'Coverage, accuracy and the re-attempt ladder, from your own saved work.'
          }[kind]
        }
      />
      {kind === 'progress' && <ProgressDashboard />}
      {kind === 'progress' && <h2 className="study-section-label">Detailed views</h2>}
      <div className="study-hub">
        {destinations[kind].map(([href, label, detail]) => (
          <Link key={href} to={href} className="study-hub__link">
            <div>
              <h2>{label}</h2>
              <p>{detail}</p>
            </div>
            <ArrowUpRight size={16} strokeWidth={1.6} aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  );
}
