# Data preservation and release gates

No implementation can guarantee that data can never be lost. These controls
reduce accidental loss; backups, recovery drills, restricted credentials and
operator review remain mandatory. **The replacement is not cleared for cutover.**

## Implemented controls

- Record replacement requires `expected_version`. Missing preconditions return
  428; stale versions return 409. Identical retry payloads are no-ops.
- PostgreSQL transaction-scoped identity locks serialize creates and updates.
- Every insert/update creates an append-only revision in the same transaction.
  A rollback rolls back both. Existing records are snapshotted during migration.
- PostgreSQL also snapshots account profiles and file metadata in
  `entity_revisions`, including changes written outside the API. Recovery of
  these metadata snapshots is currently an operator task, not a public API.
- Deletes are tombstones. An ordinary upsert cannot resurrect a deleted record.
  Authenticated owners can list history and explicitly restore a prior version.
- Database triggers reject physical DELETE/TRUNCATE of records, users, file
  metadata and record history; history UPDATE is also rejected. These controls
  do not protect against a database owner deliberately dropping/disabling them.
- Clerk deletion disables access without purging records or objects. Previously
  queued purge jobs fail instead of erasing data.
- R2 deletion only hides metadata. Restore verifies the retained object. Upload
  signatures require `If-None-Match: *`, preventing upload-URL replay overwrites.
  Invalid upload completion does not erase the object. Downloads are private.
- Production imports and destructive downgrade of the preservation migration
  are disabled. Builds and deploys never execute database migrations.

## Required before live writes

The `Data safety` GitHub Actions workflow runs the PostgreSQL migration,
concurrent-write checks, destructive-operation guards, and backup/restore content
comparison on Python 3.11 and 3.12. It uses disposable PostgreSQL only and no
production secrets. This is regression protection, not a production backup job.

1. Provision separate production and test Neon, Clerk, Upstash and R2 resources.
   Never point previews at production databases. Choose the Neon recovery/PITR
   window explicitly and verify the plan's retention limits in its console.
2. Use different migration-owner and application credentials. The application
   role must not own tables, create/drop schema objects, disable triggers,
   truncate data, or have physical DELETE rights. Grant only the necessary
   SELECT/INSERT/UPDATE and sequence usage; record_revisions needs SELECT/INSERT
   only for the trigger, as does entity_revisions. Do not use Neon owner
   credentials in the API.
3. Enable R2 bucket retention locks and keep the bucket private. Include
   `Content-Type` and `If-None-Match` in exact-origin CORS allowed headers.
   Independently copy objects to a separate backup bucket/account; retain a
   SHA-256 inventory of object content. An ETag is not always a content checksum.
4. Schedule encrypted daily full backups off-account, monitor failures and age,
   and run monthly isolated restore drills. Select and document RPO/RTO; no
   production backup schedule has been configured by this change.
5. Run the complete migration inventory: identities, profile fields, private
   records, shared relationships/chat, invites, settings, attachments and jobs.
   Current importer is a **partial dry-run audit**, not a complete migration.
6. Verify all frontend/native contracts against the Python service. The Clerk
   adapter/domain port in `experimental/` has known security/parity blockers.
   Do not enable it merely because the service health check is reachable.

## Backup and restore drill

Use PostgreSQL client tools matching the source major version, direct database
URLs, encrypted local storage, and a restricted read-only backup credential.

```sh
# Credentials set securely in the shell; never put production URLs in history.
python scripts/backup_database.py backup /secure/backups/hetu-YYYYMMDD
```

`BACKUP_DATABASE_URL` supplies the source. This exports a repeatable-read snapshot,
runs pg_dump against that snapshot, and records per-table row counts and content
hashes plus the dump hash. A failed run has no complete manifest and is not a
verified backup. Directories cannot be overwritten. Treat the entire directory
as sensitive; encrypt and replicate it to storage with independent credentials.

Restore **only to a newly created, empty, isolated database** using pg_restore
`--no-owner --no-acl --exit-on-error --single-transaction` and the dump. Never use
`--clean`, production connection strings, or a rollback migration for recovery.

```sh
# RESTORED_DATABASE_URL points to the isolated restored database.
python scripts/backup_database.py verify /secure/backups/hetu-YYYYMMDD
```

Verification is read-only and compares every public table's content and count.
It does not verify R2 object bytes, Clerk identity ownership, permissions, or
sequences: check those separately before recovery promotion. A retained history
in the same database is useful for recovery but is not an independent backup.

## Retention versus erasure

Soft-deleted data is retained indefinitely by this implementation. A legitimate
account-erasure request requires a separately reviewed workflow covering database
history, objects, replicas and backups. Do not promise erasure after a UI delete.
Existing signed download URLs may remain valid until their short expiry.
