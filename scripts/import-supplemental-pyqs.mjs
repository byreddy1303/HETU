#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(SCRIPT_DIR, 'pyq-custom');
const SOURCE_DATE = '2026-08-20';
const CHOICES_4 = ['A', 'B', 'C', 'D'];
const CHOICES_5 = [...CHOICES_4, 'E'];

const SOURCES = {
  isroPaper:
    'https://www.isro.gov.in/media_isro/pdf/recruitmentNotice/2025_May/CS_2023_merge.pdf',
  isroKey:
    'https://www.isro.gov.in/media_isro/pdf/recruitmentNotice/2024_January/SCIENTISTENGINEER_SC_COMPUTER_SCIENCE.pdf',
  iiithSample:
    'https://raw.githubusercontent.com/nineRishav/PGEE-IIITH/master/IIITH%20PGEE%202018%20-Sample%20Paper.pdf',
  iiithSyllabus: 'https://pgadmissions.iiit.ac.in/monsoon_syllabus/',
  tifrArchive: 'https://main.tifr.res.in/academics/past_question_papers.php',
  cmiArchive: 'https://www.cmi.ac.in/admissions/syllabus.php',
  ugcArchive: 'https://www.ugcnetonline.in/question_papers_june2012.php',
  ugcPaper:
    'https://www.ugcnetonline.in/showPdf.php?p1=question_papers%2FJune2012_paper-II%2FJ-87-12%20%28Comp%20Sci%29.pdf',
  ugcKey: 'https://www.ugcnetonline.in/J2012_answerkeys/SC087_II.pdf'
};

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function cleanText(value) {
  return value
    .replaceAll('\f', '\n')
    .replaceAll('\u001c', 'fi')
    .replaceAll('\u001d', 'fl')
    .replaceAll('\u001e', 'ffi')
    .replaceAll('\u001f', 'ffl')
    .replace(/[\u0000-\u0008\u000b\u000e-\u001b]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function questionHtml(value) {
  const cleaned = cleanText(value)
    .replace(/^\s*\d+\.\s*(?:I?2)?\s*/i, '')
    .replace(/^.*(?:GS 20\d{2}.*Page \d+ of \d+|Paper-II|J-87-12).*$/gim, '')
    .replace(/\n{3,}/g, '\n\n');
  return `<div class="pyq-source-text">${escapeHtml(cleaned).replaceAll('\n', '<br>')}</div>`;
}

function baseQuestion({
  id,
  year,
  number,
  paperLabel,
  hint,
  type = 'MCQ',
  answer,
  choices = CHOICES_4,
  html,
  sourceUrl,
  answerSource
}) {
  return {
    id,
    year,
    set: null,
    number: String(number),
    paperLabel,
    subject: hint[0],
    subjectSlug: hint[0],
    classificationHint: { subjectSlug: hint[0], topicSlug: hint[1] },
    topic: hint[1],
    topicSlug: hint[1],
    subtopics: [hint[1], id.split(':')[0]],
    marks: null,
    type,
    choices,
    answer,
    tolerance: null,
    answerStatus: 'available',
    html,
    sourceUrl,
    answerSource
  };
}

async function download(url, destination) {
  const response = await fetch(url, { headers: { 'user-agent': 'HETU supplemental PYQ importer/1.0' } });
  if (!response.ok) throw new Error(`Could not download ${url}: HTTP ${response.status}`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function pdfText(pdfPath, args = []) {
  const { stdout } = await execFile('pdftotext', [...args, pdfPath, '-'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  return stdout;
}

function sequentialBlocks(text, first, last, markedQuestions = false) {
  const starts = [];
  let cursor = 0;
  for (let number = first; number <= last; number += 1) {
    const pattern = markedQuestions
      ? new RegExp(`\\b${number}\\.\\s*(?:I?2)`, 'gmu')
      : new RegExp(`(?:^|\\n|[,)]\\s*)[^\\p{L}\\p{N}\\n]{0,12}${number}\\.\\s*`, 'gmu');
    pattern.lastIndex = cursor;
    const match = pattern.exec(text);
    if (!match) throw new Error(`Could not find question ${number} after offset ${cursor}`);
    const markerOffset = match[0].lastIndexOf(`${number}.`);
    starts.push({ number, index: match.index + markerOffset });
    cursor = match.index + match[0].length;
  }
  return starts.map((start, index) => ({
    number: start.number,
    text: text.slice(start.index, starts[index + 1]?.index ?? text.length)
  }));
}

function answerMap(text, pattern) {
  const answers = new Map();
  for (const match of text.matchAll(pattern)) answers.set(Number(match[1]), match[2].toUpperCase());
  return answers;
}

const ISRO_HINTS = new Map([
  [2, ['algorithms', 'shortest-path']],
  [4, ['data-structure', 'binary-search-tree']],
  [8, ['compiler-design', 'parsing']],
  [9, ['operating-systems', 'memory-management']],
  [10, ['compiler-design', 'intermediate-code-generation']],
  [11, ['compiler-design', 'parsing']],
  [12, ['computer-networks', 'data-link-layer']],
  [13, ['computer-networks', 'data-link-layer']],
  [14, ['computer-networks', 'application-layer-protocols']],
  [17, ['data-structure', 'stack']],
  [18, ['coa', 'interrupt']],
  [20, ['coa', 'pipeline-processor']],
  [21, ['coa', 'alu-data-path-and-control-unit']],
  [22, ['computer-networks', 'data-link-layer']],
  [23, ['data-structure', 'stack']],
  [27, ['c-programming', 'array-and-pointer']],
  [28, ['data-structure', 'queue']],
  [29, ['algorithms', 'sorting']],
  [30, ['databases', 'sql']],
  [31, ['databases', 'sql']],
  [32, ['databases', 'sql']],
  [33, ['databases', 'transactions']],
  [34, ['databases', 'normal-form']],
  [35, ['digital-logic', 'combinational-circuit']],
  [36, ['digital-logic', 'sequential-circuit']],
  [37, ['digital-logic', 'combinational-circuit']],
  [39, ['digital-logic', 'boolean-algebra']],
  [40, ['digital-logic', 'boolean-algebra']],
  [42, ['discrete-mathematics', 'graph-theory']],
  [43, ['discrete-mathematics', 'planar-graph']],
  [45, ['algorithms', 'asymptotic-notation']],
  [46, ['discrete-mathematics', 'combination']],
  [47, ['digital-logic', 'boolean-algebra']],
  [48, ['operating-systems', 'process']],
  [49, ['operating-systems', 'process-synchronization']],
  [50, ['operating-systems', 'memory-management']],
  [51, ['coa', 'interrupt']],
  [52, ['operating-systems', 'cpu-scheduling']],
  [53, ['operating-systems', 'process-synchronization']],
  [54, ['operating-systems', 'memory-management']],
  [57, ['theory-of-computation', 'context-free-grammar']],
  [58, ['theory-of-computation', 'recursive-language']],
  [59, ['theory-of-computation', 'context-free-language']],
  [60, ['theory-of-computation', 'context-free-grammar']],
  [80, ['databases', 'er-model']]
]);

async function importIsro(temp) {
  const paperPath = path.join(temp, 'isro-paper.pdf');
  const keyPath = path.join(temp, 'isro-key.pdf');
  await Promise.all([download(SOURCES.isroPaper, paperPath), download(SOURCES.isroKey, keyPath)]);
  const [rawPaper, keyText] = await Promise.all([
    pdfText(paperPath, ['-x', '290', '-y', '0', '-W', '305', '-H', '842', '-layout']),
    pdfText(keyPath, ['-layout'])
  ]);
  const paperText = rawPaper.replace(/\p{Script=Devanagari}/gu, '');
  const partAEnd = paperText.search(/\b81\.\s+/);
  const partAText = partAEnd > 0 ? paperText.slice(0, partAEnd) : paperText;
  const blocks = new Map(
    sequentialBlocks(partAText, 1, 80, true).map((row) => [row.number, row.text])
  );
  const keys = answerMap(keyText, /^\s*(\d+)\.\s+\(([a-d])\)/gim);
  const questions = [...ISRO_HINTS].map(([number, hint]) => {
    let text = blocks
      .get(number)
      ?.replaceAll('I2n', 'In')
      .replace(/^.*UITMENT TO THE POST OF.*$/gim, '')
      .replace(/^.*\(COMPUTER SCIENCE\).*2023.*$/gim, '')
      .replace(/^\s*(?:SET|A|[0-9]{1,2}|[),।])\s*$/gim, '')
      .replace(/^.*–\s*2023.*$/gim, '')
      .replace(/[’']?\/Part\s*[‘']?B[‘']?[\s\S]*$/i, '');
    if (number === 47) text = text.replace(/\b2n\b/g, '2^n');
    const answer = keys.get(number);
    if (!text || !answer) throw new Error(`Incomplete ISRO source for question ${number}`);
    return baseQuestion({
      id: `isro-cs:2023:${number}`,
      year: 2023,
      number,
      paperLabel: 'ISRO Scientist/Engineer CS 2023 · Part A',
      hint,
      answer,
      html: questionHtml(text),
      sourceUrl: SOURCES.isroPaper,
      answerSource: { kind: 'official-answer-key', url: SOURCES.isroKey }
    });
  });
  return {
    bookSlug: 'isro-cs-overlap',
    source: 'ISRO Scientist/Engineer CS 2023',
    sourceUrl: SOURCES.isroPaper,
    importedAt: SOURCE_DATE,
    questions
  };
}

const IIITH_QUESTIONS = [
  {
    number: 1,
    hint: ['c-programming', 'array-and-pointer'],
    answer: 'B',
    text: `What will the following code fragment output?\n\nint P[5] = {3,1,4,2,0};\nfor (i=0; i < 5; i++) Q[P[i]] = P[i];\nfor (i=0; i < 5; i++) printf("%d", Q[i]);\n\n(A) 31420\n(B) 01234\n(C) 21403\n(D) 43210\n(E) 12340`
  },
  {
    number: 2,
    hint: ['c-programming', 'array-and-pointer'],
    answer: 'C',
    text: `What will the following code fragment output?\n\nvoid fun(int *a, int b) { b++; a[2] = a[1] + 3; }\nvoid main() {\n  int A[5] = {0,1,2,3,4};\n  fun(A, A[2]); printf("%d", A[2]);\n}\n\n(A) 2\n(B) 3\n(C) 4\n(D) 5\n(E) 6`
  },
  {
    number: 3,
    hint: ['discrete-mathematics', 'propositional-logic'],
    answer: 'D',
    text: `Consider the statement: “If n is divisible by 30 then n is divisible by 2 and by 3 and by 5.” Which statement is equivalent?\n\n(A) If n is not divisible by 30 then n is divisible by 2 or by 3 or by 5.\n(B) If n is not divisible by 30 then n is not divisible by 2 or not by 3 or not by 5.\n(C) If n is divisible by 2, 3 and 5 then n is divisible by 30.\n(D) If n is not divisible by 2 or not by 3 or not by 5 then n is not divisible by 30.\n(E) If n is divisible by 2 or by 3 or by 5 then n is divisible by 30.`
  },
  {
    number: 4,
    hint: ['discrete-mathematics', 'propositional-logic'],
    answer: 'A',
    text: `Which statement is the contrapositive of: “You win the game if you know the rules but are not overconfident.”\n\n(A) If you lose the game then you do not know the rules or you are overconfident.\n(B) A sufficient condition that you win is that you know the rules or are not overconfident.\n(C) If you do not know the rules or are overconfident you lose the game.\n(D) If you know the rules and are overconfident then you win the game.\n(E) A necessary condition that you know the rules or are not overconfident is that you win.`
  },
  {
    number: 6,
    hint: ['algorithms', 'sorting'],
    answer: 'D',
    text: `Call a sorting algorithm “oblivious” if it has the same best-case and worst-case runtime. Which of these standard sorting algorithms are oblivious: (i) Merge sort, (ii) Bubble sort, (iii) Quick sort, and (iv) Heap sort?\n\n(A) All of the above\n(B) (i), (ii), and (iii)\n(C) Only (ii)\n(D) (i) and (iv)\n(E) None of the above`
  },
  {
    number: 7,
    hint: ['digital-logic', 'number-system'],
    answer: 'B',
    text: `What is the 2’s-complement representation of the integer -1 using 16 and 8 bits respectively?\n\n(A) 0xFF, 0xF\n(B) 0xFFFF, 0xFF\n(C) 0xFF00, 0xF0\n(D) 0xF000, 0xF0\n(E) 0x1000, 0xF0`
  },
  {
    number: 8,
    hint: ['digital-logic', 'combinational-circuit'],
    type: 'MSQ',
    answer: ['A', 'B', 'C', 'D'],
    text: `Choose the digital building blocks from the following list using which any Boolean function can be realized.\n\n(A) 2-to-1 multiplexer\n(B) 4-to-1 multiplexer\n(C) 8-to-1 multiplexer\n(D) 16-to-1 multiplexer\n(E) None of the above`
  },
  {
    number: 11,
    hint: ['algorithms', 'dynamic-programming'],
    answer: 'D',
    text: `Using dynamic programming, what is the minimum scalar-multiplication cost of a matrix-chain product with dimensions ⟨25, 75, 20, 95, 110⟩?\n\n(A) 2500\n(B) 12050\n(C) 45075\n(D) 301500\n(E) 6725`
  }
];

function importIiith() {
  return {
    bookSlug: 'iiith-pgee',
    source: 'IIIT Hyderabad PGEE 2018 sample paper',
    sourceUrl: SOURCES.iiithSyllabus,
    importedAt: SOURCE_DATE,
    questions: IIITH_QUESTIONS.map((question) =>
      baseQuestion({
        id: `iiith-pgee:2018-sample:${question.number}`,
        year: 2018,
        number: question.number,
        paperLabel: 'IIIT-H PGEE 2018 · Audited Sample',
        hint: question.hint,
        type: question.type,
        answer: question.answer,
        choices: CHOICES_5,
        html: questionHtml(question.text),
        sourceUrl: SOURCES.iiithSample,
        answerSource: {
          kind: 'independent-audit',
          note: 'The official sample has no published key; deterministic answers were independently derived and only high-confidence items were admitted.'
        }
      })
    )
  };
}

const TIFR_CONFIG = {
  2024: {
    url: 'https://main.tifr.res.in/academics/docs/past_QP/GS2024_QP_CS.pdf',
    start: /\n\s*CS Section\s*\n/,
    end: null,
    excluded: new Set([3, 11, 12, 15]),
    hints: {
      1: ['algorithms', 'asymptotic-notation'], 2: ['discrete-mathematics', 'combination'],
      3: ['engineering-mathematics', 'probability-statistics'], 4: ['algorithms', 'recurrence-relation'],
      5: ['theory-of-computation', 'regular-language'], 6: ['theory-of-computation', 'context-free-language'],
      7: ['algorithms', 'asymptotic-notation'], 8: ['discrete-mathematics', 'combination'],
      9: ['engineering-mathematics', 'linear-algebra'], 10: ['algorithms', 'divide-and-conquer'],
      13: ['algorithms', 'minimum-spanning-tree'], 14: ['discrete-mathematics', 'graph-theory']
    }
  },
  2025: {
    url: 'https://main.tifr.res.in/academics/docs/past_QP/GS2025_QP_CS_LIDS.pdf',
    start: /Computer Science Section/,
    end: /Learning, Information and Data Sciences Section/,
    excluded: new Set([7]),
    hints: {
      1: ['algorithms', 'recurrence-relation'], 2: ['discrete-mathematics', 'propositional-logic'],
      3: ['discrete-mathematics', 'set-theory'], 4: ['theory-of-computation', 'push-down-automata'],
      5: ['algorithms', 'graph-traversal'], 6: ['theory-of-computation', 'turing-machine'],
      8: ['algorithms', 'minimum-spanning-tree'], 9: ['algorithms', 'dynamic-programming'],
      10: ['data-structure', 'hashing'], 11: ['algorithms', 'sorting'],
      12: ['engineering-mathematics', 'linear-algebra'], 13: ['algorithms', 'asymptotic-notation'],
      14: ['algorithms', 'graph-traversal'], 15: ['discrete-mathematics', 'functions']
    }
  },
  2026: {
    url: 'https://main.tifr.res.in/academics/docs/past_QP/GS2026_QP_CS_LIDS.pdf',
    start: /1\. What is the decimal representation of the hexadecimal number/,
    end: /1\. Let B be the three dimensional Euclidean ball/,
    excluded: new Set([3, 6, 13, 15]),
    hints: {
      1: ['digital-logic', 'number-system'], 2: ['discrete-mathematics', 'graph-theory'],
      4: ['algorithms', 'minimum-spanning-tree'], 5: ['theory-of-computation', 'recursive-language'],
      7: ['algorithms', 'asymptotic-notation'], 8: ['discrete-mathematics', 'graph-theory'],
      9: ['engineering-mathematics', 'linear-algebra'], 10: ['discrete-mathematics', 'recurrence'],
      11: ['discrete-mathematics', 'functions'], 12: ['algorithms', 'recurrence-relation'],
      14: ['algorithms', 'recurrence-relation']
    }
  }
};

function markedAnswer(block) {
  const tick = block.indexOf('✓');
  if (tick < 0) return null;
  const labels = [...block.slice(0, tick).matchAll(/\(([a-e])\)/gi)];
  return labels.at(-1)?.[1].toUpperCase() ?? null;
}

async function importTifr(temp) {
  const questions = [];
  for (const [yearText, config] of Object.entries(TIFR_CONFIG)) {
    const year = Number(yearText);
    const pdfPath = path.join(temp, `tifr-${year}.pdf`);
    await download(config.url, pdfPath);
    let text = await pdfText(pdfPath, ['-layout']);
    const start = text.search(config.start);
    if (start < 0) throw new Error(`Could not find TIFR ${year} CS section`);
    text = text.slice(start);
    const end = config.end ? text.search(config.end) : -1;
    if (end > 0) text = text.slice(0, end);
    const blocks = sequentialBlocks(text, 1, 15);
    for (const block of blocks) {
      if (config.excluded.has(block.number)) continue;
      const hint = config.hints[block.number];
      const answer = markedAnswer(block.text);
      if (!hint || !answer) throw new Error(`Incomplete TIFR ${year} question ${block.number}`);
      questions.push(
        baseQuestion({
          id: `tifr-gs-cs:${year}:${block.number}`,
          year,
          number: block.number,
          paperLabel: `TIFR GS ${year} · Computer Science`,
          hint,
          answer,
          choices: CHOICES_5,
          html: questionHtml(block.text.replaceAll('✓', '')),
          sourceUrl: config.url,
          answerSource: { kind: 'official-marked-solution', url: config.url }
        })
      );
    }
  }
  return {
    bookSlug: 'tifr-gs-cs', source: 'TIFR GS Computer Science', sourceUrl: SOURCES.tifrArchive,
    importedAt: SOURCE_DATE, questions
  };
}

const CMI_CONFIG = {
  2023: {
    excluded: new Set([6]),
    hints: {
      1: ['discrete-mathematics', 'combination'], 2: ['discrete-mathematics', 'set-theory'],
      3: ['engineering-mathematics', 'probability-statistics'], 4: ['discrete-mathematics', 'graph-theory'],
      5: ['discrete-mathematics', 'graph-theory'], 7: ['theory-of-computation', 'regular-language'],
      8: ['algorithms', 'asymptotic-notation'], 9: ['c-programming', 'function'],
      10: ['c-programming', 'function']
    }
  },
  2024: {
    excluded: new Set([3]),
    hints: {
      1: ['discrete-mathematics', 'propositional-logic'], 2: ['discrete-mathematics', 'combination'],
      4: ['engineering-mathematics', 'probability-statistics'], 5: ['theory-of-computation', 'context-free-grammar'],
      6: ['theory-of-computation', 'finite-automata'], 7: ['algorithms', 'recurrence-relation'],
      8: ['algorithms', 'minimum-spanning-tree'], 9: ['algorithms', 'shortest-path'],
      10: ['c-programming', 'function']
    }
  },
  2025: {
    excluded: new Set([1]),
    hints: {
      2: ['theory-of-computation', 'finite-automata'], 3: ['discrete-mathematics', 'propositional-logic'],
      4: ['engineering-mathematics', 'probability-statistics'], 5: ['discrete-mathematics', 'graph-theory'],
      6: ['discrete-mathematics', 'combination'], 7: ['engineering-mathematics', 'probability-statistics'],
      8: ['c-programming', 'function'], 9: ['algorithms', 'recurrence-relation'],
      10: ['operating-systems', 'process-synchronization']
    }
  }
};

function cmiAnswer(block) {
  const answerLine = block.match(/(?:Answer|Solution)(?:[.:])?\s*([^\n]+)/i)?.[1] ?? '';
  const answers = [...answerLine.matchAll(/\(([a-d])\)/gi)].map((match) => match[1].toUpperCase());
  return [...new Set(answers)];
}

async function importCmi(temp) {
  const questions = [];
  for (const [yearText, config] of Object.entries(CMI_CONFIG)) {
    const year = Number(yearText);
    const url = `https://www.cmi.ac.in/admissions/sample-qp/pgcs${year}-solutions.pdf`;
    const pdfPath = path.join(temp, `cmi-${year}.pdf`);
    await download(url, pdfPath);
    let text = await pdfText(pdfPath, ['-layout']);
    const start = text.search(/^[ \t\f]*Part A[ \t]*$/m);
    if (start < 0) throw new Error(`Could not find CMI ${year} Part A`);
    text = text.slice(start);
    const end = text.search(/^[ \t\f]*Part B[ \t]*$/m);
    if (end < 0) throw new Error(`Could not find CMI ${year} Part B`);
    const blocks = sequentialBlocks(text.slice(0, end), 1, 10);
    for (const block of blocks) {
      if (config.excluded.has(block.number)) continue;
      const hint = config.hints[block.number];
      const answers = cmiAnswer(block.text);
      if (!hint || answers.length === 0) throw new Error(`Incomplete CMI ${year} question ${block.number}`);
      const questionOnly = block.text.split(/\n\s*(?:Answer|Solution)(?:[.:])?/i)[0];
      questions.push(
        baseQuestion({
          id: `cmi-cs:${year}:${block.number}`,
          year,
          number: block.number,
          paperLabel: `CMI MSc/PhD CS ${year} · Part A`,
          hint,
          type: answers.length > 1 ? 'MSQ' : 'MCQ',
          answer: answers.length > 1 ? answers : answers[0],
          html: questionHtml(questionOnly),
          sourceUrl: url,
          answerSource: { kind: 'official-solution', url }
        })
      );
    }
  }
  return {
    bookSlug: 'cmi-cs-objective', source: 'CMI MSc/PhD Computer Science', sourceUrl: SOURCES.cmiArchive,
    importedAt: SOURCE_DATE, questions
  };
}

const UGC_HINTS = new Map([
  [1, ['data-structure', 'stack']], [5, ['computer-networks', 'network-layer-protocol']],
  [6, ['computer-networks', 'application-layer-protocols']], [7, ['databases', 'transactions']],
  [8, ['data-structure', 'binary-search-tree']], [11, ['databases', 'file-system']],
  [12, ['databases', 'transactions']], [13, ['data-structure', 'n-ary-tree']],
  [15, ['computer-networks', 'application-layer-protocols']], [17, ['computer-networks', 'network-layer-protocol']],
  [18, ['computer-networks', 'physical-layer']], [27, ['data-structure', 'binary-search-tree']],
  [29, ['operating-systems', 'cpu-scheduling']], [31, ['operating-systems', 'deadlock']],
  [32, ['coa', 'cache-memory']], [34, ['computer-networks', 'data-link-layer']],
  [35, ['digital-logic', 'number-system']], [38, ['c-programming', 'function']],
  [40, ['theory-of-computation', 'recursive-language']], [49, ['data-structure', 'array']],
  [50, ['data-structure', 'n-ary-tree']]
]);

async function importUgc(temp) {
  const paperPath = path.join(temp, 'ugc-paper.pdf');
  const keyPath = path.join(temp, 'ugc-key.pdf');
  await Promise.all([download(SOURCES.ugcPaper, paperPath), download(SOURCES.ugcKey, keyPath)]);
  const columns = [];
  for (let page = 2; page <= 7; page += 1) {
    columns.push(await pdfText(paperPath, ['-f', String(page), '-l', String(page), '-x', '0', '-y', '0', '-W', '298', '-H', '842', '-layout']));
    columns.push(await pdfText(paperPath, ['-f', String(page), '-l', String(page), '-x', '298', '-y', '0', '-W', '297', '-H', '842', '-layout']));
  }
  const paperText = columns.join('\n');
  const blocks = new Map(sequentialBlocks(paperText, 1, 50).map((row) => [row.number, row.text]));
  const keys = answerMap(await pdfText(keyPath, ['-layout']), /^Q(\d+)\s+([A-D])\s*$/gim);
  const questions = [...UGC_HINTS].map(([number, hint]) => {
    const text = blocks.get(number);
    const answer = keys.get(number);
    if (!text || !answer) throw new Error(`Incomplete UGC NET source for question ${number}`);
    return baseQuestion({
      id: `ugc-net-cs:2012-06:${number}`,
      year: 2012,
      number,
      paperLabel: 'UGC NET CS June 2012 · Paper II (filtered)',
      hint,
      answer,
      html: questionHtml(text),
      sourceUrl: SOURCES.ugcPaper,
      answerSource: { kind: 'official-answer-key', url: SOURCES.ugcKey }
    });
  });
  return {
    bookSlug: 'ugc-net-cs-overlap', source: 'UGC NET Computer Science', sourceUrl: SOURCES.ugcArchive,
    importedAt: SOURCE_DATE, questions
  };
}

async function main() {
  const temp = await mkdtemp(path.join(tmpdir(), 'hetu-supplemental-pyqs-'));
  try {
    const payloads = await Promise.all([
      importIsro(temp),
      Promise.resolve(importIiith()),
      importTifr(temp),
      importCmi(temp),
      importUgc(temp)
    ]);
    await mkdir(OUTPUT_DIR, { recursive: true });
    for (const payload of payloads) {
      const destination = path.join(OUTPUT_DIR, `${payload.bookSlug}.json`);
      await writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`);
      console.log(`${payload.bookSlug}: ${payload.questions.length} questions`);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

await main();
