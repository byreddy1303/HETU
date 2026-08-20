import { readFileSync, writeFileSync } from 'node:fs';

const root = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const batches = JSON.parse(readFileSync(`${root}/.ua/intermediate/batches.json`, 'utf8'));
const batch = batches.batches.find((candidate) => candidate.batchIndex === 4);
if (!batch) throw new Error('Incremental original batchIndex 4 was not found');

const input = {
  projectRoot: root,
  batchFiles: batch.files,
  batchImportData: batch.batchImportData,
  neighborMap: batch.neighborMap
};

writeFileSync(
  `${root}/.ua/tmp/ua-file-analyzer-input-4.json`,
  `${JSON.stringify(input, null, 2)}\n`,
  'utf8'
);
