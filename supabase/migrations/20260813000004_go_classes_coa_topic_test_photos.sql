-- Attach the learner-provided screenshots to the original GO Classes COA
-- Topic Test bank entries, immutable attempt receipts, and journal records.
-- Practice uses answer-free crops; receipts retain the full answer/result strip.
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
    set
      screenshot_url = '/pyq/images/go-classes-coa-topic-test/attempt-q'
        || lpad(split_part(attempt.question_uid, ':', 3), 2, '0')
        || '.png',
      question_snapshot = jsonb_set(
        attempt.question_snapshot,
        '{html}',
        to_jsonb(
          case
            when coalesce(attempt.question_snapshot->>'html', '') like
              '%/pyq/images/go-classes-coa-topic-test/question-q%.png%'
              then coalesce(attempt.question_snapshot->>'html', '')
            else coalesce(attempt.question_snapshot->>'html', '')
              || '<figure><img src="/pyq/images/go-classes-coa-topic-test/question-q'
              || lpad(split_part(attempt.question_uid, ':', 3), 2, '0')
              || '.png" alt="GO Classes COA Topic Test question '
              || split_part(attempt.question_uid, ':', 3)
              || ' source screenshot"></figure>'
          end
        ),
        true
      )
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
  set image_url = '/pyq/images/go-classes-coa-topic-test/attempt-q'
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
      'Expected 15 GO Classes COA photo links in attempts and journal, updated % and %',
      attempt_rows,
      journal_rows;
  end if;
end
$migration$;
