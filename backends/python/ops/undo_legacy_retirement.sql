-- Recovery only: reopening legacy writes after cutover can create two histories.
-- Reconcile replacement data and choose one writer before running this script.
BEGIN;
SET LOCAL lock_timeout = '10s';
DO $$
DECLARE relation record;
DECLARE job record;
BEGIN
    FOR relation IN
        SELECT n.nspname AS schema_name, c.relname AS table_name
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE t.tgname = 'hetu_retired_read_only'
    LOOP
        EXECUTE format('DROP TRIGGER hetu_retired_read_only ON %I.%I', relation.schema_name, relation.table_name);
    END LOOP;
    FOR job IN SELECT jobid, was_active FROM hetu_retired.cron_state LOOP
        PERFORM cron.alter_job(job.jobid, active := job.was_active);
    END LOOP;
END $$;
COMMIT;
