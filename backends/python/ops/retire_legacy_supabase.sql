-- Operator-only, reversible retirement of the legacy Supabase writer.
-- Apply after both replacement deployments pass their release checks.
BEGIN;
SET LOCAL lock_timeout = '10s';
CREATE SCHEMA IF NOT EXISTS hetu_retired;
REVOKE ALL ON SCHEMA hetu_retired FROM PUBLIC;
CREATE TABLE IF NOT EXISTS hetu_retired.cron_state (
    jobid bigint PRIMARY KEY,
    was_active boolean NOT NULL
);
INSERT INTO hetu_retired.cron_state (jobid, was_active)
SELECT jobid, active FROM cron.job ON CONFLICT (jobid) DO NOTHING;
DO $$
DECLARE job record;
BEGIN
    FOR job IN SELECT jobid FROM cron.job WHERE active LOOP
        PERFORM cron.alter_job(job.jobid, active := false);
    END LOOP;
END $$;
CREATE OR REPLACE FUNCTION hetu_retired.reject_writes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'This database is a retired read-only archive. Use https://hetu-app.vercel.app and the updated Android app.'
        USING ERRCODE = '55000';
END $$;
REVOKE ALL ON FUNCTION hetu_retired.reject_writes() FROM PUBLIC;
DO $$
DECLARE relation record;
BEGIN
    FOR relation IN
        SELECT schemaname, tablename FROM pg_tables
        WHERE schemaname = 'public' OR (schemaname = 'auth' AND tablename = 'users')
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgrelid = format('%I.%I', relation.schemaname, relation.tablename)::regclass
              AND tgname = 'hetu_retired_read_only'
        ) THEN
            EXECUTE format(
                'CREATE TRIGGER hetu_retired_read_only BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION hetu_retired.reject_writes()',
                relation.schemaname, relation.tablename
            );
        END IF;
    END LOOP;
END $$;
COMMIT;
