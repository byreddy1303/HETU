import { readFileSync, writeFileSync } from 'node:fs';

const root = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const batches = JSON.parse(readFileSync(`${root}/.ua/intermediate/batches.json`, 'utf8'));
const batch = batches.batches.find((candidate) => candidate.batchIndex === 7);
if (!batch) throw new Error('Original batchIndex 7 was not found');
const input = {
  projectRoot: root,
  batchFiles: batch.files,
  batchImportData: batch.batchImportData
};
writeFileSync(`${root}/.ua/tmp/ua-file-analyzer-input-7.json`, `${JSON.stringify(input, null, 2)}\n`, 'utf8');
