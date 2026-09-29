# Production database backups

The scheduled GitHub Actions job makes a repeatable-read PostgreSQL dump and
row-hash manifest each day at 02:17 UTC. It encrypts both with the repository's
X25519 public recipient key, uploads the ciphertext to the private `hetu-backups`
Vercel Blob store, downloads it again, and checks its SHA-256 digest. The job
has a read-only database credential and Blob read/write token; it does not have
the decryption key.

GitHub Actions needs two repository secrets to run: `HETU_BACKUP_DATABASE_URL`
(the `hetu_backup` read-only Neon connection string) and
`HETU_BACKUP_BLOB_TOKEN` (the private store token). The workflow also supports
manual dispatch. A failed job must be investigated before enabling the Python
backend in production.

The private identity key is held outside the repository at
`~/.config/hetu/backup-x25519.key`. An operator must preserve a separate secure
copy; losing it makes these backups undecryptable. To recover, download a
`.aesgcm` object from the private store and run:

```sh
python backends/python/scripts/encrypt_database_backup.py decrypt \
  backup.aesgcm ~/.config/hetu/backup-x25519.key recovered-backup
```

The command authenticates the ciphertext and checks the dump against its
manifest. Restore `recovered-backup/database.dump` **only into a new isolated
PostgreSQL database** with matching or newer client tools, then run
`backup_database.py verify recovered-backup` with `RESTORED_DATABASE_URL`
pointing at that database. Compare the manifest and application behavior
before switching any live connection string. Never restore over production.
