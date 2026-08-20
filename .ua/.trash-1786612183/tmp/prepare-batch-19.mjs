import { readFileSync, writeFileSync } from 'node:fs';

const root = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const batches = JSON.parse(readFileSync(`${root}/.ua/intermediate/batches.json`, 'utf8'));
const batch = batches.batches.find((candidate) => candidate.batchIndex === 19);
if (!batch) throw new Error('Original batchIndex 19 was not found');

const input = {
  projectRoot: root,
  batchFiles: batch.files,
  batchImportData: batch.batchImportData,
  neighborMap: batch.neighborMap
};

writeFileSync(
  `${root}/.ua/tmp/ua-file-analyzer-input-19.json`,
  `${JSON.stringify(input, null, 2)}\n`,
  'utf8'
);
