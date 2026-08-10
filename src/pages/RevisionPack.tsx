import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Clipboard, Printer } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/ui';
import { db } from '@/lib/db';
import { buildRevisionPack, revisionPackText } from '@/lib/revision-pack';
import { formatDate, todayISOInTimeZone } from '@/lib/utils';

export default function RevisionPack() {
  const { userId, profile } = useAuth();
  const pushToast = useUiStore((state) => state.pushToast);
  const today = todayISOInTimeZone(profile?.timezone ?? 'Asia/Kolkata');
  const [copied, setCopied] = useState(false);
  const questions = useLiveQuery(
    () => (userId ? db.questions.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const reattempts = useLiveQuery(
    () => (userId ? db.reattempts.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const formulas = useLiveQuery(
    () => (userId ? db.formulas.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const triggers = useLiveQuery(
    () => (userId ? db.trigger_phrases.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const reviews = useLiveQuery(
    () => (userId ? db.weekly_reviews.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const pack = useMemo(
    () =>
      buildRevisionPack({
        today,
        weeklyReviews: reviews,
        formulas,
        triggers,
        questions,
        reattempts
      }),
    [today, reviews, formulas, triggers, questions, reattempts]
  );
  const empty =
    !pack.weeklyFix &&
    pack.dueFormulas.length === 0 &&
    pack.triggers.length === 0 &&
    pack.priorityQuestions.length === 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(revisionPackText(pack));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      pushToast('Clipboard access is unavailable. Use Print / save PDF instead.', 'neutral');
    }
  }

  return (
    <div className="revision-pack flex flex-col gap-4">
      <PageHeader
        title="Revision pack"
        description={`A compact offline review sheet for ${formatDate(today, 'dd MMM yyyy')}.`}
      />
      <div className="revision-pack-actions flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => window.print()} disabled={empty}>
          <Printer size={15} /> Print / save PDF
        </Button>
        <Button onClick={() => void copy()} disabled={empty}>
          {copied ? <Check size={15} /> : <Clipboard size={15} />}
          {copied ? 'Copied' : 'Copy as text'}
        </Button>
      </div>
      {empty ? (
        <Empty
          title="Nothing to pack yet"
          hint="Save formulas, triggers, questions, or a weekly focus first."
        />
      ) : (
        <>
          {pack.weeklyFix && (
            <Card className="revision-print-block border-accent/30">
              <CardHeader title="This week’s constraint" />
              <CardBody>
                <p className="font-display text-[20px] font-semibold leading-snug text-text">
                  {pack.weeklyFix}
                </p>
              </CardBody>
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <PackList
              title={`Due formulas · ${pack.dueFormulas.length}`}
              rows={pack.dueFormulas.map(
                (row) => `${row.subject}: ${row.name} — ${row.expression}`
              )}
              empty="No formulas due."
            />
            <PackList
              title={`Trigger phrases · ${pack.triggers.length}`}
              rows={pack.triggers.map((row) => `${row.phrase} → ${row.concept}`)}
              empty="No trigger phrases saved."
            />
            <PackList
              title={`Repeated mistakes · ${pack.repeatedMistakes.length}`}
              rows={pack.repeatedMistakes.map(
                (row) => `${row.subject}: ${row.name} (${row.count}×)`
              )}
              empty="No repeated pattern yet."
            />
            <PackList
              title={`Priority questions · ${pack.priorityQuestions.length}`}
              rows={pack.priorityQuestions.map((row) =>
                [row.subject, row.subtopic, row.source_ref, row.capture_note]
                  .filter(Boolean)
                  .join(' · ')
              )}
              empty="Question queue clear."
              numbered
            />
          </div>
        </>
      )}
    </div>
  );
}

function PackList({
  title,
  rows,
  empty,
  numbered = false
}: {
  title: string;
  rows: string[];
  empty: string;
  numbered?: boolean;
}) {
  const Tag = numbered ? 'ol' : 'ul';
  return (
    <Card className="revision-print-block overflow-hidden">
      <CardHeader title={title} />
      {rows.length ? (
        <Tag className="divide-y divide-border">
          {rows.map((row, index) => (
            <li
              key={`${row}-${index}`}
              className="flex gap-3 px-4 py-2.5 text-[12.5px] leading-relaxed text-text-muted"
            >
              <span className="u-num shrink-0 text-[10px] text-text-faint">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span>{row}</span>
            </li>
          ))}
        </Tag>
      ) : (
        <CardBody>
          <p className="text-[12px] text-text-faint">{empty}</p>
        </CardBody>
      )}
    </Card>
  );
}
