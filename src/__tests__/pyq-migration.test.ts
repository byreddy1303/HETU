import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PYQ production audit migration', () => {
  it('enforces one active set and immutable version-2 attempt receipts', () => {
    const sql = readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260808000001_pyq_attempt_audit.sql'
      ),
      'utf8'
    );

    expect(sql).toContain('pyq_sessions_one_active_per_user');
    expect(sql).toContain("where status = 'active'");
    expect(sql).toContain('pyq_attempts_v2_audit_check');
    expect(sql).toContain('prevent_pyq_attempt_mutation');
    expect(sql).toContain('Committed PYQ attempts are immutable');
    expect(sql).toContain('drop policy if exists del_own on public.pyq_attempts');
  });
});
