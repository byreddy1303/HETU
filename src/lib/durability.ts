// Durability barrier simplification.
//
// Postgres is the only durable store and every write is write-through, so
// there is no local durability barrier to cross before sign-out. These hooks
// remain so callers (auth store, bootstrap) keep compiling while always
// reporting success.
import { wipeLocalState } from '@/lib/isolation';

export interface DurabilityFlushResult {
  ok: boolean;
  error?: string;
}

/** All study data is already committed to the database. Nothing to flush. */
export async function flushAllDurableState(_userId: string): Promise<DurabilityFlushResult> {
  return { ok: true };
}

/** Drop the RAM-only device cache while keeping the authenticated session. */
export async function clearLocalCacheSafely(_userId: string): Promise<DurabilityFlushResult> {
  try {
    await wipeLocalState();
    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Device cache cleanup failed.';
    return { ok: false, error: `Your database copy is safe. ${detail}` };
  }
}