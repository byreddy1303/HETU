import { copyFile, cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const sourceRoot = path.resolve(
  process.env.TOPPER_NOTES_SOURCE ?? path.join(projectRoot, '..', 'NOTES - ALL SUBJECTS')
);
const outputRoot = path.join(projectRoot, 'public', 'gate-topper-notes');
const manifestPath = path.join(projectRoot, 'src', 'data', 'topper-notes.json');

const notes = [
  {
    id: 'dm-fundamentals',
    subject: 'Discrete Mathematics',
    sequence: 1,
    title: 'Fundamentals',
    description: 'Sets, relations and the core language used across discrete mathematics.',
    author: 'Karan Agrawal',
    credential: 'GATE CS 2024 AIR 102',
    pages: 50,
    input: 'Discrete Mathematics/Fundamentals 1.pdf',
    output: 'pdfs/discrete-mathematics/01-fundamentals.pdf'
  },
  {
    id: 'dm-propositional-logic',
    subject: 'Discrete Mathematics',
    sequence: 2,
    title: 'Propositional Logic',
    description: 'Connectives, equivalences, validity and fast truth-table reasoning.',
    author: 'Karan Agrawal',
    credential: 'GATE CS 2024 AIR 102',
    pages: 44,
    input: 'Discrete Mathematics/Propositional Logic Notes 2.pdf',
    output: 'pdfs/discrete-mathematics/02-propositional-logic.pdf'
  },
  {
    id: 'dm-first-order-logic',
    subject: 'Discrete Mathematics',
    sequence: 3,
    title: 'First Order Logic',
    description: 'Predicates, quantifiers, inference and common logical traps.',
    author: 'Karan Agrawal',
    credential: 'GATE CS 2024 AIR 102',
    pages: 60,
    input: 'Discrete Mathematics/First Order Logic Notes 3.pdf',
    output: 'pdfs/discrete-mathematics/03-first-order-logic.pdf'
  },
  {
    id: 'dm-functions',
    subject: 'Discrete Mathematics',
    sequence: 4,
    title: 'Functions',
    description: 'Mappings, composition, inverse functions and counting patterns.',
    author: 'Mahek Garala',
    credential: 'GATE CS 2026 AIR 75',
    pages: 23,
    input: 'Discrete Mathematics/Functions 4.pdf',
    output: 'pdfs/discrete-mathematics/04-functions.pdf'
  },
  {
    id: 'dm-combinatorics',
    subject: 'Discrete Mathematics',
    sequence: 5,
    title: 'Combinatorics',
    description: 'Counting rules, arrangements, selections and recurrence-style thinking.',
    author: 'Karan Agrawal',
    credential: 'GATE CS 2024 AIR 102',
    pages: 151,
    input: 'Discrete Mathematics/Combinatorics 5.pdf',
    output: 'pdfs/discrete-mathematics/05-combinatorics.pdf'
  },
  {
    id: 'dm-graph-theory',
    subject: 'Discrete Mathematics',
    sequence: 6,
    title: 'Graph Theory',
    description: 'Connectivity, trees, traversal properties, colouring and planarity.',
    author: 'Karan Agrawal',
    credential: 'GATE CS 2024 AIR 102',
    pages: 100,
    input: 'Discrete Mathematics/Graph Theory 6.pdf',
    output: 'pdfs/discrete-mathematics/06-graph-theory.pdf'
  },
  {
    id: 'dl-boolean-algebra',
    subject: 'Digital Logic',
    sequence: 1,
    title: 'Boolean Algebra & Minimisation',
    description: 'Boolean identities, canonical forms, K-maps and minimisation.',
    author: 'Karan Agrawal',
    credential: 'GATE CS 2024 AIR 102',
    pages: 46,
    input: 'Digital Logic/Boolean Algebra & Minimisation 1.pdf',
    output: 'pdfs/digital-logic/01-boolean-algebra-minimisation.pdf'
  },
  {
    id: 'dl-number-system',
    subject: 'Digital Logic',
    sequence: 2,
    title: 'Number System',
    description: 'Bases, complements, signed representation and binary arithmetic.',
    author: 'Karan Agrawal',
    credential: 'GATE CS 2024 AIR 102',
    pages: 43,
    input: 'Digital Logic/Number System 2.pdf',
    output: 'pdfs/digital-logic/02-number-system.pdf'
  },
  {
    id: 'dl-combinational-circuits',
    subject: 'Digital Logic',
    sequence: 3,
    title: 'Combinational Circuits',
    description: 'Adders, multiplexers, encoders, decoders and circuit composition.',
    author: 'Karan Agrawal',
    credential: 'GATE CS 2024 AIR 102',
    pages: 35,
    input: 'Digital Logic/Combinational Circuits 3.pdf',
    output: 'pdfs/digital-logic/03-combinational-circuits.pdf'
  },
  {
    id: 'dl-functional-completeness',
    subject: 'Digital Logic',
    sequence: 4,
    title: 'Functional Completeness',
    description: 'Universal gates and determining functionally complete sets.',
    author: 'Karan Agrawal',
    credential: 'GATE CS 2024 AIR 102',
    pages: 14,
    input: 'Digital Logic/Functional Completeness 4.pdf',
    output: 'pdfs/digital-logic/04-functional-completeness.pdf'
  },
  {
    id: 'dl-sequential-circuits',
    subject: 'Digital Logic',
    sequence: 5,
    title: 'Sequential Circuits',
    description: 'Latches, flip-flops, counters, registers and timing behaviour.',
    author: 'Karan Agrawal',
    credential: 'GATE CS 2024 AIR 102',
    pages: 100,
    input: 'Digital Logic/Sequential circuits 5.pdf',
    output: 'pdfs/digital-logic/05-sequential-circuits.pdf'
  },
  {
    id: 'em-reference',
    subject: 'Engineering Mathematics',
    sequence: 1,
    title: 'Engineering Mathematics Reference',
    description: 'A compact all-in-one reference for the broader mathematics syllabus.',
    author: 'Physics Wallah',
    credential: 'Reference book',
    pages: 43,
    input: 'Engineering Mathematics/Engineering Mathematics Notes.pdf',
    output: 'pdfs/engineering-mathematics/01-engineering-mathematics-reference.pdf'
  },
  {
    id: 'em-linear-algebra-1',
    subject: 'Engineering Mathematics',
    sequence: 2,
    title: 'Linear Algebra · Part 1',
    description: 'Vectors, matrices and the first layer of linear algebra foundations.',
    author: 'Karan Agrawal',
    credential: 'GATE CS 2024 AIR 102',
    pages: 19,
    input: 'Engineering Mathematics/Linear Algebra Notes 1.pdf',
    output: 'pdfs/engineering-mathematics/02-linear-algebra-part-1.pdf'
  },
  {
    id: 'em-linear-algebra-2',
    subject: 'Engineering Mathematics',
    sequence: 3,
    title: 'Linear Algebra · Part 2',
    description: 'Systems, rank and structural properties of matrices.',
    author: 'Karan Agrawal',
    credential: 'GATE CS 2024 AIR 102',
    pages: 42,
    input: 'Engineering Mathematics/Linear Algebra Part 2.pdf',
    output: 'pdfs/engineering-mathematics/03-linear-algebra-part-2.pdf'
  },
  {
    id: 'em-linear-algebra-3',
    subject: 'Engineering Mathematics',
    sequence: 4,
    title: 'Linear Algebra · Part 3',
    description: 'Determinants, inverses and computation shortcuts for GATE.',
    author: 'Karan Agrawal',
    credential: 'GATE CS 2024 AIR 102',
    pages: 16,
    input: 'Engineering Mathematics/Linear Algebra Part 3.pdf',
    output: 'pdfs/engineering-mathematics/04-linear-algebra-part-3.pdf'
  },
  {
    id: 'em-linear-algebra-4',
    subject: 'Engineering Mathematics',
    sequence: 5,
    title: 'Linear Algebra · Part 4',
    description: 'Eigenvalues, eigenvectors and higher-yield matrix results.',
    author: 'Karan Agrawal',
    credential: 'GATE CS 2024 AIR 102',
    pages: 32,
    input: 'Engineering Mathematics/Linear Algebra Part 4.pdf',
    output: 'pdfs/engineering-mathematics/05-linear-algebra-part-4.pdf'
  },
  {
    id: 'em-linear-algebra-foundations',
    subject: 'Engineering Mathematics',
    sequence: 6,
    title: 'Linear Algebra Foundations',
    description: 'A typeset companion covering vectors, span, rank and elimination.',
    author: 'HETU study companion',
    credential: 'Typeset edition',
    pages: 11,
    input: 'Engineering Mathematics/L.A/LA_NOTES_01_Foundations_Dark.pdf',
    output: 'pdfs/engineering-mathematics/06-linear-algebra-foundations.pdf'
  }
];

function assertSourceExists(relativePath) {
  const absolutePath = path.join(sourceRoot, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing topper-notes source: ${absolutePath}`);
  }
  return absolutePath;
}

function compressPdf(inputPath, outputPath) {
  const result = spawnSync(
    'gs',
    [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.6',
      '-dPDFSETTINGS=/ebook',
      '-dNOPAUSE',
      '-dBATCH',
      '-dQUIET',
      '-dSAFER',
      '-dDetectDuplicateImages=true',
      '-dCompressFonts=true',
      '-dSubsetFonts=true',
      '-dDownsampleColorImages=true',
      '-dColorImageResolution=150',
      '-dDownsampleGrayImages=true',
      '-dGrayImageResolution=150',
      '-dDownsampleMonoImages=true',
      '-dMonoImageResolution=300',
      `-sOutputFile=${outputPath}`,
      inputPath
    ],
    { stdio: 'inherit' }
  );

  if (result.status !== 0) {
    throw new Error(`Ghostscript failed for ${inputPath}`);
  }
}

async function main() {
  if (!existsSync(sourceRoot)) throw new Error(`Topper-notes folder not found: ${sourceRoot}`);
  if (spawnSync('gs', ['--version'], { stdio: 'ignore' }).status !== 0) {
    throw new Error('Ghostscript is required. Install it with `brew install ghostscript`.');
  }

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const manifest = [];
  for (const note of notes) {
    const inputPath = assertSourceExists(note.input);
    const outputPath = path.join(outputRoot, note.output);
    await mkdir(path.dirname(outputPath), { recursive: true });

    if ((await stat(inputPath)).size < 1_000_000) {
      await copyFile(inputPath, outputPath);
    } else {
      compressPdf(inputPath, outputPath);
    }

    const outputStats = await stat(outputPath);
    manifest.push({
      id: note.id,
      subject: note.subject,
      sequence: note.sequence,
      title: note.title,
      description: note.description,
      author: note.author,
      credential: note.credential,
      pages: note.pages,
      bytes: outputStats.size,
      href: `/gate-topper-notes/${note.output}`
    });
    console.log(`Built ${note.output} (${(outputStats.size / 1_000_000).toFixed(1)} MB)`);
  }

  const hubSource = assertSourceExists('Engineering Mathematics/L.A/mastery-hub');
  const hubOutput = path.join(outputRoot, 'linear-algebra-lab');
  await cp(hubSource, hubOutput, {
    recursive: true,
    filter(sourcePath) {
      return path.basename(sourcePath) !== 'build-problem-lab.js';
    }
  });

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(projectRoot, manifestPath)}`);
}

await main();
