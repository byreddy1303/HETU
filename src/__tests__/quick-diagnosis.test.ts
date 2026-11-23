import { describe, expect, it } from 'vitest';
import { needsQuickDiagnosis, quickDiagnosisOutcome } from '@/lib/quick-diagnosis';
import { needsTriage } from '@/lib/recovery-housekeeping';
import type { LearningItemRow, QuestionRow } from '@/types';

describe('fifteen-second diagnosis', () => {
  it('maps a miss to the journal outcome implied by its cause', () => {
    const miss = {
      mark_correct: false,
      mark_decision: 'MARK' as const,
      confidence: 'high' as const
    };
    expect(quickDiagnosisOutcome(miss, 'concept')).toBe('W-C');
    expect(quickDiagnosisOutcome(miss, 'formula')).toBe('W-C');
    expect(quickDiagnosisOutcome(miss, 'reading')).toBe('W-R');
    expect(quickDiagnosisOutcome(miss, 'computation')).toBe('W-E');
    expect(quickDiagnosisOutcome(miss, 'strategy')).toBe('W-E');
  });

  it('keeps shaky correct answers as guessed or slow, whatever the cause', () => {
    expect(
      quickDiagnosisOutcome(
        { mark_correct: true, mark_decision: 'FIFTY_FIFTY', confidence: null },
        'concept'
      )
    ).toBe('RBG');
    expect(
      quickDiagnosisOutcome(
        { mark_correct: true, mark_decision: 'MARK', confidence: 'high' },
        'strategy'
      )
    ).toBe('RBS');
  });

  it('asks only for graded weak answers or skips', () => {
    expect(
      needsQuickDiagnosis({ mark_correct: false, mark_decision: 'MARK', confidence: null }, true)
    ).toBe(true);
    expect(
      needsQuickDiagnosis({ mark_correct: null, mark_decision: 'SKIP', confidence: null }, true)
    ).toBe(true);
    expect(
      needsQuickDiagnosis({ mark_correct: null, mark_decision: 'MARK', confidence: 'low' }, true)
    ).toBe(false);
    expect(
      needsQuickDiagnosis({ mark_correct: true, mark_decision: 'MARK', confidence: 'high' }, false)
    ).toBe(false);
  });
});

describe('imported test triage', () => {
  const item = {
    id: 'item',
    source_kind: 'manual',
    recovery_state: 'active',
    reason_flags: ['manual-recovery']
  } as unknown as LearningItemRow;
  const unknown = { id: 'q', outcome: 'U' } as QuestionRow;

  it('asks once about logged questions whose test result is unknown', () => {
    expect(needsTriage(item, unknown)).toBe(true);
    expect(needsTriage({ ...item, reason_flags: ['triage-missed'] }, unknown)).toBe(false);
    expect(needsTriage(item, { ...unknown, outcome: 'W-C' })).toBe(false);
    expect(
      needsTriage(
        { ...item, recovery_state: 'paused', reason_flags: ['awaiting-test-result'] },
        undefined
      )
    ).toBe(true);
    expect(needsTriage({ ...item, source_kind: 'pyq' } as LearningItemRow, unknown)).toBe(false);
  });
});
