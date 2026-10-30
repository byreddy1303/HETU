import MathText from '@/components/shared/MathText';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, ClipboardList, RotateCcw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/fastapi-client';
import type { TestAnalysisDetail, TestArtifact } from '@/lib/test-analysis';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import TestQuestionCapture from '@/components/learning/TestQuestionCapture';

const studyLinks = [
  ['/formulas', 'Formulas'],
  ['/trigger-drill', 'Trigger drill'],
  ['/patterns', 'Patterns'],
  ['/heatmap', 'Heatmap'],
  ['/calibration', 'Calibration'],
  ['/readiness', 'Readiness'],
  ['/planner', 'Planner'],
  ['/weekly-review', 'Weekly review'],
  ['/syllabus', 'Syllabus tracker']
];

export default function TestAnalysis() {
  const { userId } = useAuth();
  const { analysisId } = useParams();
  return userId && analysisId ? (
    <ConnectedTestAnalysis key={`${userId}:${analysisId}`} analysisId={analysisId} />
  ) : null;
}

function ConnectedTestAnalysis({ analysisId }: { analysisId: string }) {
  const [detail, setDetail] = useState<TestAnalysisDetail | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void apiRequest<TestAnalysisDetail>(`/v1/test-analyses/${encodeURIComponent(analysisId)}`, {
      signal: controller.signal
    })
      .then((value) => {
        if (!controller.signal.aborted) setDetail(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'This test analysis could not load.');
      });
    return () => controller.abort();
  }, [analysisId, refresh]);

  if (error)
    return (
      <div className="space-y-4">
        <Link to="/mocks" className="text-accent">
          Back to Mocks
        </Link>
        <p role="alert" className="text-danger">
          {error}
        </p>
        <Button onClick={() => setRefresh((value) => value + 1)}>Retry loading test</Button>
      </div>
    );
  if (!detail)
    return (
      <p role="status" className="text-text-muted">
        Loading your test analysis…
      </p>
    );
  const { report, artifacts } = detail;
  const discussions = artifacts.concept_pages ?? [];
  const formulas = artifacts.formulas ?? [];
  const cues = artifacts.trigger_phrases ?? [];
  const reviews = artifacts.concept_reviews ?? [];
  const reattempts = artifacts.reattempts ?? [];
  const mock = artifacts.mock_tests?.[0];
  const questionsById = new Map((artifacts.questions ?? []).map((item) => [item.id, item]));
  const questionRefsById = new Map(
    Object.entries(report.artifact_maps.questions ?? {}).map(([ref, id]) => [id, ref])
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link to="/mocks" className="inline-flex items-center gap-2 text-[13px] text-accent">
        <ArrowLeft size={15} /> All tests
      </Link>
      <PageHeader
        title={report.name}
        description={`Test review from ${formatDate(report.test_date, 'dd MMM yyyy')}`}
      />
      <div className="border-l-4 border-accent py-2 pl-5">
        <p className="max-w-prose text-[16px] leading-relaxed"><MathText>{report.summary}</MathText></p>
        {mock && (
          <p className="mt-3 text-[13px] text-text-muted">
            Score {mock.total_marks}/{mock.max_marks} · {mock.correct} correct · {mock.wrong} wrong
            · {mock.skipped} skipped
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          {report.session_id && (
            <Link
              className="u-button inline-flex items-center gap-2 bg-accent px-4 py-2 text-accent-contrast"
              to={`/journal?session=${report.session_id}`}
            >
              <BookOpen size={15} /> Open question log
            </Link>
          )}
          <Link
            className="u-button inline-flex items-center gap-2 border border-border px-4 py-2 text-accent"
            to={`/workflows/${report.workflow_id}`}
          >
            Continue review
          </Link>
          {report.revision_pack_id && (
            <Link
              className="u-button inline-flex items-center gap-2 border border-border px-4 py-2 text-accent"
              to={`/revision-pack?pack=${report.revision_pack_id}`}
            >
              <ClipboardList size={15} /> Test revision pack
            </Link>
          )}
        </div>
      </div>

      {(report.missing_information.length > 0 || report.unresolved.length > 0) && (
        <Card>
          <CardHeader title="Details to resolve" />
          <CardBody>
            <ul className="list-disc space-y-2 pl-5 text-[13px] text-text-muted">
              {[...report.missing_information, ...report.unresolved].map((item, index) => (
                <li key={`${index}:${item}`}><MathText>{item}</MathText></li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Test analysis" />
            <CardBody>
              <p className="max-w-prose whitespace-pre-wrap break-words text-[14px] leading-7">
                <MathText>{report.full_analysis}</MathText>
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Captured questions"
              aside={
                <span className="text-[12px] text-text-faint">
                  {report.questions.length}{' '}
                  {report.questions.length === 1 ? 'question' : 'questions'}
                </span>
              }
            />
            <CardBody>
              <div className="divide-y divide-border">
                {report.questions.map((q) => (
                  <TestQuestionCapture
                    key={q.ref}
                    question={q}
                    record={questionsById.get(report.artifact_maps.questions[q.ref])}
                    analysisId={analysisId}
                  />
                ))}
              </div>
              {report.questions.length === 0 && (
                <p className="text-[13px] text-text-muted">
                  No question text was included in this capture.
                </p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Sources from your discussion" />
            <CardBody>
              <ul className="space-y-4">
                {report.sources.map((source, index) => (
                  <li key={`${index}:${source.title}`}>
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[13px] font-medium text-accent"
                      >
                        <MathText>{source.title}</MathText>
                      </a>
                    ) : (
                      <p className="text-[13px] font-medium"><MathText>{source.title}</MathText></p>
                    )}
                    {source.excerpt && (
                      <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-text-muted">
                        <MathText>{source.excerpt}</MathText>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="What to do next" />
            <CardBody>
              {report.next_steps.length ? (
                <ol className="list-decimal space-y-3 pl-5 text-[14px] leading-relaxed">
                  {report.next_steps.map((step, index) => (
                    <li key={`${index}:${step}`}><MathText>{step}</MathText></li>
                  ))}
                </ol>
              ) : (
                <p className="text-[13px] text-text-muted">
                  Review the saved concepts, then test your recall.
                </p>
              )}
              {(reattempts.length > 0 || reviews.length > 0) && (
                <div className="mt-4 border-t border-border pt-4 text-[13px] text-text-muted">
                  <p>
                    {reattempts.length} question{' '}
                    {reattempts.length === 1 ? 're-attempt' : 're-attempts'} and {reviews.length}{' '}
                    concept {reviews.length === 1 ? 'review' : 'reviews'} linked to this test.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {reattempts.map((item) => (
                      <li key={item.id}>
                        <Link
                          className="inline-flex items-center gap-2 text-accent"
                          to={`/reattempts/${item.id}`}
                        >
                          <RotateCcw size={13} />
                          {questionRefsById.get(item.question_id ?? '') ?? 'Question'} ·{' '}
                          {item.stage} re-attempt
                          {item.scheduled_date
                            ? ` · ${formatDate(item.scheduled_date, 'dd MMM')}`
                            : ''}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <ul className="mt-3 space-y-2">
                    {reviews.map((item) => (
                      <li key={item.id}>
                        <Link className="text-accent" to={`/concept-review/${item.id}`}>
                          <MathText>{item.prompt || ''}</MathText>
                        </Link>
                        {item.due_on && (
                          <span className="block text-[11px] text-text-faint">
                            Due {formatDate(item.due_on, 'dd MMM')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>
          <ArtifactSection
            title="Saved discussions"
            items={discussions}
            empty="No new concepts were captured."
            render={(item) => (
              <>
                <Link
                  to={`/learning-library/${item.id}`}
                  className="text-[14px] font-semibold text-accent"
                >
                  <MathText>{item.concept || ''}</MathText>
                </Link>
                <p className="mt-1 text-[12px] text-text-faint">
                  <MathText>{[item.subject, item.topic].filter(Boolean).join(' / ')}</MathText>
                </p>
                <details className="mt-2 text-[13px]">
                  <summary className="cursor-pointer text-text-muted">
                    Read the saved explanation
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">
                    <MathText>{item.full_explanation || ''}</MathText>
                  </p>
                </details>
              </>
            )}
          />
          <ArtifactSection
            title="Formulas"
            items={formulas}
            empty="No formulas were captured."
            render={(item) => (
              <>
                <p className="text-[14px] font-medium"><MathText>{item.name || ''}</MathText></p>
                <MathText display math className="mt-2 text-[13px] leading-relaxed">
                  {item.expression || ''}
                </MathText>
              </>
            )}
          />
          <ArtifactSection
            title="Recognition cues"
            items={cues}
            empty="No recognition cues were captured."
            render={(item) => (
              <>
                <p className="text-[14px] font-medium">When you see: <MathText>{item.phrase || ''}</MathText></p>
                <p className="mt-2 whitespace-pre-wrap break-words text-[13px] text-text-muted">
                  Think: <MathText>{item.concept || ''}</MathText>
                </p>
              </>
            )}
          />
        </div>
      </div>
      <nav
        aria-label="Continue studying in Hetu"
        className="flex flex-wrap gap-x-5 gap-y-3 border-t border-border pt-5 text-[13px]"
      >
        {studyLinks.map(([href, label]) => (
          <Link key={href} to={href} className="text-accent">
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function ArtifactSection({
  title,
  items,
  empty,
  render
}: {
  title: string;
  items: TestArtifact[];
  empty: string;
  render: (item: TestArtifact) => React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        aside={<span className="text-[12px] text-text-faint">{items.length}</span>}
      />
      <CardBody>
        {items.length ? (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                {render(item)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-text-muted">{empty}</p>
        )}
      </CardBody>
    </Card>
  );
}
