#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const REFERENCE_ROOT = join(REPO_ROOT, 'references', 'gate-papers');
const PDF_ROOT = join(REFERENCE_ROOT, 'pdfs');
const MANIFEST_PATH = join(REFERENCE_ROOT, 'manifest.json');

const OFFICIAL_DOWNLOADS_PAGE = 'https://gate2026.iitg.ac.in/download.html';
const OFFICIAL_2026_PAGE = 'https://gate2026.iitg.ac.in/QPs-answer-keys.html';
const LEGACY_CS_INDEX = 'https://www.gateexam.info/previous-papers/CS/';

const OFFICIAL_ARCHIVE = {
  id: 'gate-cs-2007-2025',
  classification: 'official',
  localPath: 'pdfs/official/gate-cs-2007-2025.zip',
  sourceUrl:
    'https://drive.usercontent.google.com/download?id=1popAHO-cX69oQEx_tD0wZXL1tTrBljeO&export=download&confirm=t',
  sourcePageUrl: OFFICIAL_DOWNLOADS_PAGE,
  description: "CS.zip from IIT Guwahati's official GATE 2007-2025 bulk-download folder."
};

const OFFICIAL_ARCHIVE_MEMBERS = [
  ['CS/CS2007.pdf', 2007, null],
  ['CS/CS2008.pdf', 2008, null],
  ['CS/CS2009.pdf', 2009, null],
  ['CS/CS2010.pdf', 2010, null],
  ['CS/CS2011.pdf', 2011, null],
  ['CS/CS2012.pdf', 2012, null],
  ['CS/CS2013.pdf', 2013, null],
  ['CS/CS2014.pdf', 2014, null],
  ['CS/CS2015.pdf', 2015, null],
  ['CS/CS2016.pdf', 2016, null],
  ['CS/CS1-2017.pdf', 2017, 1],
  ['CS/CS2-2017.pdf', 2017, 2],
  ['CS/CS2018.pdf', 2018, null],
  ['CS/CS2019.pdf', 2019, null],
  ['CS/CS2020.pdf', 2020, null],
  ['CS/CS1-2021.pdf', 2021, 1],
  ['CS/CS2-2021.pdf', 2021, 2],
  ['CS/CS2022.pdf', 2022, null],
  ['CS/CS2023.pdf', 2023, null],
  ['CS/CS12024.pdf', 2024, 1],
  ['CS/CS22024.pdf', 2024, 2],
  ['CS/CS12025.pdf', 2025, 1],
  ['CS/CS22025.pdf', 2025, 2]
];

const OFFICIAL_2026_FILES = [
  {
    localPath: 'pdfs/official/CS/CS1-2026.pdf',
    sourceUrl: 'https://gate2026.iitg.ac.in/doc/download/2026/QPs/CS1.pdf',
    paperCode: 'CS',
    year: 2026,
    session: 1,
    documentType: 'question-paper'
  },
  {
    localPath: 'pdfs/official/CS/CS2-2026.pdf',
    sourceUrl: 'https://gate2026.iitg.ac.in/doc/download/2026/QPs/CS2.pdf',
    paperCode: 'CS',
    year: 2026,
    session: 2,
    documentType: 'question-paper'
  },
  {
    localPath: 'pdfs/official/CS/CS1-2026-key.pdf',
    sourceUrl: 'https://gate2026.iitg.ac.in/doc/download/2026/Keys/CS1_Keys.pdf',
    paperCode: 'CS',
    year: 2026,
    session: 1,
    documentType: 'answer-key'
  },
  {
    localPath: 'pdfs/official/CS/CS2-2026-key.pdf',
    sourceUrl: 'https://gate2026.iitg.ac.in/doc/download/2026/Keys/CS2_Keys.pdf',
    paperCode: 'CS',
    year: 2026,
    session: 2,
    documentType: 'answer-key'
  }
];

