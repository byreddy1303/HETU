import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, CheckCircle2, Play, Plus, Timer, Trash2, XCircle } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Empty } from '@/components/ui/Empty';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/ui';
import { db } from '@/lib/db';
import { writeLocal, deleteLocal } from '@/lib/sync';
import { nowISO, uuid } from '@/lib/utils';
import type { TriggerPhraseRow } from '@/types';

interface Attempt {
  phraseId: string;
  phrase: string;
  answer: string;
  reflexMs: number;
  result: 'MATCH' | 'MISS';
}

function normalizeAnswer(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function orderQueue(phrases: TriggerPhraseRow[]): TriggerPhraseRow[] {
  return [...phrases].sort((a, b) => {
    if (a.reflex_time_ms === null && b.reflex_time_ms === null) return a.created_at.localeCompare(b.created_at);
    if (a.reflex_time_ms === null) return -1;
    if (b.reflex_time_ms === null) return 1;
    return b.reflex_time_ms - a.reflex_time_ms;
  });
}

export default function TriggerDrill() {
  const { userId } = useAuth();
  const pushToast = useUiStore((state) => state.pushToast);
  const phrases = useLiveQuery(
    async () => (userId ? db.trigger_phrases.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const queue = useMemo(() => orderQueue(phrases), [phrases]);

  const [newPhrase, setNewPhrase] = useState('');
  const [newConcept, setNewConcept] = useState('');
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState<TriggerPhraseRow | null>(null);
  const [answer, setAnswer] = useState('');
  const [shownAt, setShownAt] = useState<number | null>(null);
  const [pendingMs, setPendingMs] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<'MATCH' | 'MISS' | null>(null);
  const [needsJudgement, setNeedsJudgement] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const answerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    answerRef.current?.focus();
  }, [current]);

  async function addPhrase() {
    if (!userId || !newPhrase.trim() || !newConcept.trim() || saving) return;
    setSaving(true);
    try {
      await writeLocal('trigger_phrases', {
        id: uuid(),
        user_id: userId,
        phrase: newPhrase.trim(),
        concept: newConcept.trim(),
        reflex_time_ms: null,
        question_ids: [],
        created_at: nowISO()
      });
      setNewPhrase('');
      setNewConcept('');
    } finally {
      setSaving(false);
    }
  }

  function showPhrase(row: TriggerPhraseRow | null) {
    setCurrent(row);
    setAnswer('');
    setPendingMs(null);
    setVerdict(null);
    setNeedsJudgement(false);
    setShownAt(row ? performance.now() : null);
  }

  function startDrill() {
    setAttempts([]);
    showPhrase(queue[0] ?? null);
  }

  function nextPhrase() {
    const next = queue.find((phrase) => phrase.id !== current?.id) ?? null;
    showPhrase(next);
  }

  async function finalize(result: 'MATCH' | 'MISS') {
    if (!current || pendingMs === null) return;
    setNeedsJudgement(false);
    setVerdict(result);
    setAttempts((previous) => [
      {
        phraseId: current.id,
        phrase: current.phrase,
        answer: answer.trim(),
        reflexMs: pendingMs,
        result
      },
      ...previous
    ].slice(0, 20));
    if (result === 'MATCH') {
      const best = current.reflex_time_ms === null ? pendingMs : Math.min(current.reflex_time_ms, pendingMs);
      await writeLocal('trigger_phrases', { ...current, reflex_time_ms: best });
      pushToast(`Correct · ${pendingMs} ms`, 'success');
    }
  }

  async function submit() {
    if (!current || shownAt === null || !answer.trim() || verdict || needsJudgement) return;
    const elapsed = Math.max(1, Math.round(performance.now() - shownAt));
    setPendingMs(elapsed);
    if (normalizeAnswer(answer) === normalizeAnswer(current.concept)) {
      await finalizeWithElapsed(current, elapsed, 'MATCH');
      return;
    }
    setNeedsJudgement(true);
  }

  async function finalizeWithElapsed(row: TriggerPhraseRow, elapsed: number, result: 'MATCH' | 'MISS') {
    setVerdict(result);
    setAttempts((previous) => [
      { phraseId: row.id, phrase: row.phrase, answer: answer.trim(), reflexMs: elapsed, result },
      ...previous
    ].slice(0, 20));
    if (result === 'MATCH') {
      const best = row.reflex_time_ms === null ? elapsed : Math.min(row.reflex_time_ms, elapsed);
      await writeLocal('trigger_phrases', { ...row, reflex_time_ms: best });
      pushToast(`Correct · ${elapsed} ms`, 'success');
    }
  }

  const matchCount = attempts.filter((attempt) => attempt.result === 'MATCH').length;

  return (
    <div className="workspace-drill flex flex-col gap-4">
      <PageHeader
        title="Trigger drill"
        description="Train a phrase-to-concept reflex locally. Exact answers are checked instantly; you remain the judge of valid synonyms."
      />

      <Card>
        <CardHeader title="Add phrase" aside={<span className="text-[11px] text-text-faint">cue → canonical concept</span>} />
        <CardBody>
          <form
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void addPhrase();
            }}
          >
            <Input value={newPhrase} onChange={(event) => setNewPhrase(event.target.value)} placeholder="Trigger phrase" maxLength={180} />
            <Input value={newConcept} onChange={(event) => setNewConcept(event.target.value)} placeholder="Concept it should recall" maxLength={180} />
            <Button type="submit" variant="primary" disabled={!newPhrase.trim() || !newConcept.trim() || saving}>
              <Plus size={15} /> Add
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Reflex round"
          aside={attempts.length > 0 ? <span className="u-num text-[11px] text-text-faint">{matchCount}/{attempts.length} correct</span> : undefined}
        />
        <CardBody>
          {phrases.length === 0 ? (
            <Empty title="Add your first trigger" hint="Choose phrases that should immediately point you toward an approach, theorem, or data structure." className="border-0 py-7" />
          ) : !current ? (
            <div className="flex flex-col items-center gap-3 py-7 text-center">
              <p className="max-w-md text-[13px] text-text-muted">Unpracticed phrases come first, followed by your slowest known reflexes.</p>
              <Button variant="primary" onClick={startDrill}><Play size={15} /> Start round</Button>
            </div>
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-4 py-3">
              <div className="rounded-lg border border-border bg-bg-overlay/35 px-5 py-6 text-center">
                <p className="u-label mb-2">What should this trigger?</p>
                <p className="font-display text-xl font-semibold text-text">{current.phrase}</p>
              </div>
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                <Input
                  ref={answerRef}
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Type the concept"
                  disabled={verdict !== null || needsJudgement}
                  className="flex-1"
                />
                <Button type="submit" variant="primary" disabled={!answer.trim() || verdict !== null || needsJudgement}>
                  <Timer size={15} /> Check
                </Button>
              </form>

              {needsJudgement && (
                <div className="rounded border border-warn/30 bg-warn-faint p-3">
                  <p className="text-[13px] text-text">Expected: <span className="font-semibold">{current.concept}</span></p>
                  <p className="mt-1 text-[12px] text-text-muted">If your wording means the same thing, count it as correct. Otherwise record the miss.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" onClick={() => void finalize('MATCH')}><CheckCircle2 size={13} /> Same meaning</Button>
                    <Button size="sm" onClick={() => void finalize('MISS')}><XCircle size={13} /> Count miss</Button>
                  </div>
                </div>
              )}

              {verdict && (
                <div className={`flex flex-wrap items-center gap-3 rounded border p-3 ${verdict === 'MATCH' ? 'border-success/30 bg-success-faint' : 'border-danger/30 bg-danger-faint'}`}>
                  {verdict === 'MATCH' ? <CheckCircle2 size={18} className="text-success" /> : <XCircle size={18} className="text-danger" />}
                  <p className="flex-1 text-[13px] text-text">
                    <span className="font-semibold">{verdict === 'MATCH' ? 'Correct' : 'Miss'}</span>
                    {' · '}<span className="u-num">{pendingMs} ms</span>
                    {verdict === 'MISS' && <> · expected {current.concept}</>}
                  </p>
                  <Button size="sm" onClick={nextPhrase}>Next <ArrowRight size={13} /></Button>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Phrase library" aside={<span className="u-num text-[11px] text-text-faint">{phrases.length}</span>} />
        {phrases.length === 0 ? null : (
          <ul className="divide-y divide-border">
            {queue.map((phrase) => (
              <li key={phrase.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-text">{phrase.phrase}</p>
                  <p className="text-[12px] text-text-muted">{phrase.concept}</p>
                </div>
                {phrase.reflex_time_ms === null ? <Badge>new</Badge> : <Badge tone="success">{phrase.reflex_time_ms} ms best</Badge>}
                <button
                  type="button"
                  onClick={() => {
                    void deleteLocal('trigger_phrases', phrase.id);
                    if (current?.id === phrase.id) showPhrase(null);
                  }}
                  aria-label={`Delete ${phrase.phrase}`}
                  className="rounded p-1.5 text-text-faint hover:bg-danger-faint hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
