import type { MarkDecision, Outcome, PyqSelectedAnswer, PyqSessionConfig } from '@/types';
import { DEFAULT_TARGET_TIME_SEC, MARKS_TARGET_SEC } from '@/lib/constants';
import { urlToDataUrl } from '@/lib/image';

export const PYQ_BANK_QUESTION_COUNT = 4334;

export type PyqQuestionType = 'MCQ' | 'MSQ' | 'NAT' | 'AMBIGUOUS' | 'MARKS_TO_ALL' | 'UNSUPPORTED';
export type PyqAnswerStatus = 'available' | 'ambiguous' | 'marks-to-all' | 'unsupported';

export interface PyqSubjectManifest {
  slug: string;
  label: string;
  count: number;
  file: string;
  topics: { slug: string; label: string; count: number }[];
}

export type PyqDifficultyFloor = 'gate' | 'mixed' | 'above-gate';
export type PyqSourceClass =
  | 'official-exam'
  | 'official-sample'
  | 'reconstructed-exam'
  | 'audited-gate-prep';

export interface PyqBookManifest {
  slug: string;
  label: string;
  shortLabel: string;
  description: string;
  difficultyFloor: PyqDifficultyFloor;
  sourceClass: PyqSourceClass;
  source: string;
  sourceUrl: string;
  count: number;
  firstYear: number;
  lastYear: number;
  answerStatuses: Record<PyqAnswerStatus, number>;
  years: { year: number; count: number }[];
  subjects: PyqSubjectManifest[];
}

export interface PyqManifest {
  bankVersion: string;
  generatedAt: string;
  source: string;
  sourceUrl: string;
  defaultBookSlug: string;
  firstYear: number;
  lastYear: number;
  questionCount: number;
  imageCount: number;
  answerStatuses: Record<PyqAnswerStatus, number>;
  years: { year: number; count: number }[];
  subjects: PyqSubjectManifest[];
  books: PyqBookManifest[];
}

type PyqManifestPayload = Omit<PyqManifest, 'subjects' | 'books' | 'defaultBookSlug'> & {
  defaultBookSlug?: string;
  subjects: Array<Omit<PyqSubjectManifest, 'topics'> & { topics?: PyqSubjectManifest['topics'] }>;
  books?: Array<
    Omit<PyqBookManifest, 'subjects'> & {
      subjects: Array<
        Omit<PyqSubjectManifest, 'topics'> & { topics?: PyqSubjectManifest['topics'] }
      >;
    }
  >;
};

export interface PyqQuestion {
  id: string;
  bookSlug: string;
  year: number;
  set: number | null;
  number: string;
  paperLabel: string;
  subject: string;
  subjectSlug: string;
  classificationHint?: { subjectSlug: string; topicSlug: string };
  topic: string;
  topicSlug: string;
  subtopics: string[];
  marks: 1 | 2 | null;
  type: PyqQuestionType;
  /** Option labels supplied by the source; legacy four-option questions omit this. */
  choices?: string[];
  answer: string | number | (string | number)[] | null;
  tolerance: { abs?: number } | null;
  answerStatus: PyqAnswerStatus;
  html: string;
  sourceUrl: string;
  answerSource: unknown;
}

interface SubjectPayload {
  bankVersion: string;
  subject: string;
  questions: PyqQuestion[];
}

const subjectCache = new Map<string, Promise<SubjectPayload>>();
let manifestPromise: Promise<PyqManifest> | null = null;
const PYQ_MANIFEST_SCHEMA = 'books-v2';

const PYQ_MATH_DELIMITERS = [
  { left: '$$$', right: '$$$' },
  { left: '$$', right: '$$' },
  { left: '\\[', right: '\\]' },
  { left: '\\(', right: '\\)' },
  { left: '$', right: '$' }
] as const;
const PYQ_MATH_ENVIRONMENT_PATTERN =
  /\\begin\{(array|gathered|matrix|pmatrix|aligned|bmatrix|vmatrix|cases|align\*?)\}[\s\S]*?\\end\{\1\}/g;
const PYQ_MATH_BREAK_PATTERN = /<br\s*\/?\s*>/gi;
const PYQ_MATH_TOKEN_PATTERN = /HETUPYQMATHSEGMENT(\d+)TOKEN/g;
const PYQ_TEXT_COMMAND_PATTERN = /\\(text|textbf|textit|textrm|textsf|texttt)\s*\{([^{}]*)\}/g;

