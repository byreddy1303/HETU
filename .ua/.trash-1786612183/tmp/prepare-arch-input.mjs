import { readFileSync, writeFileSync } from 'node:fs';

const root = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const graph = JSON.parse(readFileSync(`${root}/.ua/intermediate/assembled-graph.json`, 'utf8'));
const fileLevelTypes = new Set([
  'file',
  'config',
  'document',
  'service',
  'pipeline',
  'table',
  'schema',
  'resource',
  'endpoint'
]);

const fileNodes = graph.nodes.filter((node) => fileLevelTypes.has(node.type));
const fileNodeIds = new Set(fileNodes.map((node) => node.id));
if (fileNodes.length !== 395 || fileNodeIds.size !== 395) {
  throw new Error(
    `Expected 395 unique file-level node IDs, got nodes=${fileNodes.length}, ids=${fileNodeIds.size}`
  );
}

const importEdges = graph.edges.filter(
  (edge) => edge.type === 'imports' && fileNodeIds.has(edge.source) && fileNodeIds.has(edge.target)
);
const totalImports = graph.edges.filter((edge) => edge.type === 'imports').length;
if (importEdges.length !== totalImports) {
  throw new Error(`File-level import filtering dropped ${totalImports - importEdges.length} imports`);
}

const allEdges = graph.edges.filter(
  (edge) => fileNodeIds.has(edge.source) && fileNodeIds.has(edge.target)
);

writeFileSync(
  `${root}/.ua/tmp/ua-arch-input.json`,
  `${JSON.stringify({ fileNodes, importEdges, allEdges }, null, 2)}\n`,
  'utf8'
);

console.log(JSON.stringify({ fileNodes: fileNodes.length, importEdges: importEdges.length, allEdges: allEdges.length }));
