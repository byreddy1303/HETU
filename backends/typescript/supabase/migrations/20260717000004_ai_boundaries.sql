set search_path = public, extensions;

-- Audit log for any suspected LLM-authored writes to user-tag fields.
-- Enforcement is primarily via the llm_use_t enum (no 'auto_tag' value)
-- and by keeping tag mutations client-authored only.
create table ai_boundary_violations (
  id           uuid primary key default uuid_generate_v4(),
  table_name   text not null,
  attempted_at timestamptz not null default now(),
  user_id      uuid,
  details      jsonb
);

alter table ai_boundary_violations enable row level security;
create policy sel_own on ai_boundary_violations for select using (user_id = auth.uid());
