import { describe, expect, it } from 'vitest';
import { contextualGateTipForPath } from '@/lib/contextual-gate-tips';

describe('contextualGateTipForPath', () => {
  it.each([
    ['/session/new', 'session-scope'],
    ['/session/session-42/solve', 'session-exam-rhythm'],
    ['/session/session-42/review', 'session-review-conversion'],
    ['/journal', 'journal-patterns'],
    ['/log', 'log-fresh-evidence'],
    ['/patterns', 'pattern-trigger'],
    ['/pyq', 'pyq-diagnostic'],
    ['/planner', 'planner-output'],
    ['/reattempts', 'reattempt-cold'],
    ['/weekly-review', 'weekly-constraint'],
    ['/heatmap', 'heatmap-priority'],
    ['/calibration', 'calibration-confidence'],
    ['/readiness', 'readiness-direction'],
    ['/trigger-drill', 'trigger-reflex'],
    ['/formulas', 'formula-boundaries'],
    ['/buddy', 'buddy-teach-back'],
    ['/settings', 'settings-sustainable-targets']
  ])('uses the relevant tip for %s', (pathname, id) => {
    expect(contextualGateTipForPath(pathname).id).toBe(id);
  });

  it('keeps a useful fallback for future authenticated screens', () => {
    expect(contextualGateTipForPath('/future-tool')).toMatchObject({
      id: 'retrieval-first',
      context: 'Study principle'
    });
  });
});
