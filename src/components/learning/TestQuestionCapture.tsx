import MathText from '@/components/shared/MathText';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/fastapi-client';
import type { TestArtifact, TestQuestion } from '@/lib/test-analysis';
import AnswerReveal from '@/components/shared/AnswerReveal';
import { Badge } from '@/components/ui/Badge';

export default function TestQuestionCapture({
  question: q,
  record,
  analysisId
}: {
  question: TestQuestion;
  record: TestArtifact | undefined;
  analysisId: string;
}) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const questionId = record?.id;
  const hasImage = record?.has_image;

  useEffect(() => {
    if (!open || !hasImage || !questionId || image) return;
    const controller = new AbortController();
    setError('');
    void apiRequest<{ image_url: string | null }>(
      `/v1/test-analyses/${encodeURIComponent(analysisId)}/questions/${encodeURIComponent(questionId)}/image`,
      { signal: controller.signal }
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.image_url) setImage(result.image_url);
        else setError('This question screenshot is unavailable.');
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Question screenshot could not load.');
      });
    return () => controller.abort();
  }, [analysisId, questionId, hasImage, image, open, refresh]);

  return (
    <details className="py-4 first:pt-0" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-[14px] font-medium">
        <span className="mr-2 text-accent">{q.ref}</span>
        {q.subject}
        {q.topic ? ` / ${q.topic}` : ''}
        <span className="ml-2">
          <Badge tone={q.outcome ? 'neutral' : 'warn'}>{q.outcome ?? 'Outcome to confirm'}</Badge>
        </span>
      </summary>
      {open && (
        <div>
          <p className="mt-4 whitespace-pre-wrap break-words text-[14px] leading-relaxed">
            <MathText>{q.question_text || ''}</MathText>
          </p>
          {hasImage && !image && !error && (
            <p role="status" className="mt-3 text-[12px] text-text-muted">
              Loading question screenshot…
            </p>
          )}
          {image && (
            <img
              src={image}
              alt={`${q.ref} question screenshot without the answer`}
              loading="lazy"
              className="mt-4 max-h-[600px] w-full rounded border border-border object-contain"
            />
          )}
          {error && (
            <p role="alert" className="mt-3 text-[12px] text-danger">
              {error}{' '}
              <button className="underline" onClick={() => setRefresh((value) => value + 1)}>
                Retry screenshot
              </button>
            </p>
          )}
          {q.learner_answer && (
            <p className="mt-3 text-[13px] text-text-muted">
              Your test answer: <MathText>{q.learner_answer}</MathText>
            </p>
          )}
          <AnswerReveal answer={q.answer_text} className="mt-3" />
          {q.capture_note && (
            <p className="mt-3 whitespace-pre-wrap text-[13px] text-text-muted">
              <MathText>{q.capture_note}</MathText>
            </p>
          )}
          {(q.root_cause || q.pattern_name) && (
            <p className="mt-2 text-[12px] text-text-faint">
              {q.analysis_provenance === 'learner_reported'
                ? 'Your reflection'
                : 'Suggested diagnosis'}
              : <MathText>{[q.root_cause, q.pattern_name].filter(Boolean).join(' · ')}</MathText>
            </p>
          )}
          <p className="mt-2 text-[12px] text-text-faint">
            {q.time_spent_sec === null
              ? 'Time not recorded'
              : `Reported time: ${q.time_spent_sec}s`}
          </p>
        </div>
      )}
    </details>
  );
}
