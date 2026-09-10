import { BarChart3, BookOpenCheck, ClipboardPlus, Route, Wrench } from 'lucide-react';
import type { PyqEvidenceInsights } from '@/lib/pyq-evidence-insights';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';

function accuracyLabel(value: number | null): string {
  return value == null ? '—' : `${value}%`;
}

export default function PyqEvidenceLedger({
  insights,
  onPractice,
  onAddToRecovery,
  onAnalyzeFirst,
  onPlanRepair,
  onTryTransfer
}: {
  insights: PyqEvidenceInsights;
  onPractice: (questionUids: string[]) => void;
  onAddToRecovery: (questionUids: string[]) => void;
  onAnalyzeFirst: (questionUid: string) => void;
  onPlanRepair: (questionUids: string[]) => void;
  onTryTransfer: (sourceQuestionUids: string[]) => void;
}) {
  const repair = insights.cohorts.repair;
  const analyzeFirst = insights.cohorts.wrongUnanalyzed[0] ?? null;

  return (
    <section aria-labelledby="pyq-evidence-ledger-heading" className="pt-2">
      <div className="mb-3 px-1">
        <p id="pyq-evidence-ledger-heading" className="u-label">
          Confidence and pace ledger
        </p>
        <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-text-faint">
          All-receipt calibration remains historical evidence. Action cohorts use only each
          question’s latest immutable receipt, so a clean retry can leave the repair queue without
          rewriting the earlier miss.
        </p>
      </div>

      <Card>
        <CardBody className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
          <div>
            <p className="u-label">Confidence accuracy</p>
            <div className="mt-2 grid grid-cols-3 gap-px overflow-hidden rounded border border-border bg-border">
              {insights.confidence.map((row) => (
                <div key={row.confidence} className="bg-bg-raised p-3">
                  <p className="text-[10.5px] capitalize text-text-faint">{row.confidence}</p>
                  <p className="u-num mt-1 text-[18px] font-bold text-text">
                    {accuracyLabel(row.accuracyPct)}
                  </p>
                  <p className="mt-1 text-[10px] text-text-faint">
                    {row.correct} right · {row.wrong} wrong
                  </p>
                </div>
              ))}
            </div>

            <p className="u-label mt-4">Highest calibration risk</p>
            <div className="mt-2 space-y-2">
              {insights.calibrationBySubjectTopic.slice(0, 4).map((row) => (
                <div
                  key={`${row.subject}:${row.topic}`}
                  className="rounded border border-border bg-bg-overlay/20 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-text">{row.subject}</p>
                      <p className="truncate text-[10.5px] text-text-faint">{row.topic}</p>
                    </div>
                    <Badge tone={row.highConfidenceWrong > 0 ? 'danger' : 'neutral'}>
                      {row.highConfidenceWrong} confident wrong
                    </Badge>
                  </div>
                  <p className="mt-1 text-[10.5px] text-text-muted">
                    {accuracyLabel(row.accuracyPct)} overall ·{' '}
                    {accuracyLabel(row.highConfidenceAccuracyPct)} when high confidence ·{' '}
                    {row.attempted} receipts
                  </p>
                </div>
              ))}
              {insights.calibrationBySubjectTopic.length === 0 ? (
                <p className="text-[11px] text-text-faint">
                  No graded PYQ confidence evidence yet.
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <p className="u-label">Rolling personal pace vs GATE target</p>
            <div className="mt-2 space-y-2">
              {insights.paceBaselines.slice(0, 6).map((row) => (
                <div
                  key={`${row.subject}:${row.marks ?? 'unknown'}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded border border-border bg-bg-overlay/20 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-text">{row.subject}</p>
                    <p className="text-[10.5px] text-text-faint">
                      {row.marks ?? '?'} mark · latest {row.sampleSize} clean receipts
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="u-num text-[12px] font-semibold text-text">
                      {Math.round(row.personalMedianSec)}s / {row.gateTargetSec}s
                    </p>
                    <p
                      className={`text-[10px] ${row.ratioToTarget > 1 ? 'text-warn' : 'text-success'}`}
                    >
                      {Math.round(row.ratioToTarget * 100)}% of target
                    </p>
                  </div>
                </div>
              ))}
              {insights.paceBaselines.length === 0 ? (
                <p className="text-[11px] text-text-faint">
                  Clean timed receipts will establish a rolling personal baseline.
                </p>
              ) : null}
            </div>

            <div className="mt-4 rounded border border-accent/25 bg-accent-faint/25 p-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="danger">
                  {insights.cohorts.highConfidenceWrong.length} high-confidence wrong
                </Badge>
                <Badge tone="guess">{insights.cohorts.guessedCorrect.length} fragile wins</Badge>
                <Badge tone="warn">{insights.cohorts.slowCorrect.length} slow correct</Badge>
                <Badge>{insights.cohorts.wrongUnanalyzed.length} analyze first</Badge>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
                {repair.length > 0
                  ? `${repair.length} exact UID${repair.length === 1 ? '' : 's'} form the current repair cohort.`
                  : 'No latest receipt currently needs PYQ repair.'}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button size="sm" onClick={() => onPractice(repair)} disabled={repair.length === 0}>
                  <BookOpenCheck size={13} /> Practice exact subset
                </Button>
                <Button
                  size="sm"
                  onClick={() => onAddToRecovery(repair)}
                  disabled={repair.length === 0}
                >
                  <ClipboardPlus size={13} /> Add to recovery
                </Button>
                <Button
                  size="sm"
                  onClick={() => analyzeFirst && onAnalyzeFirst(analyzeFirst)}
                  disabled={!analyzeFirst}
                >
                  <BarChart3 size={13} /> Analyze first
                </Button>
                <Button
                  size="sm"
                  onClick={() => onPlanRepair(repair)}
                  disabled={repair.length === 0}
                >
                  <Wrench size={13} /> Plan repair
                </Button>
                <Button
                  size="sm"
                  className="sm:col-span-2"
                  onClick={() => onTryTransfer(repair)}
                  disabled={repair.length === 0}
                >
                  <Route size={13} /> Try fresh transfer instead of repeating
                </Button>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </section>
  );
}
