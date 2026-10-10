# Data preservation and recovery

Production uses one online PostgreSQL database through Python/FastAPI. The
website and updated Android app share permanent HETU account IDs and records.
See [production verification](PRODUCTION.md) for the cutover evidence and limits.

## Runtime controls

- The deployed `hetu_app` role has SELECT/INSERT/UPDATE and required sequence
  permissions. It cannot physically delete/truncate data, create schema objects,
  own tables or disable their preservation triggers. Owner credentials are used
  only for operator migrations and imports.
- Replacement writes require `expected_version`: missing preconditions return
  428 and stale writes return 409. Identical retries are no-ops. Transaction locks
  serialize changes to the same record.
- Every record change appends a revision in the same transaction. Database
  triggers also snapshot profiles and file metadata, including operator writes.
  History is immutable; physical DELETE/TRUNCATE is rejected on protected tables.
- UI deletions create tombstones. Upserts cannot implicitly resurrect them.
  Owners can inspect record history and explicitly restore a previous version.
  Restoring profiles/file metadata remains an operator operation.
- Clerk account deletion disables application access and retains data. Queued
  purge operations fail instead of physically erasing retained records.
- Source imports preserve account IDs, source timestamps, payloads and tombstones,
  and record content hashes/counts in an import ledger. Unchanged source payloads
  do not overwrite subsequent Python changes. Deploys never import data or run
  migrations automatically.
- The legacy Supabase writer and its scheduled jobs are retired. Its archive
  remains readable for recovery; the application has no runtime dependency on it.
  Retirement SQL and its recovery inverse are in `../ops/`.

## Backups

GitHub Actions runs an encrypted production backup daily at 02:17 UTC, using the
read-only `hetu_backup` role and a private Vercel Blob store. Each backup uses a
repeatable-read snapshot, includes all public tables and a manifest of content
hashes/counts, and verifies encrypted upload bytes by downloading them again.
The recipient private key stays offline on the operator's machine; only its
public key is committed. Never upload the private key to CI or storage.

An isolated PostgreSQL 18 restore and full public-table content comparison passed
before cutover. The final cutover backup must also pass this comparison. A CI
upload result alone does not prove restore success or an acceptable recovery time.
Daily backups imply up to approximately one day of changes can fall between runs;
no specific recovery-time or provider PITR-retention guarantee is claimed here.
The backup storage shares the Vercel account, so an independently administered
copy is still useful for recovery from account loss.

Use matching PostgreSQL client tools and direct database URLs. Credentials must
come from private environment files or secret injection, never command history.

```sh
# BACKUP_DATABASE_URL is a restricted source connection.
python scripts/backup_database.py backup /secure/backups/hetu-YYYYMMDD
python scripts/encrypt_database_backup.py encrypt /secure/backups/hetu-YYYYMMDD \
  config/backup-recipient.pub /secure/backups/hetu-YYYYMMDD.aesgcm
```

Restore only into a new, empty, isolated database with pg_restore
`--no-owner --no-acl --exit-on-error --single-transaction`. Never use `--clean`
or a production connection for a drill. Then verify every public table:

```sh
# RESTORED_DATABASE_URL points to the isolated restored database.
python scripts/backup_database.py verify /secure/backups/hetu-YYYYMMDD
```

The comparison verifies rows and counts, not external object bytes, Clerk account
ownership, sequences or restored privileges. Check those separately before a
recovery promotion. History in the same database is not an independent backup.
Regression tests use disposable PostgreSQL and exercise concurrency, preservation
triggers and backup/restore behavior without production secrets.

## Storage and retained deletion

Existing study images are inline PostgreSQL records. Optional generic R2 file
uploads need a production bucket; that integration is currently unavailable.
The implemented file API preserves objects on delete, prevents signed-upload
replay overwrites with `If-None-Match: *`, and checks retained bytes on restore.
Configure private bucket retention and separate object backups before enabling it.

Tombstoned data is retained indefinitely. A request for permanent account erasure
needs a separate workflow covering revisions, external objects, replicas and
backups. A UI delete does not promise erasure. No implementation can guarantee
zero loss; operator backups and recovery drills remain necessary.
