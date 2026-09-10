import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const config = readFileSync(new URL('supabase/config.toml', root), 'utf8');
const projectId = /^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m.exec(config)?.[1];
if (!projectId) throw new Error('A local Supabase project_id is required.');
const fixture = readFileSync(new URL('scripts/fixtures/planner-legacy-migration.sql', root), 'utf8');
const migration = readFileSync(
  new URL('supabase/migrations/20260902051324_unified_planner_durability.sql', root),
  'utf8'
);
const result = spawnSync(
  'docker',
  ['exec', '-i', `supabase_db_${projectId}`, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
  {
    cwd: fileURLToPath(root),
    input: fixture.replace('-- INSERT_PLANNER_MIGRATION_HERE', migration),
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  }
);
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error) throw result.error;
const failedAssertion = /(?:^|\n)\s*not ok\b|Looks like you failed|planned \d+ tests but ran/m.test(result.stdout ?? '');
process.exitCode = result.status !== 0 || failedAssertion ? 1 : 0;