function replaceBalancedPyqMathCommand(
  value: string,
  command: string,
  transform: (body: string) => string
): string {
  let cursor = 0;
  let output = '';
  while (cursor < value.length) {
    const commandStart = value.indexOf(command, cursor);
    if (commandStart < 0) return output + value.slice(cursor);
    const openingBrace = commandStart + command.length - 1;
    let depth = 1;
    let index = openingBrace + 1;
    for (; index < value.length && depth > 0; index += 1) {
      if (value[index] === '\\') {
        index += 1;
      } else if (value[index] === '{') {
        depth += 1;
      } else if (value[index] === '}') {
        depth -= 1;
      }
    }
    if (depth !== 0) return output + value.slice(cursor);
    output +=
      value.slice(cursor, commandStart) + transform(value.slice(openingBrace + 1, index - 1));
    cursor = index;
  }
  return output;
}

function normalizePyqTextCommands(value: string): string {
  return value.replace(PYQ_TEXT_COMMAND_PATTERN, (_match, command: string, body: string) => {
    const chunks = body.split(/(\$[^$]*\$)/g);
    for (let index = 0; index < chunks.length; index += 2) {
      chunks[index] = chunks[index].replace(/(?<!\\)([#_%])/g, '\\$1');
    }
    return `\\${command}{${chunks.join('')}}`;
  });
}

function joinPyqMathLines(value: string): string {
  let normalized = value
    .replace(PYQ_MATH_BREAK_PATTERN, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\\renewcommand\s*\{\\arraystretch\}\s*\{([^{}]+)\}/g, '\\def\\arraystretch{$1}')
    .replace(/p\{\s*\d+(?:\.\d+)?(?:cm|mm|in|pt|em|ex)\s*\}/g, 'l')
    .replace(/\^?\\hat\{\}/g, '\\mathbin{\\char`\\^}')
    .replace(
      /(\\end\{(?:array|gathered|matrix|pmatrix|aligned|bmatrix|vmatrix|cases|align\*?)\})\s*\\\\\s*$/,
      '$1'
    );
  normalized = replaceBalancedPyqMathCommand(
    normalized,
    '\\eqalign{',
    (body) => `\\begin{aligned}${body.replace(/\\cr(?![A-Za-z])/g, '\\\\')}\\end{aligned}`
  );
  normalized = replaceBalancedPyqMathCommand(
    normalized,
    '\\matrix{',
    (body) => `\\begin{matrix}${body.replace(/\\cr(?![A-Za-z])/g, '\\\\')}\\end{matrix}`
  );
  return normalizePyqTextCommands(normalized);
}

function pyqMathEndIndex(value: string, delimiter: string, startIndex: number): number {
  let index = startIndex;
  let braceDepth = 0;
  while (index < value.length) {
    const character = value[index];
    if (braceDepth <= 0 && value.slice(index, index + delimiter.length) === delimiter) {
      return index;
    }
    if (character === '\\') index += 1;
    else if (character === '{') braceDepth += 1;
    else if (character === '}') braceDepth -= 1;
    index += 1;
  }
  return -1;
}

function normalizePyqMathSegment(segment: string, left: string, right: string): string {
  const body = joinPyqMathLines(segment.slice(left.length, segment.length - right.length));
  if (left === '$$$') return `$$${body}$$`;
  if (left === '$' && /\\begin\{align\*?\}/.test(body)) return `\\[${body}\\]`;
  return `${left}${body}${right}`;
}

/**
 * Repair source-archive HTML before KaTeX sees it.
 *
 * A number of papers encode one display expression as text separated by
 * `<br>` tags. KaTeX auto-render intentionally works one DOM text node at a
 * time, so those tags otherwise expose raw `\\begin{array}` source. A smaller
 * set contains a complete environment without any math delimiters. Protect
 * valid math first, join only the line breaks inside it, then wrap genuinely
 * bare environments in display delimiters.
 */
export function normalizePyqQuestionHtml(html: string): string {
  const mathSegments: string[] = [];
  let tokenized = '';
  let cursor = 0;
  while (cursor < html.length) {
    let next:
      | { index: number; left: (typeof PYQ_MATH_DELIMITERS)[number]['left']; right: string }
      | undefined;
    for (const delimiter of PYQ_MATH_DELIMITERS) {
      const index = html.indexOf(delimiter.left, cursor);
      if (
        index >= 0 &&
        (!next ||
          index < next.index ||
          (index === next.index && delimiter.left.length > next.left.length))
      ) {
        next = { index, left: delimiter.left, right: delimiter.right };
      }
    }
    if (!next) {
      tokenized += html.slice(cursor);
      break;
    }
    const end = pyqMathEndIndex(html, next.right, next.index + next.left.length);
    if (end < 0) {
      const unmatchedEnd = next.index + next.left.length;
      tokenized += html.slice(cursor, unmatchedEnd);
      cursor = unmatchedEnd;
      continue;
    }
    tokenized += html.slice(cursor, next.index);
    tokenized += `HETUPYQMATHSEGMENT${mathSegments.length}TOKEN`;
    mathSegments.push(
      normalizePyqMathSegment(
        html.slice(next.index, end + next.right.length),
        next.left,
        next.right
      )
    );
    cursor = end + next.right.length;
  }
  const wrapped = tokenized.replace(
    PYQ_MATH_ENVIRONMENT_PATTERN,
    (environment) => `\\[${joinPyqMathLines(environment)}\\]`
  );
  return wrapped.replace(
    PYQ_MATH_TOKEN_PATTERN,
    (_token, index: string) => mathSegments[Number(index)] ?? ''
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Question bank request failed (${response.status})`);
  return (await response.json()) as T;
}

export function loadPyqManifest(): Promise<PyqManifest> {
  // The query key bypasses the pre-topic service-worker cache. Normalization is
  // still required because an already-controlled tab can briefly mix an older
  // manifest with the latest JavaScript while a new worker activates.
  manifestPromise ??= fetchJson<PyqManifestPayload>(
    `/pyq/manifest.json?schema=${PYQ_MANIFEST_SCHEMA}`
  ).then(normalizePyqManifest);
  return manifestPromise;
}

export function normalizePyqManifest(payload: PyqManifestPayload): PyqManifest {
  const normalizeSubjects = (
    subjects: Array<
      Omit<PyqSubjectManifest, 'topics'> & { topics?: PyqSubjectManifest['topics'] }
    >
  ): PyqSubjectManifest[] =>
    subjects.map((subject) => ({
      ...subject,
      topics: Array.isArray(subject.topics) ? subject.topics : []
    }));
  const subjects = normalizeSubjects(payload.subjects);
  const books = Array.isArray(payload.books)
    ? payload.books.map((book) => ({ ...book, subjects: normalizeSubjects(book.subjects) }))
    : [
        {
          slug: 'gate-cse',
          label: 'GATE CSE Core',
          shortLabel: 'GATE CSE',
          description: 'Legacy complete question archive.',
          difficultyFloor: 'gate' as const,
          sourceClass: 'official-exam' as const,
          source: payload.source,
          sourceUrl: payload.sourceUrl,
          count: payload.questionCount,
          firstYear: payload.firstYear,
          lastYear: payload.lastYear,
          answerStatuses: payload.answerStatuses,
          years: payload.years,
          subjects
        }
      ];
  return {
    ...payload,
    defaultBookSlug: payload.defaultBookSlug ?? books[0].slug,
    subjects,
    books
  };
}

export async function loadPyqQuestions(
  subjects: PyqSubjectManifest[],
  bankVersion: string
): Promise<PyqQuestion[]> {
  const payloads = await Promise.all(
    subjects.map((subject) => {
      const versionedFile = `${subject.file}?bank=${encodeURIComponent(bankVersion)}`;
      let request = subjectCache.get(versionedFile);
      if (!request) {
        request = fetchJson<SubjectPayload>(versionedFile);
        subjectCache.set(versionedFile, request);
      }
      return request;
    })
  );
  return payloads.flatMap((payload) => payload.questions);
}

/** Restore a legacy attempt from the current bundled bank without downloading
 * unrelated subject files. Immutable v2 attempts use their own snapshot and do
 * not need this compatibility path. */
export async function loadPyqQuestionByUid(
  questionUid: string,
  subjectHint: string
): Promise<PyqQuestion | null> {
  const manifest = await loadPyqManifest();
  const normalizedHint = subjectHint.trim().toLowerCase();
  const subject = manifest.subjects.find(
    (candidate) =>
      candidate.slug.toLowerCase() === normalizedHint ||
      candidate.label.toLowerCase() === normalizedHint
  );
  if (!subject) return null;
  const questions = await loadPyqQuestions([subject], manifest.bankVersion);
  return questions.find((question) => question.id === questionUid) ?? null;
}

export function matchesPyqTopicScope(
  question: PyqQuestion,
  config: Pick<PyqSessionConfig, 'subjectSlug' | 'topicSlug'>
): boolean {
  const subjectMatches =
    config.subjectSlug === 'all' || question.subjectSlug === config.subjectSlug;
  const topicSlug = config.topicSlug ?? 'all';
  return subjectMatches && (topicSlug === 'all' || question.topicSlug === topicSlug);
}

export function inferPyqBookSlug(paperLabel: string): string {
  const normalized = paperLabel.trim().toUpperCase();
  if (normalized.startsWith('ISRO ')) return 'isro-cs-overlap';
  if (normalized.startsWith('IIIT-H ') || normalized.startsWith('IIIT HYDERABAD '))
    return 'iiith-pgee';
  if (normalized.startsWith('TIFR ')) return 'tifr-gs-cs';
  if (normalized.startsWith('CMI ')) return 'cmi-cs-objective';
  if (normalized.startsWith('UGC NET ')) return 'ugc-net-cs-overlap';
  if (normalized.startsWith('GATE IT ')) return 'gate-it';
  if (normalized.startsWith('GATE DA ') || normalized.startsWith('GATE AI '))
    return 'gate-da-overlap';
  if (normalized.startsWith('GATE ECE ') || normalized.startsWith('GATE EE '))
    return 'gate-cross-digital';
  if (normalized.startsWith('GO CLASSES ')) return 'go-classes-coa';
  return 'gate-cse';
}

export function pyqBookSlugForQuestion(
  question: Pick<PyqQuestion, 'paperLabel'> & { bookSlug?: string }
): string {
  return question.bookSlug?.trim() || inferPyqBookSlug(question.paperLabel);
}

export function matchesPyqBookScope(
  question: Pick<PyqQuestion, 'paperLabel'> & { bookSlug?: string },
  config: Pick<PyqSessionConfig, 'bookSlug'>
): boolean {
  const bookSlug = config.bookSlug ?? 'all';
  return bookSlug === 'all' || pyqBookSlugForQuestion(question) === bookSlug;
}

function normalizedChoices(value: PyqSelectedAnswer): string[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [String(value)];
  return raw
    .map(String)
    .map((choice) => choice.trim().toUpperCase())
    .filter(Boolean)
    .sort();
}

export function evaluatePyqAnswer(
  question: PyqQuestion,
  selected: PyqSelectedAnswer,
  decision: MarkDecision
): boolean | null {
  if (question.answerStatus !== 'available' || decision === 'SKIP' || selected == null) return null;

  if (question.type === 'MCQ') {
    return normalizedChoices(selected)[0] === String(question.answer).trim().toUpperCase();
  }

  if (question.type === 'MSQ') {
    return (
      normalizedChoices(selected).join('|') ===
      normalizedChoices(question.answer as string[]).join('|')
    );
  }

  if (question.type === 'NAT') {
    const numeric = typeof selected === 'number' ? selected : Number(selected);
    if (!Number.isFinite(numeric)) return false;
    const accepted = Array.isArray(question.answer) ? question.answer : [question.answer];
    const tolerance = Math.max(0, question.tolerance?.abs ?? 0);
    return accepted.some((answer) => {
      const expected = Number(answer);
      return (
        Number.isFinite(expected) && Math.abs(numeric - expected) <= tolerance + Number.EPSILON
      );
    });
  }

  return null;
}

export function formatPyqAnswer(question: PyqQuestion): string {
  if (question.answerStatus === 'ambiguous')
    return 'Official status: ambiguous; no definitive key.';
  if (question.answerStatus === 'marks-to-all') return 'Official status: marks awarded to all.';
  if (question.answerStatus === 'unsupported')
    return 'Paper defect: no valid listed option; no key invented.';
  if (Array.isArray(question.answer)) {
    const separator = question.type === 'NAT' ? ' or ' : ', ';
    return question.answer.map(String).join(separator);
  }
  return String(question.answer ?? 'Key unavailable');
}

export function pyqAnswerValueForLog(question: PyqQuestion): PyqSelectedAnswer {
  if (question.answerStatus !== 'available') return null;
  if (Array.isArray(question.answer)) return question.answer.map(String).sort();
  if (typeof question.answer === 'number') return question.answer;
  return question.answer == null ? null : String(question.answer);
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapSnapshotText(value: string, maxChars: number): string[] {
  const words = value.replace(/\s+/g, ' ').trim().slice(0, maxChars).split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > 84 && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
    if (lines.length >= 14) break;
  }
  if (line && lines.length < 14) lines.push(line);
  return lines;
}

export function pyqQuestionSnapshotDataUrl(question: PyqQuestion): string {
  const heading = pyqSourceRef(question);
  const body = wrapSnapshotText(pyqPlainText(question.html), 1200);
  const lines = [
    `<text x="40" y="56" class="heading">${escapeSvgText(heading)}</text>`,
    `<text x="40" y="92" class="meta">${escapeSvgText(`${question.subject} · ${question.type}${question.marks ? ` · ${question.marks} mark` : ''}`)}</text>`,
    ...body.map(
      (line, index) =>
        `<text x="40" y="${138 + index * 28}" class="body">${escapeSvgText(line)}</text>`
    )
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
  <rect width="1200" height="720" fill="#f6f1e9"/>
  <rect x="22" y="22" width="1156" height="676" rx="18" fill="#fffdf9" stroke="#e0d5cd"/>
  <style>
    .heading{font:700 30px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#1b191c}
    .meta{font:600 20px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#98182b}
    .body{font:500 22px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#67575d}
  </style>
  ${lines.join('\n  ')}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function pyqSourceRef(question: PyqQuestion): string {
  return [question.paperLabel, `Q ${question.number}`, question.type].join(' · ');
}

export function pyqPlainText(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const orderedListMarker = (list: HTMLOListElement, index: number): string => {
    const type = list.getAttribute('type');
    const style = list.getAttribute('style') ?? '';
    if (type === 'A' || /upper-alpha/i.test(style)) return String.fromCharCode(65 + index);
    if (type === 'a' || /lower-alpha/i.test(style)) return String.fromCharCode(97 + index);
    return String((list.start || 1) + index);
  };

  for (const list of document.querySelectorAll('ol')) {
    const items = Array.from(list.children).filter(
      (child): child is HTMLLIElement => child.tagName === 'LI'
    );
    items.forEach((item, index) => {
      item.prepend(document.createTextNode(`${orderedListMarker(list, index)}. `));
      item.append(document.createTextNode('\n'));
    });
  }
  for (const lineBreak of document.querySelectorAll('br')) {
    lineBreak.replaceWith(document.createTextNode('\n'));
  }
  for (const element of document.querySelectorAll('p, div, tr, ul')) {
    element.append(document.createTextNode('\n'));
  }

  return (
    document.body.textContent
      ?.replace(/\u00a0/g, ' ')
      .split(/\n+/)
      .map((line) => line.replace(/[\t ]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n') ?? ''
  );
}

export function firstPyqImage(html: string): string | null {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return document.querySelector('img')?.getAttribute('src') ?? null;
}

/** Embed bundled PYQ figure(s) as a journal-ready data URL before persisting. */
export async function resolvePyqJournalImageUrl(
  html: string,
  hint: string | null = null
): Promise<string | null> {
  const candidate = hint?.trim() || firstPyqImage(html);
  if (!candidate) return null;
  if (candidate.startsWith('data:')) return candidate;
  try {
    return await urlToDataUrl(candidate);
  } catch {
    return candidate;
  }
}

/** Outcome for a graded-correct PYQ when the learner skips full TagFlow analysis. */
export function inferPyqDirectOutcome(
  question: PyqQuestion,
  markDecision: MarkDecision,
  timeSpentSec: number
): Outcome {
  if (markDecision === 'FIFTY_FIFTY') return 'RBG';
  const target = question.marks ? MARKS_TARGET_SEC[question.marks] : DEFAULT_TARGET_TIME_SEC;
  if (timeSpentSec > target) return 'RBS';
  return 'R';
}
