import { flushPendingSync, initSync, stopSync } from '@/lib/sync';
import { syncTopicProgressFromDb } from '@/stores/topic-progress';

export interface DurabilityFlushResult {
  ok: boolean;
  error?: string;
}

function updatedAtMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unreadableLegacyCacheKey(userId: string): string | null {
  const exactKeys = new Set([
    'air.prefs',
    'air.session',
    'air.log',
    'air.topic-progress',
    `air.topper-notes.${userId}`,
    `air-journal:readiness:v2:${userId}:snapshots`,
    `air-journal:readiness:v2:${userId}:watchlist`,
    `air-journal:readiness:v3:${userId}:snapshots`,
    `air-journal:readiness:v3:${userId}:watchlist`
  ]);
  const scopedPlannerPrefix = `air.planner.${userId}.`;

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      const isLegacyPlanner = /^planner_\d{4}-\d{2}-\d{2}$/.test(key);
      if (!exactKeys.has(key) && !key.startsWith(scopedPlannerPrefix) && !isLegacyPlanner) {
        continue;
      }
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      try {
        JSON.parse(raw);
      } catch {
        return key;
      }
    }
    return null;
  } catch {
    return 'browser storage';
  }
}

async function flushPlannerState(userId: string): Promise<void> {
  const [{ loadAllDayPlans, migrateLegacyDayPlansForUser }, planner] = await Promise.all([
    import('@/lib/planner-storage'),
    import('@/lib/planner-cloud')
  ]);
  // Migrate plans created before local keys were user-scoped even when the
  // Planner page was never opened during this login.
  migrateLegacyDayPlansForUser(userId);
  const localPlans = loadAllDayPlans(userId);
  const remoteResult = await planner.loadCloudDayPlans(userId);
  if (remoteResult.error) throw new Error(remoteResult.error);

  // This also migrates Planner caches created before full-plan cloud storage
  // shipped. Compare timestamps so an old device never overwrites newer data.
  const remoteByDate = new Map(remoteResult.plans.map((plan) => [plan.date, plan]));
  for (const local of localPlans) {
    const remote = remoteByDate.get(local.date);
    if (!remote || updatedAtMs(local.updatedAt) >= updatedAtMs(remote.updatedAt)) {
      const error = await planner.queuePlannerCloudWrite(userId, local);
      if (error) throw new Error(error);
    }
  }

  const error = await planner.flushPlannerCloudWrites(userId);
  if (error) throw new Error(error);
  if (planner.hasPendingPlannerCloudWrites(userId)) {
    throw new Error('Some Planner changes are still waiting for the database.');
  }
}

async function migrateLegacyAccountDocuments(
  userId: string,
  accountDocuments: typeof import('@/lib/account-documents'),
  readiness: typeof import('@/lib/readiness-snapshots')
): Promise<void> {
  const notesModule = await import('@/data/topper-notes.json');
  const noteIds = new Set((notesModule.default as Array<{ id: string }>).map((note) => note.id));
  let topperLegacy: unknown = null;
  let hasTopperLegacy = false;
  try {
    const raw = localStorage.getItem(`air.topper-notes.${userId}`);
    if (raw !== null) {
      topperLegacy = JSON.parse(raw);
      hasTopperLegacy = true;
    }
  } catch {
    // A malformed legacy cache is never deleted by this migration.
  }

  const topperResult = await accountDocuments.loadAccountDocument(userId, 'topper_notes', {
    normalize: (value) => accountDocuments.normalizeReferenceProgress(value, noteIds),
    legacyData: hasTopperLegacy
      ? accountDocuments.normalizeReferenceProgress(topperLegacy, noteIds)
      : null
  });
  if (topperResult.error) throw new Error(topperResult.error);

  const localDebt = readiness.loadDebt(userId);
  const watchlistResult = await accountDocuments.loadAccountDocument(
    userId,
    'readiness_watchlist',
    {
      normalize: readiness.normalizeDebtEntries,
      legacyData: readiness.hasStoredDebt(userId) ? localDebt : null
    }
  );
  if (watchlistResult.error) throw new Error(watchlistResult.error);
}

