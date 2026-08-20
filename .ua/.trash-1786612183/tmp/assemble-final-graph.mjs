import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [projectRoot, scanPath, assembledPath, layersPath, tourPath, outputPath] = process.argv.slice(2);
const scan = JSON.parse(fs.readFileSync(scanPath, 'utf8'));
const assembled = JSON.parse(fs.readFileSync(assembledPath, 'utf8'));
const layers = JSON.parse(fs.readFileSync(layersPath, 'utf8'));
const tour = JSON.parse(fs.readFileSync(tourPath, 'utf8'));
const gitCommitHash = execFileSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const graph = {
  version: '1.0.0',
  project: {
    name: scan.name,
    languages: scan.languages,
    frameworks: scan.frameworks,
    description: scan.description,
    analyzedAt: new Date().toISOString(),
    gitCommitHash,
  },
  nodes: assembled.nodes,
  edges: assembled.edges,
  layers,
  tour,
};

fs.writeFileSync(outputPath, `${JSON.stringify(graph, null, 2)}\n`);
