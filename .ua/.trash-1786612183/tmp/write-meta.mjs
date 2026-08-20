import fs from 'node:fs';

const [metaPath, graphPath, analyzedFiles] = process.argv.slice(2);
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const meta = {
  lastAnalyzedAt: graph.project.analyzedAt,
  gitCommitHash: graph.project.gitCommitHash,
  version: graph.version,
  analyzedFiles: Number(analyzedFiles),
};

fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
