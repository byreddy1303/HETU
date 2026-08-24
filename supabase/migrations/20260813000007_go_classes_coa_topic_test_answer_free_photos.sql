-- Reusable question images must never reveal a prior result. Replace every
-- original GO Classes COA Topic Test image reference with the answer-free crop.
-- Selected answers, keys, correctness, and timings remain structured fields.
do $migration$
declare
  target_user_id uuid;
  attempt_rows integer;
  journal_rows integer;
begin
  select id into target_user_id
  from public.users
  where lower(username) = lower('kalyan')
  limit 1;

  if target_user_id is null then
    return;
  end if;

  begin
    alter table public.pyq_attempts disable trigger pyq_attempts_immutable;

    update public.pyq_attempts as attempt
    set screenshot_url = '/pyq/images/go-classes-coa-topic-test/question-q'
      || lpad(split_part(attempt.question_uid, ':', 3), 2, '0')
      || '.png'
    where attempt.user_id = target_user_id
      and attempt.question_uid like 'goclasses:coa-topic-test:%'
      and split_part(attempt.question_uid, ':', 3) ~ '^[0-9]+$'
      and split_part(attempt.question_uid, ':', 3)::integer between 1 and 15;

    get diagnostics attempt_rows = row_count;

    alter table public.pyq_attempts enable trigger pyq_attempts_immutable;
  exception
    when others then
      alter table public.pyq_attempts enable trigger pyq_attempts_immutable;
      raise;
  end;

  update public.questions as question
  set image_url = '/pyq/images/go-classes-coa-topic-test/question-q'
    || lpad(
      substring(
        question.source_ref
        from '^GO Classes COA Topic Test · Q([0-9]+) ·'
      ),
      2,
      '0'
    )
    || '.png'
  where question.user_id = target_user_id
    and question.source_ref ~ '^GO Classes COA Topic Test · Q([0-9]+) ·';

  get diagnostics journal_rows = row_count;

  if attempt_rows <> 15 or journal_rows <> 15 then
    raise exception
      'Expected 15 answer-free COA photos in attempts and journal; updated % and %',
      attempt_rows,
      journal_rows;
  end if;
end
$migration$;
