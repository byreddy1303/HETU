import { Timer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { FastAnswer } from '@/lib/fast-answer';

/** Asked once when an answer is committed in under eight seconds. */
export default function FastAnswerCheck({
  seconds,
  busy,
  onChoose,
  onCancel
}: {
  seconds: number;
  busy: boolean;
  onChoose: (choice: FastAnswer) => void;
  onCancel: () => void;
}) {
  return (
    <section
      aria-label="Quick answer check"
      className="rounded border border-warn/30 bg-warn-faint px-3 py-3"
    >
      <p className="flex items-center gap-2 text-[13px] font-semibold text-text">
        <Timer size={15} className="shrink-0 text-warn" aria-hidden />
        That took {seconds} {seconds === 1 ? 'second' : 'seconds'}. How did you get it?
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
        One tap keeps your timing and accuracy honest. A guess comes back as a re-attempt; work done
        on paper first keeps the answer but drops the timing.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => onChoose('here')}>
          Solved it just now
        </Button>
        <Button size="sm" disabled={busy} onClick={() => onChoose('earlier')}>
          Worked it out on paper first
        </Button>
        <Button size="sm" disabled={busy} onClick={() => onChoose('guessed')}>
          Guessed
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Keep working
        </Button>
      </div>
    </section>
  );
}
