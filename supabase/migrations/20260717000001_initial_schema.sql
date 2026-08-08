-- HETU initial schema.
-- Supabase installs extension functions in the `extensions` schema; extend
-- the search path so unqualified calls (uuid_generate_v4, citext, ...) resolve.
set search_path = public, extensions;
create extension if not exists "uuid-ossp";

create type outcome_t as enum ('R','RBS','RBG','W-C','W-E','W-R');
create type root_cause_t as enum ('concept','formula','reading','computation','strategy');
create type mark_decision_t as enum ('MARK','SKIP','FIFTY_FIFTY');
create type reattempt_stage_t as enum ('D3','D10','D30','MASTERED');
create type buddy_status_t as enum ('pending','active','paused');
create type share_status_t as enum ('sent','solved','discussed');
create type llm_provider_t as enum ('groq','gemini','openrouter','cerebras');
create type llm_use_t as enum ('quick_explain','deep_doubt','triangulate','long_context','reflex_score','variation','formula_extract','weekly_synthesis');

create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  email         text not null unique,
  exam_date     date default '2027-02-06',
  target_rank   int  default 100,
  sadhana_practice boolean default false,
  timezone      text default 'Asia/Kolkata',
  created_at    timestamptz not null default now()
);

create table sessions (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references users(id) on delete cascade,
  date                 date not null default current_date,
  subject              text not null,
  target_duration_min  int  not null default 90,
  actual_duration_min  int,
  insight              text,
  sadhana_done         boolean default false,
  interruptions_count  int default 0,
  created_at           timestamptz not null default now()
);

create table questions (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references users(id) on delete cascade,
  session_id        uuid references sessions(id) on delete set null,
  subject           text not null,
  subtopic          text,
  source_year       int,
  source_ref        text,
  question_text     text,
  image_url         text,
  time_spent_sec    int not null,
  target_time_sec   int default 120,
  outcome           outcome_t not null,
  pattern_name      text,
  trigger_sentence  text,
  root_cause        root_cause_t,
  mark_decision     mark_decision_t,
  mark_correct      boolean,
  created_at        timestamptz not null default now()
);

create table patterns (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references users(id) on delete cascade,
  name           text not null,
  subject        text not null,
  count          int not null default 1,
  is_reflexed    boolean default false,
  mastery_level  int default 0 check (mastery_level between 0 and 4),
  first_seen_at  timestamptz not null default now(),
  unique(user_id, name)
);

create table reattempts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id) on delete cascade,
  question_id     uuid not null references questions(id) on delete cascade,
  scheduled_date  date not null,
  stage           reattempt_stage_t not null default 'D3',
  history         jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create table formulas (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references users(id) on delete cascade,
  name           text not null,
  subject        text not null,
  expression     text not null,
  forgot_count   int default 0,
  last_reviewed  date,
  next_review    date not null default current_date,
  created_at     timestamptz not null default now()
);

create table trigger_phrases (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references users(id) on delete cascade,
  phrase            text not null,
  concept           text not null,
  reflex_time_ms    int,
  question_ids      uuid[] default '{}'::uuid[],
  created_at        timestamptz not null default now()
);

create table weekly_reviews (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references users(id) on delete cascade,
  week_start            date not null,
  root_cause_summary    text,
  weakest_concept       text,
  this_weeks_fix        text,
  llm_synthesis         text,
  created_at            timestamptz not null default now(),
  unique(user_id, week_start)
);

create table interruption_logs (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references users(id) on delete cascade,
  session_id  uuid not null references sessions(id) on delete cascade,
  ts          timestamptz not null default now(),
  kind        text not null
);

create table doubt_sessions (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references users(id) on delete cascade,
  question_id    uuid references questions(id) on delete set null,
  use_case       llm_use_t not null,
  template_used  text,
  user_input     text not null,
  provider       llm_provider_t not null,
  model          text not null,
  response       text not null,
  latency_ms     int,
  was_helpful    boolean,
  created_at     timestamptz not null default now()
);

create table variations (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references users(id) on delete cascade,
  parent_question_id    uuid not null references questions(id) on delete cascade,
  generated_text        text not null,
  added_to_reattempt    boolean default false,
  created_at            timestamptz not null default now()
);

create table triangulate_logs (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references users(id) on delete cascade,
  prompt            text not null,
  groq_resp         text,
  gemini_resp       text,
  openrouter_resp   text,
  user_conclusion   text,
  disagreement_noted text,
  created_at        timestamptz not null default now()
);

create table llm_usage_daily (
  user_id  uuid not null references users(id) on delete cascade,
  day      date not null,
  count    int not null default 0,
  primary key (user_id, day)
);

create table buddies (
  id          uuid primary key default uuid_generate_v4(),
  user_a      uuid not null references users(id) on delete cascade,
  user_b      uuid not null references users(id) on delete cascade,
  status      buddy_status_t not null default 'pending',
  created_at  timestamptz not null default now(),
  unique(user_a, user_b),
  check (user_a < user_b)
);

create table shared_insights (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references users(id) on delete cascade,
  week_start   date not null,
  insight      text not null,
  created_at   timestamptz not null default now(),
  unique(user_id, week_start)
);

create table question_shares (
  id           uuid primary key default uuid_generate_v4(),
  from_user    uuid not null references users(id) on delete cascade,
  to_user      uuid not null references users(id) on delete cascade,
  question_id  uuid not null references questions(id),
  note         text,
  status       share_status_t not null default 'sent',
  created_at   timestamptz not null default now()
);

create table study_rooms (
  id             uuid primary key default uuid_generate_v4(),
  name           text not null,
  subject        text not null,
  start_time     timestamptz not null,
  duration_min   int not null default 90,
  participants   uuid[] not null,
  created_by     uuid not null references users(id) on delete cascade,
  created_at     timestamptz not null default now()
);

create table study_room_presence (
  room_id     uuid not null references study_rooms(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table invites (
  id          uuid primary key default uuid_generate_v4(),
  token       text not null unique,
  issued_by   uuid not null references users(id) on delete cascade,
  used_by     uuid references users(id),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index on questions(user_id, created_at desc);
create index on questions(user_id, outcome);
create index on questions(user_id, subject);
create index on reattempts(user_id, scheduled_date);
create index on patterns(user_id, count desc);
create index on formulas(user_id, next_review);
create index on doubt_sessions(user_id, created_at desc);
create index on buddies(user_a);
create index on buddies(user_b);
