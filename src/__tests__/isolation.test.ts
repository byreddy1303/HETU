// Contract: after wipeLocalState(), no residue from a previous account
// remains on this device. This test seeds every known local store, runs the
// wipe, and asserts every store is back to its initial state.
//
// The Dexie/IndexedDB behaviour is exercised via fake-indexeddb (already
// wired for other tests). localStorage is stubbed by jsdom.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { DEFAULT_PREFERENCES, usePrefsStore } from '@/stores/prefs';
import { useSessionStore } from '@/stores/session';
import { useLogStore } from '@/stores/log';
import { db } from '@/lib/db';
import { wipeLocalState } from '@/lib/isolation';

async function seedAll() {
  // Prefs: change a couple of values so we can prove they got reset.
  usePrefsStore.getState().set('dailyQuestionTarget', 42);
  usePrefsStore.getState().set('showCountdown', false);
  // Session: pretend we're mid-solve.
  useSessionStore.getState().begin('s-123', 10);
  useSessionStore.getState().enterTag(45);
  // Log: pretend we're mid-batch.
  useLogStore.getState().beginMulti('sess-456');
  useLogStore.getState().bumpLogged();
  // Dexie: real row + meta entry.
  await db.meta.put({ key: 'welcome_seen_at', value: new Date().toISOString() });
  await db.questions.add({
    id: 'q-1',
    user_id: 'u-1',
    session_id: null,
    subject: 'Digital Logic',
    subtopic: null,
    source_year: null,
    source_ref: null,
    question_text: null,
    answer_text: null,
    image_url: null,
    time_spent_sec: 60,
    target_time_sec: 120,
    outcome: 'R',
    pattern_name: null,
    trigger_sentence: null,
    root_cause: null,
    mark_decision: null,
    mark_correct: null,
    created_at: new Date().toISOString(),
    sync_status: 'pending'
  });
  // Localstorage: also drop some rogue air.* keys so we can prove the sweep.
  localStorage.setItem('air.mystery', 'nope');
  localStorage.setItem('air-journal:readiness:v3:u-1:watchlist', 'nope');
  localStorage.setItem('unrelated.key', 'keep-me');
}

describe('wipeLocalState()', () => {
  beforeEach(async () => {
    // Fresh Dexie for each test.
    await db.delete();
    await db.open();
    localStorage.clear();
    usePrefsStore.setState({ ...DEFAULT_PREFERENCES });
    useSessionStore.getState().end();
    useLogStore.getState().end();
  });

  it('resets zustand stores back to their initial state', async () => {
    await seedAll();
    expect(usePrefsStore.getState().dailyQuestionTarget).toBe(42);
    expect(useSessionStore.getState().sessionId).toBe('s-123');
    expect(useLogStore.getState().mode).toBe('multi');

    await wipeLocalState();

    expect(usePrefsStore.getState().dailyQuestionTarget).toBe(
      DEFAULT_PREFERENCES.dailyQuestionTarget
    );
    expect(usePrefsStore.getState().showCountdown).toBe(DEFAULT_PREFERENCES.showCountdown);
    expect(useSessionStore.getState().sessionId).toBeNull();
    expect(useSessionStore.getState().mode).toBe('solve');
    expect(useLogStore.getState().mode).toBe('idle');
    expect(useLogStore.getState().loggedCount).toBe(0);
  });

  it('wipes Dexie tables including meta', async () => {
    await seedAll();
    await wipeLocalState();
    const rows = await db.questions.toArray();
    const meta = await db.meta.get('welcome_seen_at');
    expect(rows).toHaveLength(0);
    expect(meta).toBeUndefined();
  });

  it('sweeps every air.* localStorage key and leaves foreign keys alone', async () => {
    await seedAll();
    await wipeLocalState();
    expect(localStorage.getItem('air.mystery')).toBeNull();
    expect(localStorage.getItem('air.prefs')).toBeNull();
    expect(localStorage.getItem('air.session')).toBeNull();
    expect(localStorage.getItem('air.log')).toBeNull();
    expect(localStorage.getItem('air-journal:readiness:v3:u-1:watchlist')).toBeNull();
    // Non-app keys must survive — never touch storage we don't own.
    expect(localStorage.getItem('unrelated.key')).toBe('keep-me');
  });

  it('attempts every cleanup step but rejects instead of reporting a partial wipe', async () => {
    await seedAll();
    const deleteSpy = vi.spyOn(db, 'delete').mockRejectedValueOnce(new Error('IndexedDB busy'));

    await expect(wipeLocalState()).rejects.toThrow(
      'Local cache cleanup was incomplete: offline database.'
    );

    expect(localStorage.getItem('air.mystery')).toBeNull();
    expect(usePrefsStore.getState().dailyQuestionTarget).toBe(
      DEFAULT_PREFERENCES.dailyQuestionTarget
    );
    deleteSpy.mockRestore();
  });
});
