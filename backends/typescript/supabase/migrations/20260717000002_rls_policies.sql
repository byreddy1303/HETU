-- RLS. Every user-owned table locked to auth.uid() by default.
alter table users enable row level security;
create policy sel_self on users for select using (id = auth.uid());
create policy upd_self on users for update using (id = auth.uid());
create policy ins_self on users for insert with check (id = auth.uid());

alter table sessions enable row level security;
create policy sel_own on sessions for select using (user_id = auth.uid());
create policy ins_own on sessions for insert with check (user_id = auth.uid());
create policy upd_own on sessions for update using (user_id = auth.uid());
create policy del_own on sessions for delete using (user_id = auth.uid());

alter table questions enable row level security;
create policy sel_own on questions for select using (user_id = auth.uid());
create policy ins_own on questions for insert with check (user_id = auth.uid());
create policy upd_own on questions for update using (user_id = auth.uid());
create policy del_own on questions for delete using (user_id = auth.uid());

alter table patterns enable row level security;
create policy sel_own on patterns for select using (user_id = auth.uid());
create policy ins_own on patterns for insert with check (user_id = auth.uid());
create policy upd_own on patterns for update using (user_id = auth.uid());
create policy del_own on patterns for delete using (user_id = auth.uid());

alter table reattempts enable row level security;
create policy sel_own on reattempts for select using (user_id = auth.uid());
create policy ins_own on reattempts for insert with check (user_id = auth.uid());
create policy upd_own on reattempts for update using (user_id = auth.uid());
create policy del_own on reattempts for delete using (user_id = auth.uid());

alter table formulas enable row level security;
create policy sel_own on formulas for select using (user_id = auth.uid());
create policy ins_own on formulas for insert with check (user_id = auth.uid());
create policy upd_own on formulas for update using (user_id = auth.uid());
create policy del_own on formulas for delete using (user_id = auth.uid());

alter table trigger_phrases enable row level security;
create policy sel_own on trigger_phrases for select using (user_id = auth.uid());
create policy ins_own on trigger_phrases for insert with check (user_id = auth.uid());
create policy upd_own on trigger_phrases for update using (user_id = auth.uid());
create policy del_own on trigger_phrases for delete using (user_id = auth.uid());

alter table weekly_reviews enable row level security;
create policy sel_own on weekly_reviews for select using (user_id = auth.uid());
create policy ins_own on weekly_reviews for insert with check (user_id = auth.uid());
create policy upd_own on weekly_reviews for update using (user_id = auth.uid());
create policy del_own on weekly_reviews for delete using (user_id = auth.uid());

alter table interruption_logs enable row level security;
create policy sel_own on interruption_logs for select using (user_id = auth.uid());
create policy ins_own on interruption_logs for insert with check (user_id = auth.uid());

alter table doubt_sessions enable row level security;
create policy sel_own on doubt_sessions for select using (user_id = auth.uid());
create policy ins_own on doubt_sessions for insert with check (user_id = auth.uid());
create policy upd_own on doubt_sessions for update using (user_id = auth.uid());

alter table variations enable row level security;
create policy sel_own on variations for select using (user_id = auth.uid());
create policy ins_own on variations for insert with check (user_id = auth.uid());
create policy upd_own on variations for update using (user_id = auth.uid());

alter table triangulate_logs enable row level security;
create policy sel_own on triangulate_logs for select using (user_id = auth.uid());
create policy ins_own on triangulate_logs for insert with check (user_id = auth.uid());
create policy upd_own on triangulate_logs for update using (user_id = auth.uid());

alter table llm_usage_daily enable row level security;
create policy sel_own on llm_usage_daily for select using (user_id = auth.uid());
create policy ins_own on llm_usage_daily for insert with check (user_id = auth.uid());
create policy upd_own on llm_usage_daily for update using (user_id = auth.uid());

alter table buddies enable row level security;
create policy sel_involved on buddies for select
  using (user_a = auth.uid() or user_b = auth.uid());
create policy ins_involved on buddies for insert
  with check (user_a = auth.uid() or user_b = auth.uid());
create policy upd_involved on buddies for update
  using (user_a = auth.uid() or user_b = auth.uid());

alter table shared_insights enable row level security;
create policy sel_own_or_buddy on shared_insights for select using (
  user_id = auth.uid()
  or exists (
    select 1 from buddies b
    where b.status = 'active'
      and ((b.user_a = auth.uid() and b.user_b = shared_insights.user_id)
        or (b.user_b = auth.uid() and b.user_a = shared_insights.user_id))
  )
);
create policy ins_own on shared_insights for insert with check (user_id = auth.uid());
create policy upd_own on shared_insights for update using (user_id = auth.uid());
create policy del_own on shared_insights for delete using (user_id = auth.uid());

alter table question_shares enable row level security;
create policy sel_involved on question_shares for select
  using (from_user = auth.uid() or to_user = auth.uid());
create policy ins_from on question_shares for insert
  with check (from_user = auth.uid());
create policy upd_to on question_shares for update
  using (to_user = auth.uid());

alter table study_rooms enable row level security;
create policy sel_participant on study_rooms for select
  using (auth.uid() = any(participants));
create policy ins_creator on study_rooms for insert
  with check (created_by = auth.uid() and auth.uid() = any(participants));

alter table study_room_presence enable row level security;
create policy sel_participant on study_room_presence for select using (
  exists (select 1 from study_rooms r
    where r.id = room_id and auth.uid() = any(r.participants))
);
create policy ins_self on study_room_presence for insert with check (user_id = auth.uid());
create policy del_self on study_room_presence for delete using (user_id = auth.uid());

alter table invites enable row level security;
create policy sel_by_token on invites for select using (true);
create policy ins_own on invites for insert with check (issued_by = auth.uid());
create policy upd_use on invites for update using (used_by is null);
