-- Give the standalone Question Log its own daily interactive reminder.

set search_path = public;

alter table public.study_notification_preferences
  drop constraint if exists study_notification_preferences_category_check;

alter table public.study_notification_preferences
  add constraint study_notification_preferences_category_check check (category in (
    'dashboard', 'planner', 'reattempts', 'pyq', 'sessions', 'log', 'journal',
    'patterns', 'heatmap', 'calibration', 'readiness', 'trigger_drill',
    'formulas', 'syllabus', 'weekly_review'
  ));

create or replace function public.seed_study_notification_preferences(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.study_notification_preferences (user_id, category, hour_local, minute_local)
  values
    (p_user_id, 'dashboard',      6,  0),
    (p_user_id, 'planner',        6, 45),
    (p_user_id, 'reattempts',     7, 30),
    (p_user_id, 'pyq',            9,  0),
    (p_user_id, 'sessions',      10, 30),
    (p_user_id, 'log',           11, 15),
    (p_user_id, 'formulas',      12,  0),
    (p_user_id, 'syllabus',      13, 30),
    (p_user_id, 'patterns',      15,  0),
    (p_user_id, 'trigger_drill', 16, 30),
    (p_user_id, 'calibration',   18,  0),
    (p_user_id, 'readiness',     19,  0),
    (p_user_id, 'heatmap',       19, 45),
    (p_user_id, 'journal',       20, 30),
    (p_user_id, 'weekly_review', 21, 30)
  on conflict (user_id, category) do nothing;
$$;

revoke all on function public.seed_study_notification_preferences(uuid) from public;
grant execute on function public.seed_study_notification_preferences(uuid) to service_role;

select public.seed_study_notification_preferences(existing.id)
from public.users existing;