/**
 * Make every user-owned cache disposable before logout or an in-app wipe.
 * Nothing is deleted locally until every participating database writer has
 * acknowledged its latest payload.
 */
export async function flushAllDurableState(userId: string): Promise<DurabilityFlushResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      error: 'You are offline. Reconnect before signing out or clearing local data.'
    };
  }

  try {
    const unreadableKey = unreadableLegacyCacheKey(userId);
    if (unreadableKey) {
      throw new Error(
        `Local recovery data in "${unreadableKey}" could not be read and was left untouched.`
      );
    }
    // Idempotent for the current account and deliberately rebinds an engine
    // that might still be active for a previously signed-in account.
    initSync(userId);
    // Run the old syllabus-cache migration even when /syllabus was never
    // opened, then verify the whole Dexie sync queue.
    await syncTopicProgressFromDb(userId);
    if (!(await flushPendingSync(userId))) {
      throw new Error('Some study records are still waiting for the database.');
    }

    const [accountState, accountDocuments, readiness] = await Promise.all([
      import('@/lib/account-state'),
      import('@/lib/account-documents'),
      import('@/lib/readiness-snapshots')
    ]);

    // A user can sign out immediately after login, before the normal React
    // bootstrap effect has run. Force authoritative hydration/migration here
    // so an empty writer is never mistaken for a completed database save.
    await accountState.retryAccountStateSync(userId);
    await accountState.flushAccountStateWrites(userId);
    if (accountState.hasPendingAccountStateWrites(userId)) {
      throw new Error('Preferences or an in-progress draft are still waiting for the database.');
    }

    await flushPlannerState(userId);

    const readinessError = await readiness.flushReadinessSnapshots(userId);
    if (readinessError) throw new Error(readinessError);

    await migrateLegacyAccountDocuments(userId, accountDocuments, readiness);
    const documentError = await accountDocuments.flushAccountDocumentWrites(userId);
    if (documentError) throw new Error(documentError);
    if (accountDocuments.hasPendingAccountDocumentWrites(userId)) {
      throw new Error('Some account progress is still waiting for the database.');
    }

    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Database sync did not finish.';
    return {
      ok: false,
      error: `Nothing was cleared. ${detail} Please reconnect and try again.`
    };
  }
}

/** Clear only the disposable device cache while keeping the authenticated
 * Supabase session. Store listeners are stopped first so resetting Zustand
 * cannot echo defaults back over the just-confirmed account documents. */
export async function clearLocalCacheSafely(userId: string): Promise<DurabilityFlushResult> {
  // Resolve cleanup controls first. Any edit that lands while these chunks
  // load is still captured by the barrier immediately below.
  const [{ startAccountStateSync, stopAccountStateSync }, { wipeLocalState }] = await Promise.all([
    import('@/lib/account-state'),
    import('@/lib/isolation')
  ]);
  const durable = await flushAllDurableState(userId);
  if (!durable.ok) return durable;

  // No asynchronous gap is allowed between confirmation and freezing writers.
  stopAccountStateSync(userId);
  stopSync();
  try {
    await wipeLocalState();
    return { ok: true };
  } catch (error) {
    // The database copy was already confirmed, but this authenticated device
    // must resume its writers if local cleanup was only partial.
    initSync(userId);
    void startAccountStateSync(userId).catch((restartError) => {
      console.error(
        '[air] Account sync could not restart after cache cleanup failed.',
        restartError
      );
    });
    const detail = error instanceof Error ? error.message : 'Device cache cleanup failed.';
    return {
      ok: false,
      error: `Your database copy is safe, but this device cache was not fully cleared. ${detail}`
    };
  }
}
