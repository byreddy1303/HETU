import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const projectRoot = process.argv[2];
const scan = JSON.parse(fs.readFileSync(`${projectRoot}/.ua/intermediate/scan-result.json`, 'utf8'));
const gitCommitHash = execFileSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const input = {
  projectRoot,
  sourceFilePaths: scan.files.map((file) => file.path),
  gitCommitHash,
};

fs.writeFileSync(
  `${projectRoot}/.ua/intermediate/fingerprint-input.json`,
  `${JSON.stringify(input, null, 2)}\n`,
);