// These two members in IIT Guwahati's published CS.zip are truncated before their
// PDF catalog/header. Their exact upstream bytes are retained and checksummed.
// Page counts were established by the per-file methods below and cross-checked
// against readable copies of the same papers; see references/gate-papers/README.md.
const UPSTREAM_PDF_PAGE_OVERRIDES = new Map([
  [
    'pdfs/official/CS/CS2011.pdf',
    {
      pages: 17,
      pageCountMethod: 'cross-checked-readable-copy',
      pdfValidation: 'malformed-upstream-archive-member'
    }
  ],
  [
    'pdfs/official/CS/CS1-2017.pdf',
    {
      pages: 29,
      pageCountMethod: 'recovered-pages-tree-and-readable-copy',
      pdfValidation: 'malformed-upstream-archive-member'
    }
  ]
]);

const LEGACY_PAPERS = [
  ...range(1991, 2006).map((year) => legacyPaper('CS', year)),
  ...range(1991, 2002).map((year) => legacyPaper('EC', year)),
  ...[1997, 1998, 2001, 2002, 2004].map((year) => legacyPaper('EE', year))
];

const SUPPLEMENTAL_READABLE_COPIES = [
  {
    classification: 'readable-mirror',
    localPath: 'pdfs/readable-mirrors/gate-cs-2011-readable.pdf',
    sourceUrl: 'https://www.gateexam.info/docs/papers/CS/CS-2011.pdf',
    sourcePageUrl: LEGACY_CS_INDEX,
    paperCode: 'CS',
    year: 2011,
    session: null,
    documentType: 'supplemental-readable-copy',
    supplements: 'pdfs/official/CS/CS2011.pdf'
  },
  {
    classification: 'readable-mirror',
    localPath: 'pdfs/readable-mirrors/gate-cs-2017-set-1-readable.pdf',
    sourceUrl:
      'https://cdn.aglasem.com/aglasem-doc/d285b81c-8878-11e9-8d23-e470b83c4461/d285b81c-8878-11e9-8d23-e470b83c4461.pdf',
    sourcePageUrl: 'https://docs.aglasem.com/view/d285b81c-8878-11e9-8d23-e470b83c4461',
    paperCode: 'CS',
    year: 2017,
    session: 1,
    documentType: 'supplemental-readable-copy',
    supplements: 'pdfs/official/CS/CS1-2017.pdf'
  }
];

const PAPER_DESCRIPTORS = [
  ...OFFICIAL_ARCHIVE_MEMBERS.map(([archiveEntry, year, session]) => ({
    classification: 'official',
    localPath: `pdfs/official/${archiveEntry}`,
    sourceUrl: OFFICIAL_ARCHIVE.sourceUrl,
    sourcePageUrl: OFFICIAL_DOWNLOADS_PAGE,
    archiveId: OFFICIAL_ARCHIVE.id,
    archiveEntry,
    paperCode: 'CS',
    year,
    session,
    documentType: 'question-paper'
  })),
  ...OFFICIAL_2026_FILES.map((paper) => ({
    ...paper,
    classification: 'official',
    sourcePageUrl: OFFICIAL_2026_PAGE
  })),
  ...LEGACY_PAPERS,
  ...SUPPLEMENTAL_READABLE_COPIES
];

