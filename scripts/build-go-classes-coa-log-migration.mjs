#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { PYQ_BANK_VERSION } from './pyq-taxonomy.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const QUESTION_PATH = path.join(SCRIPT_DIR, 'pyq-custom', 'go-classes-coa-topic-test.json');
const ATTEMPT_PATH = path.join(SCRIPT_DIR, 'pyq-custom', 'go-classes-coa-topic-test-attempts.json');
const OUTPUT_PATH = path.join(
  ROOT,
  'supabase',
  'migrations',
  '20260813000002_go_classes_coa_topic_test.sql'
);

function uuidFromString(seed) {
  const bytes = new Uint8Array(16);
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (let index = 0; index < seed.length; index += 1) {
    first ^= seed.charCodeAt(index);
    first = Math.imul(first, 0x01000193);
    second ^= seed.charCodeAt(seed.length - index - 1);
    second = Math.imul(second, 0x85ebca6b);
  }
  for (let index = 0; index < 16; index += 1) {
    const source = index < 8 ? first : second;
    bytes[index] = (source >>> ((index % 4) * 8)) & 0xff;
    first = Math.imul(first ^ (first >>> 13), 0xc2b2ae35);
    second = Math.imul(second ^ (second >>> 16), 0x27d4eb2f);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function plainText(html) {
  const document = JSDOM.fragment(html);
  for (const list of document.querySelectorAll('ol')) {
    const items = Array.from(list.children).filter((child) => child.tagName === 'LI');
    const upperAlpha = list.getAttribute('style')?.includes('upper-alpha') ?? false;
    items.forEach((item, index) =>
      item.prepend(`${upperAlpha ? String.fromCharCode(65 + index) : index + 1}. `)
    );
  }
  for (const item of document.querySelectorAll('li')) item.append('\n');
  for (const lineBreak of document.querySelectorAll('br')) lineBreak.replaceWith('\n');
  for (const element of document.querySelectorAll('p, pre, div, ul, ol')) element.append('\n');
  return (document.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .split(/\n+/)
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const questionPayload = JSON.parse(await readFile(QUESTION_PATH, 'utf8'));
const attemptPayload = JSON.parse(await readFile(ATTEMPT_PATH, 'utf8'));
const questionByNumber = new Map(
  questionPayload.questions.map((question) => [question.number, question])
);
let startedAtMs = Date.parse(attemptPayload.firstQuestionStartedAt);
const rows = attemptPayload.questions.map((attempt) => {
  const question = questionByNumber.get(attempt.number);
  if (!question) throw new Error(`Missing question ${attempt.number}`);
  const attemptedAtMs = startedAtMs + attempt.timeSpentSec * 1000;
  const attemptId = uuidFromString(`goclasses-coa-topic-test:attempt:${question.number}`);
  const journalQuestionId = uuidFromString(`pyq-journal:${attemptId}`);
  const reattemptId = uuidFromString(`goclasses-coa-topic-test:reattempt:${question.number}`);
  const row = {
    attemptId,
    journalQuestionId,
    reattemptId,
    questionStartedAt: new Date(startedAtMs).toISOString(),
    attemptedAt: new Date(attemptedAtMs).toISOString(),
    scheduledDate: '2026-08-16',
    timeSpentMs: attempt.timeSpentSec * 1000,
    ...attempt,
    questionText: plainText(question.html),
    question
  };
  startedAtMs = attemptedAtMs + attemptPayload.gapBetweenQuestionsSec * 1000;
  return row;
});

if (rows.length !== 15) throw new Error(`Expected 15 attempt rows, found ${rows.length}`);
for (const row of rows) {
  const answered = row.decision !== 'SKIP';
  if (answered !== (row.selectedAnswer !== null)) {
    throw new Error(`Question ${row.number} has inconsistent skip/answer evidence`);
  }
  if (
    answered &&
    row.markCorrect !== (JSON.stringify(row.selectedAnswer) === JSON.stringify(row.question.answer))
  ) {
    throw new Error(`Question ${row.number} has an incorrect correctness flag`);
  }
}

const sql = `-- Import the learner-provided GO Classes COA Topic Test into the owner account's
-- immutable PYQ history, journal, and D3 spaced re-attempt ladder. Fixed IDs
-- and conflict guards make the import safe to run more than once.
do $migration$
declare
  target_user_id uuid;
  item jsonb;
begin
  select id into target_user_id
  from public.users
  where lower(username) = lower(${sqlString(attemptPayload.username)})
  limit 1;

  if target_user_id is null then
    return;
  end if;

  for item in
    select value
    from jsonb_array_elements($payload$${JSON.stringify(rows)}$payload$::jsonb)
  loop
    insert into public.pyq_attempts (
      id, user_id, pyq_session_id, question_uid, subject, year, attempt_number,
      selected_answer, correct_answer, capture_version, question_snapshot,
      answer_status, screenshot_url, mark_decision, mark_correct,
      question_started_at, time_spent_ms, time_spent_sec, bank_version, attempted_at
    ) values (
      (item->>'attemptId')::uuid,
      target_user_id,
      null,
      item#>>'{question,id}',
      item#>>'{question,subject}',
      (item#>>'{question,year}')::int,
      1,
      case
        when item->'selectedAnswer' = 'null'::jsonb then null
        else item->'selectedAnswer'
      end,
      item#>'{question,answer}',
      2,
      jsonb_build_object(
        'question_uid', item#>>'{question,id}',
        'year', (item#>>'{question,year}')::int,
        'set', item#>'{question,set}',
        'number', item#>>'{question,number}',
        'paper_label', item#>>'{question,paperLabel}',
        'subject', item#>>'{question,subject}',
        'subject_slug', item#>>'{question,subjectSlug}',
        'topic', item#>>'{question,topic}',
        'topic_slug', item#>>'{question,topicSlug}',
        'subtopics', item#>'{question,subtopics}',
        'marks', (item#>>'{question,marks}')::int,
        'type', item#>>'{question,type}',
        'tolerance', item#>'{question,tolerance}',
        'answer_status', item#>>'{question,answerStatus}',
        'answer_source', item#>'{question,answerSource}',
        'html', item#>>'{question,html}',
        'source_url', item#>>'{question,sourceUrl}'
      ),
      item#>>'{question,answerStatus}',
      null,
      (item->>'decision')::mark_decision_t,
      case when item->'markCorrect' = 'null'::jsonb then null else (item->>'markCorrect')::boolean end,
      (item->>'questionStartedAt')::timestamptz,
      (item->>'timeSpentMs')::int,
      (item->>'timeSpentSec')::int,
      ${sqlString(PYQ_BANK_VERSION)},
      (item->>'attemptedAt')::timestamptz
    )
    on conflict (id) do nothing;

    insert into public.questions (
      id, user_id, session_id, subject, subtopic, source_year, source_ref,
      question_text, answer_text, image_url, time_spent_sec, target_time_sec,
      outcome, pattern_name, trigger_sentence, root_cause, mark_decision,
      mark_correct, created_at
    ) values (
      (item->>'journalQuestionId')::uuid,
      target_user_id,
      null,
      'COA',
      item#>>'{question,topic}',
      null,
      'GO Classes COA Topic Test · Q' || (item->>'number') || ' · ' || (item#>>'{question,type}'),
      item->>'questionText',
      'Answer key: ' || case
        when jsonb_typeof(item#>'{question,answer}') = 'array'
          then array_to_string(array(select jsonb_array_elements_text(item#>'{question,answer}')), ', ')
        else item#>>'{question,answer}'
      end,
      null,
      (item->>'timeSpentSec')::int,
      case when (item#>>'{question,marks}')::int = 1 then 90 else 180 end,
      (item->>'outcome')::outcome_t,
      null,
      null,
      null,
      (item->>'decision')::mark_decision_t,
      case when item->'markCorrect' = 'null'::jsonb then null else (item->>'markCorrect')::boolean end,
      (item->>'attemptedAt')::timestamptz
    )
    on conflict (id) do nothing;

    insert into public.reattempts (
      id, user_id, question_id, scheduled_date, stage, history, created_at
    ) values (
      (item->>'reattemptId')::uuid,
      target_user_id,
      (item->>'journalQuestionId')::uuid,
      (item->>'scheduledDate')::date,
      'D3',
      '[]'::jsonb,
      (item->>'attemptedAt')::timestamptz
    )
    on conflict (id) do nothing;
  end loop;
end
$migration$;
`;

await writeFile(OUTPUT_PATH, sql);
console.log(`Wrote ${rows.length} attempts to ${path.relative(ROOT, OUTPUT_PATH)}.`);
