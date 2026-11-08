# Application backup and recovery

The local helper uses the existing server-only Supabase credentials. Never paste keys or backup contents into chat, Git or public folders.

## Capture and verify

From this checkout, with Node available:

```sh
node scripts/backup-commerce.mjs capture
node scripts/backup-commerce.mjs verify /absolute/path/to/snapshot.ksbak
node scripts/backup-commerce.mjs restore-check-sql /absolute/path/to/snapshot.ksbak
```

- Files are AES-256-GCM encrypted, compressed and created with mode 0600 under the owner's `.config/karisan/backups` directory.
- The recovery key is a separate 0600 file: `.config/karisan/backup-recovery.key`. Losing it makes the encrypted backup unusable. Keep a separate owner-controlled copy of both the backup and key, preferably in different secure locations. No off-device upload was performed.
- Capture reads application tables in a single stable database snapshot. It then copies locally used product image assets and all flat objects from the `product-images` bucket, recording SHA-256 checksums.
- Media listing is not an atomic storage snapshot. Avoid photo edits during capture; verification confirms copied bytes, not the absence of an edit made concurrently.
- New captures also include schema migration contents/checksums and the source commit/dirty-worktree indicator. This is an application-data/image backup, not a full Supabase infrastructure dump. Supabase Auth users, provider/project configuration, other buckets, D1 sessions/analytics and environment secrets are NOT included. Source is retained in Git; video assets are not duplicated into this commerce backup.

## Non-destructive restore rehearsal

`restore-check-sql` decrypts the backup locally and writes a private SQL file. That file contains order/customer data when such records exist. Open it only in the authorized project's SQL editor; do not commit or share it publicly.

The SQL creates an isolated `qa_restore_*` schema with RLS enabled, restores every application table, compares every row, recreates/checks foreign keys, and ends with `ROLLBACK`. It never inserts into or deletes from live `public` tables. A successful result is only a rehearsal, not an in-place recovery or project migration.

Verified on 2026-11-08: encrypted snapshot with 13 application tables and 88 image objects/assets; local decryption/integrity verification passed; actual PostgreSQL restore rehearsal passed with row comparisons and foreign keys, then rolled back.

## Actual incident recovery

Keep the damaged database unchanged. Provision an owner-approved separate recovery project, apply the reviewed schema/migrations, restore data and Storage, then verify product counts, orders, variants, financial ledgers and provider configuration before any cutover. Never remove the rehearsal's rollback and point it at the live `public` schema. Actual incident restore/cutover and automated off-device backup scheduling require a separate reviewed procedure and the chosen hosting setup.