function range(first, last) {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function legacyPaper(paperCode, year) {
  const lowerCode = paperCode.toLowerCase();
  return {
    classification: 'legacy-mirror',
    localPath: `pdfs/legacy-mirrors/gate-${lowerCode}-${year}.pdf`,
    sourceUrl: `https://www.gateexam.info/docs/papers/${paperCode}/${paperCode}-${year}.pdf`,
    sourcePageUrl:
      paperCode === 'CS' ? LEGACY_CS_INDEX : 'https://www.gateexam.info/previous-papers/',
    paperCode,
    year,
    session: null,
    documentType: 'question-paper'
  };
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function pdfPageInfo(path, localPath) {
  const result = spawnSync('pdfinfo', [path], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') {
    throw new Error('pdfinfo is required. Install Poppler and retry.');
  }
  if (result.status !== 0) {
    const override = UPSTREAM_PDF_PAGE_OVERRIDES.get(localPath);
    if (override) return override;
    throw new Error(`pdfinfo failed for ${relative(REPO_ROOT, path)}: ${result.stderr.trim()}`);
  }
  const match = result.stdout.match(/^Pages:\s+(\d+)\s*$/m);
  if (!match) throw new Error(`Could not read page count for ${relative(REPO_ROOT, path)}`);
  return {
    pages: Number(match[1]),
    pageCountMethod: 'pdfinfo',
    pdfValidation: 'readable'
  };
}

function describeFile(descriptor) {
  const absolutePath = join(REFERENCE_ROOT, descriptor.localPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing local source: ${relative(REPO_ROOT, absolutePath)}`);
  }
  return {
    ...descriptor,
    sizeBytes: statSync(absolutePath).size,
    sha256: sha256(absolutePath),
    ...pdfPageInfo(absolutePath, descriptor.localPath)
  };
}

function buildManifest() {
  const archivePath = join(REFERENCE_ROOT, OFFICIAL_ARCHIVE.localPath);
  if (!existsSync(archivePath)) {
    throw new Error(`Missing local archive: ${relative(REPO_ROOT, archivePath)}`);
  }

  return {
    schemaVersion: 1,
    generatedBy: 'scripts/download-gate-papers.mjs --write-manifest',
    scope: {
      description:
        'Local paper evidence used to cross-check GATE-derived marks in the shipped question bank.',
      officialCoverage: 'Computer Science and Information Technology (CS), 2007-2026',
      legacyMirrorCoverage:
        'CS 1991-2006; selected EC and EE papers needed by cross-discipline rows',
      supplementalReadableCopies:
        'Third-party readable copies of the two malformed official archive members (CS 2011 and CS 2017 session 1)'
    },
    sourcePages: {
      officialDownloads: OFFICIAL_DOWNLOADS_PAGE,
      official2026MasterPapersAndKeys: OFFICIAL_2026_PAGE,
      legacyMirrorIndex: LEGACY_CS_INDEX,
      supplemental2017ReadableCopy:
        'https://docs.aglasem.com/view/d285b81c-8878-11e9-8d23-e470b83c4461'
    },
    archives: [
      {
        ...OFFICIAL_ARCHIVE,
        sizeBytes: statSync(archivePath).size,
        sha256: sha256(archivePath),
        memberCount: OFFICIAL_ARCHIVE_MEMBERS.length
      }
    ],
    papers: PAPER_DESCRIPTORS.map(describeFile),
    knownGaps: [
      {
        paperCode: 'CS',
        year: 1990,
        status: 'not-downloaded',
        reason:
          'The official bulk archive starts at 2007 and the configured legacy mirror starts at 1991; no CS 1990 PDF is present in this local bundle.'
      },
      {
        paperCode: 'IT',
        years: [2004, 2005, 2006, 2007, 2008],
        status: 'not-downloaded',
        reason:
          'No standalone IT PDFs are present in the IIT Guwahati CS archive. Previously indexed third-party IT PDF URLs returned HTTP 410 during this acquisition, so those files are not represented as locally verified PDFs.'
      }
    ]
  };
}

function writeManifest() {
  const manifest = buildManifest();
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Wrote ${relative(REPO_ROOT, MANIFEST_PATH)} (${manifest.papers.length} PDFs, ${manifest.archives.length} archive).`
  );
}

function listPdfFiles(directory) {
  if (!existsSync(directory)) return [];
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...listPdfFiles(path));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.pdf') found.push(path);
  }
  return found.sort();
}

