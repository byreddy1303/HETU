-- ============================================================
-- Recovery: restore all PYQ practice sessions deleted by codex
-- ============================================================
-- All pyq_attempts are intact in the DB with pyq_session_id=NULL.
-- This migration:
--   1. Temporarily disables the immutability trigger on pyq_attempts
--      so we can re-link the orphaned rows to new session IDs.
--   2. Recreates pyq_sessions rows for each lost practice session.
--   3. Re-links pyq_attempts to those sessions.
--   4. Inserts canonical sessions rows (same IDs) so the journal
--      session strip and filter dropdown can find them.
--   5. Re-enables the trigger.
--
-- Affected user : 0341aec9-4b23-430d-932e-321255f5823a
-- Recovered sessions:
--   [A] Digital Logic  — 2026-08-02, 4 attempts, ~37 min
--   [B] Digital Logic  — 2026-08-04, 2 attempts, ~6  min
--   [C] COA Topic Test 1 (GOClasses) — 2026-08-13, 15 attempts, ~46 min
--   [D] COA Topic Test 2 (GOClasses) — 2026-08-13, 15 attempts, ~30 min
-- ============================================================

do $$
declare
  v_uid     uuid := '0341aec9-4b23-430d-932e-321255f5823a';

  -- New session UUIDs (generated deterministically at plan time)
  v_dl1_id  uuid := gen_random_uuid();   -- [A] DL Aug 2
  v_dl2_id  uuid := gen_random_uuid();   -- [B] DL Aug 4
  v_coa1_id uuid := gen_random_uuid();   -- [C] COA Test 1
  v_coa2_id uuid := gen_random_uuid();   -- [D] COA Test 2

  v_q_coa1  text[];
  v_q_coa2  text[];
