import { useState } from 'react';
import { Camera, CheckCircle2, ImagePlus, X } from 'lucide-react';
import type { Outcome, QuestionRow, RootCause } from '@/types';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/ui';
import { SUBJECTS } from '@/lib/constants';
import { compressToDataUrl } from '@/lib/image';
import { writeLocal } from '@/lib/sync';
import { scheduleReattempt } from '@/lib/reattempt';
import { cn, nowISO, uuid } from '@/lib/utils';

const QUICK_OUTCOMES: { value: Outcome; label: string; hint: string }[] = [
  { value: 'W-C', label: 'Wrong · concept', hint: 'Did not know or recall the method' },
  {
    value: 'W-E',
    label: 'Wrong · execution',
    hint: 'Knew it, made a calculation or process error'
  },
  { value: 'W-R', label: 'Wrong · reading', hint: 'Misread a qualifier, option, or constraint' },
  { value: 'RBS', label: 'Slow correct', hint: 'Correct, but outside target time' },
  { value: 'RBG', label: 'Guessed correct', hint: 'Correct without reliable reasoning' }
];

const ROOT_CAUSE: Partial<Record<Outcome, RootCause>> = {
  'W-C': 'concept',
  'W-E': 'computation',
  'W-R': 'reading'
};

export default function QuickCapture() {
  const { userId } = useAuth();
  const pushToast = useUiStore((state) => state.pushToast);
  const [subject, setSubject] = useState<string>(SUBJECTS[0]);
  const [outcome, setOutcome] = useState<Outcome>('W-C');
  const [note, setNote] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setProcessing(true);
    setSaved(false);
    try {
      const image = await compressToDataUrl(file);
      setImageUrl(image.dataUrl);
      setImageName(file.name);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Could not read that image.', 'neutral');
    } finally {
      setProcessing(false);
    }
  }

  async function save() {
    if (!userId || !imageUrl || !note.trim() || saving) return;
    setSaving(true);
    try {
      const row: QuestionRow = {
        id: uuid(),
        user_id: userId,
        session_id: null,
        subject,
        subtopic: null,
        source_year: null,
        source_ref: 'Quick capture',
        question_text: null,
        answer_text: null,
        capture_note: note.trim(),
        image_url: imageUrl,
        time_spent_sec: 0,
        target_time_sec: 120,
        outcome,
        pattern_name: null,
        trigger_sentence: null,
        root_cause: ROOT_CAUSE[outcome] ?? null,
        mark_decision: null,
        mark_correct: null,
        created_at: nowISO()
      };
      await writeLocal('questions', row);
      await scheduleReattempt(userId, row.id);
      setImageUrl(null);
      setImageName('');
      setNote('');
      setSaved(true);
      pushToast('Captured and added to the re-attempt ladder.', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Could not save this capture.', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Quick capture"
        description="Photograph the question, record what happened, and move on. Complete analysis later."
      />

      {saved && (
        <div className="flex items-center gap-2 rounded border border-success/30 bg-success-faint px-4 py-3 text-[13px] text-success">
          <CheckCircle2 size={16} /> Saved to Journal and scheduled for re-attempt.
        </div>
      )}

      <Card>
        <CardHeader
          title="Question image"
          aside={<span className="u-label text-text-faint">required</span>}
        />
        <CardBody>
          {imageUrl ? (
            <div className="relative overflow-hidden rounded border border-border bg-bg-overlay/30">
              <img
                src={imageUrl}
                alt="Question selected for quick capture"
                className="max-h-[420px] w-full object-contain"
              />
              <button
                type="button"
                onClick={() => {
                  setImageUrl(null);
                  setImageName('');
                }}
                className="absolute right-2 top-2 rounded-full bg-bg-raised p-2 text-text-muted shadow-card"
                aria-label="Remove selected image"
              >
                <X size={15} />
              </button>
              <p className="truncate border-t border-border px-3 py-2 text-[11px] text-text-faint">
                {imageName}
              </p>
            </div>
          ) : (
            <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-bg-overlay/20 px-6 text-center hover:border-border-hover">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-faint text-accent">
                <Camera size={22} />
              </span>
              <span className="font-display text-[15px] font-semibold text-text">
                {processing ? 'Compressing image…' : 'Take photo or choose image'}
              </span>
              <span className="text-[12px] text-text-faint">
                Images are compressed before local storage and sync.
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={processing}
                onChange={(event) => void pickImage(event.target.files?.[0])}
              />
            </label>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Minimum evidence"
          aside={<span className="u-label text-text-faint">about 15 seconds</span>}
        />
        <CardBody className="flex flex-col gap-4">
          <label className="text-[12px] font-medium text-text-muted">
            Subject
            <Select
              className="mt-1"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            >
              {SUBJECTS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </label>
          <fieldset>
            <legend className="u-label mb-2">What happened?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {QUICK_OUTCOMES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setOutcome(item.value)}
                  className={cn(
                    'rounded border px-3 py-2.5 text-left transition-colors',
                    outcome === item.value
                      ? 'border-accent/45 bg-accent-faint'
                      : 'border-border bg-bg-raised hover:border-border-hover'
                  )}
                >
                  <span className="block text-[13px] font-semibold text-text">{item.label}</span>
                  <span className="mt-0.5 block text-[11px] text-text-faint">{item.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="text-[12px] font-medium text-text-muted">
            One sentence about the mistake
            <Textarea
              className="mt-1"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. I used FIFO because I missed that the policy updates on every hit."
            />
          </label>
          <div className="flex justify-end border-t border-border pt-4">
            <Button
              variant="primary"
              disabled={!imageUrl || !note.trim() || saving}
              onClick={() => void save()}
            >
              <ImagePlus size={16} /> {saving ? 'Saving…' : 'Save capture'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