function verifyManifest() {
  if (!existsSync(MANIFEST_PATH))
    throw new Error('Manifest does not exist; run with --write-manifest.');
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const failures = [];

  for (const descriptor of [...manifest.archives, ...manifest.papers]) {
    const absolutePath = join(REFERENCE_ROOT, descriptor.localPath);
    if (!existsSync(absolutePath)) {
      failures.push(`${descriptor.localPath}: missing`);
      continue;
    }
    const actualSize = statSync(absolutePath).size;
    const actualHash = sha256(absolutePath);
    if (actualSize !== descriptor.sizeBytes) {
      failures.push(
        `${descriptor.localPath}: size ${actualSize}, expected ${descriptor.sizeBytes}`
      );
    }
    if (actualHash !== descriptor.sha256) {
      failures.push(
        `${descriptor.localPath}: SHA-256 ${actualHash}, expected ${descriptor.sha256}`
      );
    }
    if (descriptor.pages !== undefined) {
      const actualPageInfo = pdfPageInfo(absolutePath, descriptor.localPath);
      if (actualPageInfo.pages !== descriptor.pages) {
        failures.push(
          `${descriptor.localPath}: ${actualPageInfo.pages} pages, expected ${descriptor.pages}`
        );
      }
    }
  }

  const expectedPdfs = new Set(manifest.papers.map((paper) => paper.localPath));
  for (const absolutePath of listPdfFiles(PDF_ROOT)) {
    const localPath = relative(REFERENCE_ROOT, absolutePath);
    if (!expectedPdfs.has(localPath)) failures.push(`${localPath}: PDF is not listed in manifest`);
  }

  if (failures.length > 0) {
    throw new Error(`Manifest verification failed:\n- ${failures.join('\n- ')}`);
  }
  console.log(`Verified ${manifest.papers.length} PDFs and ${manifest.archives.length} archive.`);
}

async function downloadFile(url, destination, { force }) {
  if (existsSync(destination) && !force) {
    console.log(`Keeping ${relative(REPO_ROOT, destination)}`);
    return;
  }
  mkdirSync(dirname(destination), { recursive: true });
  const partialPath = `${destination}.partial`;
  rmSync(partialPath, { force: true });
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  await pipeline(response.body, createWriteStream(partialPath));
  renameSync(partialPath, destination);
  console.log(`Downloaded ${relative(REPO_ROOT, destination)}`);
}

async function downloadAll({ force }) {
  const archivePath = join(REFERENCE_ROOT, OFFICIAL_ARCHIVE.localPath);
  await downloadFile(OFFICIAL_ARCHIVE.sourceUrl, archivePath, { force });

  const unzip = spawnSync(
    'unzip',
    [force ? '-o' : '-n', archivePath, 'CS/*.pdf', '-d', join(PDF_ROOT, 'official')],
    { encoding: 'utf8' }
  );
  if (unzip.error?.code === 'ENOENT')
    throw new Error('unzip is required to extract the official archive.');
  if (unzip.status !== 0) throw new Error(`unzip failed: ${unzip.stderr.trim()}`);
  console.log(`Extracted ${OFFICIAL_ARCHIVE_MEMBERS.length} official PDFs.`);

  for (const paper of [
    ...OFFICIAL_2026_FILES,
    ...LEGACY_PAPERS,
    ...SUPPLEMENTAL_READABLE_COPIES
  ]) {
    await downloadFile(paper.sourceUrl, join(REFERENCE_ROOT, paper.localPath), { force });
  }
}

function usage() {
  console.log(`Usage:
  node scripts/download-gate-papers.mjs --download [--force]
  node scripts/download-gate-papers.mjs --write-manifest
  node scripts/download-gate-papers.mjs --verify

--download        Download the official archive, 2026 papers/keys, and configured legacy mirrors.
--force           Re-download files that already exist (only valid with --download).
--write-manifest  Recompute SHA-256, byte size, and PDF page counts from local files.
--verify          Verify local files against references/gate-papers/manifest.json.
`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const modes = ['--download', '--write-manifest', '--verify'].filter((mode) => args.has(mode));
  if (args.has('--help') || args.has('-h')) {
    usage();
    return;
  }
  if (modes.length !== 1) {
    usage();
    process.exitCode = 1;
    return;
  }
  if (args.has('--force') && !args.has('--download')) {
    throw new Error('--force is only valid with --download.');
  }

  if (args.has('--download')) await downloadAll({ force: args.has('--force') });
  else if (args.has('--write-manifest')) writeManifest();
  else verifyManifest();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