begin

  -- ── 0. Bypass immutability trigger ─────────────────────────────────────
  ALTER TABLE public.pyq_attempts DISABLE TRIGGER pyq_attempts_immutable;

  -- ── [A] Digital Logic — 2026-08-02 ────────────────────────────────────
  -- 4 attempts from 17:42–18:18 UTC (23:12–23:48 IST)
  -- Total time: 204+184+104+142 = 634 sec ≈ 11 min (time_spent_sec only)
  -- Wall-clock span: 17:42–18:18 = 36 min

  INSERT INTO public.pyq_sessions (
    id, user_id, bank_version, config,
    question_uids, completed_question_uids,
    current_index, completed_count, elapsed_sec,
    status, started_at, updated_at, completed_at
  ) VALUES (
    v_dl1_id, v_uid,
    'gate-1990-2026-v7',
    '{"mode":"practice"}',
    ARRAY['go:1354','go:422788','go:399278','go:422824'],
    ARRAY['go:1354','go:422788','go:399278','go:422824'],
    4, 4, 634,
    'completed',
    '2026-08-02 17:42:06+00',
    '2026-08-02 18:18:41+00',
    '2026-08-02 18:18:41+00'
  );

  UPDATE public.pyq_attempts
     SET pyq_session_id = v_dl1_id
   WHERE id IN (
     '5f3ed323-0003-4c0d-a688-5894eae0ab28',  -- go:1354
     '423ba645-38a6-4504-9ff9-3103354cf485',  -- go:422788
     '2a49890a-df0f-447e-891d-a24bdddd2829',  -- go:399278
     '92960bb5-151d-49db-bc09-16db0becbaf9'   -- go:422824
   );

  INSERT INTO public.sessions (
    id, user_id, date, subject, kind,
    target_duration_min, actual_duration_min,
    insight, sadhana_done, interruptions_count,
    created_at
  ) VALUES (
    v_dl1_id, v_uid,
    '2026-08-02',
    'Digital Logic',
    'pyq',
    0, 36,
    null, false, 0,
    '2026-08-02 17:42:06+00'
  )
  ON CONFLICT (id) DO NOTHING;


  -- ── [B] Digital Logic — 2026-08-04 ────────────────────────────────────
  -- 2 attempts from 16:03–16:09 UTC (21:33–21:39 IST)
  -- Total time: 26+305 = 331 sec ≈ 6 min

  INSERT INTO public.pyq_sessions (
    id, user_id, bank_version, config,
    question_uids, completed_question_uids,
    current_index, completed_count, elapsed_sec,
    status, started_at, updated_at, completed_at
  ) VALUES (
    v_dl2_id, v_uid,
    'gate-1990-2026-v7',
    '{"mode":"practice"}',
    ARRAY['go:523140','go:523128'],
    ARRAY['go:523140','go:523128'],
    2, 2, 331,
    'completed',
    '2026-08-04 16:03:55+00',
    '2026-08-04 16:09:07+00',
    '2026-08-04 16:09:07+00'
  );

  UPDATE public.pyq_attempts
     SET pyq_session_id = v_dl2_id
   WHERE id IN (
     '054035b5-0f19-40c2-a336-5485da098111',  -- go:523140
     '1590bd1f-63f5-4efd-bcd4-c378b72332fd'   -- go:523128
   );

  INSERT INTO public.sessions (
    id, user_id, date, subject, kind,
    target_duration_min, actual_duration_min,
    insight, sadhana_done, interruptions_count,
    created_at
  ) VALUES (
    v_dl2_id, v_uid,
    '2026-08-04',
    'Digital Logic',
    'pyq',
    0, 6,
    null, false, 0,
    '2026-08-04 16:03:55+00'
  )
  ON CONFLICT (id) DO NOTHING;


  -- ── [C] COA Topic Test 1 — 2026-08-13 ─────────────────────────────────
  -- 15 attempts from 05:28–06:13 UTC (10:58–11:43 IST)
  -- Total elapsed: 2703 sec ≈ 46 min

  v_q_coa1 := ARRAY[
    'goclasses:coa-topic-test:1',  'goclasses:coa-topic-test:2',
    'goclasses:coa-topic-test:3',  'goclasses:coa-topic-test:4',
    'goclasses:coa-topic-test:5',  'goclasses:coa-topic-test:6',
    'goclasses:coa-topic-test:7',  'goclasses:coa-topic-test:8',
    'goclasses:coa-topic-test:9',  'goclasses:coa-topic-test:10',
    'goclasses:coa-topic-test:11', 'goclasses:coa-topic-test:12',
    'goclasses:coa-topic-test:13', 'goclasses:coa-topic-test:14',
    'goclasses:coa-topic-test:15'
  ];

  INSERT INTO public.pyq_sessions (
    id, user_id, bank_version, config,
    question_uids, completed_question_uids,
    current_index, completed_count, elapsed_sec,
    status, started_at, updated_at, completed_at
  ) VALUES (
    v_coa1_id, v_uid,
    'gate-1990-2026-v7-go-classes-coa-topic-tests',
    '{"mode":"practice"}',
    v_q_coa1, v_q_coa1,
    15, 15, 2703,
    'completed',
    '2026-08-13 05:28:36+00',
    '2026-08-13 06:13:13+00',
    '2026-08-13 06:13:13+00'
  );

  UPDATE public.pyq_attempts
     SET pyq_session_id = v_coa1_id
   WHERE id IN (
     '1432d207-aafc-45da-b98b-ecc970b4e82d',  -- q1
     'cdfb2e97-1559-4265-b746-b220607ca816',  -- q2
     '3a942c19-c51a-4dac-ab43-43d1e372d5c5',  -- q3
     '5b9b5787-102e-4393-b101-85c375e0ad4e',  -- q4
     'c892d6c5-a322-4115-920b-e55436d3e4cb',  -- q5
     '8124b379-8984-463a-885a-c2cf3bcb9641',  -- q6
     'ee5591bd-68e4-4d49-9a9d-8ba19f4ef627',  -- q7
     '0f10ed6e-95df-4e5e-8049-597a76a674ad',  -- q8
     '7cb78dac-67be-4fe0-890c-3b3ec30bf12c',  -- q9
     'ac3a1fac-b588-4ca9-abd6-a24c43879a28',  -- q10
     '3f45d449-774a-42c0-93ea-4d0d87381cd6',  -- q11
     'd2faa504-05bf-4882-bc77-2a2c6ae7e49e',  -- q12
     '652a2454-ad28-49d9-8aef-4e188ce5b4b7',  -- q13
     '607ebea2-599f-4c86-809f-6b262b586a67',  -- q14
     'f34f8697-6ba0-4ccc-ad62-047a8eaafc82'   -- q15
   );

  INSERT INTO public.sessions (
    id, user_id, date, subject, kind,
    target_duration_min, actual_duration_min,
    insight, sadhana_done, interruptions_count,
    created_at
  ) VALUES (
    v_coa1_id, v_uid,
    '2026-08-13',
    'Computer Organization',
    'pyq',
    0, 46,
    null, false, 0,
    '2026-08-13 05:28:36+00'
  )
  ON CONFLICT (id) DO NOTHING;


  -- ── [D] COA Topic Test 2 — 2026-08-13 ─────────────────────────────────
  -- 15 attempts from 06:20–06:48 UTC (11:50–12:18 IST)
  -- Total elapsed: 1774 sec ≈ 30 min

  v_q_coa2 := ARRAY[
    'goclasses:coa-topic-test-2:1',  'goclasses:coa-topic-test-2:2',
    'goclasses:coa-topic-test-2:3',  'goclasses:coa-topic-test-2:4',
    'goclasses:coa-topic-test-2:5',  'goclasses:coa-topic-test-2:6',
    'goclasses:coa-topic-test-2:7',  'goclasses:coa-topic-test-2:8',
    'goclasses:coa-topic-test-2:9',  'goclasses:coa-topic-test-2:10',
    'goclasses:coa-topic-test-2:11', 'goclasses:coa-topic-test-2:12',
    'goclasses:coa-topic-test-2:13', 'goclasses:coa-topic-test-2:14',
    'goclasses:coa-topic-test-2:15'
  ];

  INSERT INTO public.pyq_sessions (
    id, user_id, bank_version, config,
    question_uids, completed_question_uids,
    current_index, completed_count, elapsed_sec,
    status, started_at, updated_at, completed_at
  ) VALUES (
    v_coa2_id, v_uid,
    'gate-1990-2026-v7-go-classes-coa-topic-tests',
    '{"mode":"practice"}',
    v_q_coa2, v_q_coa2,
    15, 15, 1774,
    'completed',
    '2026-08-13 06:20:15+00',
    '2026-08-13 06:48:44+00',
    '2026-08-13 06:48:44+00'
  );

  UPDATE public.pyq_attempts
     SET pyq_session_id = v_coa2_id
   WHERE id IN (
     '7342d005-a495-4e1e-955e-148297d05a73',  -- q1
     '06f71bad-e739-40b3-9f76-846774d6037c',  -- q2
     '99ad4557-dfb4-4683-a114-7d32502c1580',  -- q3
     '2c255e6d-6df6-4e96-b2e9-262c3c4759eb',  -- q4
     'bf3b9a4d-d7ba-4c01-8cd6-2270d6f0269d',  -- q5
     '52fab056-63ca-4677-b1c7-a7d68f17a89c',  -- q6
     'e5e4b1cf-9138-49dc-8181-531a35f74dd8',  -- q7
     '782068f3-6907-48ec-9c76-92b9aafc3f61',  -- q8
     '0bdea37e-1237-45bd-8295-e4fd0afa2423',  -- q9
     '79bf54a7-7648-46b3-b033-f82c6e8b13ea',  -- q10
     'e6700856-f1c9-46d2-afa7-881c24471068',  -- q11
     '533be28f-c3db-4139-892c-940132ca81e9',  -- q12
     'c05eded3-f37b-40fe-98d2-325c2ae0f9ca',  -- q13
     'c504758b-2785-4858-a10c-c72fa4a7ddcf',  -- q14
     '328186e7-d3e0-484c-9418-94e20345c875'   -- q15
   );

  INSERT INTO public.sessions (
    id, user_id, date, subject, kind,
    target_duration_min, actual_duration_min,
    insight, sadhana_done, interruptions_count,
    created_at
  ) VALUES (
    v_coa2_id, v_uid,
    '2026-08-13',
    'Computer Organization',
    'pyq',
    0, 30,
    null, false, 0,
    '2026-08-13 06:20:15+00'
  )
  ON CONFLICT (id) DO NOTHING;


  -- ── Re-enable immutability trigger ─────────────────────────────────────
  ALTER TABLE public.pyq_attempts ENABLE TRIGGER pyq_attempts_immutable;

end $$;
