import { readFileSync, writeFileSync } from 'node:fs';

const root = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const graph = JSON.parse(readFileSync(`${root}/.ua/intermediate/assembled-graph.json`, 'utf8'));
const layers = JSON.parse(readFileSync(`${root}/.ua/intermediate/layers.json`, 'utf8'));
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

const expectedIds = new Set(
  graph.nodes.filter((node) => fileLevelTypes.has(node.type)).map((node) => node.id)
);
if (expectedIds.size !== 393) throw new Error(`Expected 393 file-level node IDs, found ${expectedIds.size}`);

const assignedBefore = layers.flatMap((layer) => layer.nodeIds);
const assignedBeforeSet = new Set(assignedBefore);
if (assignedBefore.length !== assignedBeforeSet.size) throw new Error('layers.json already contains duplicate assignments');

const missing = [...expectedIds].filter((id) => !assignedBeforeSet.has(id));
if (missing.length !== 39 || missing.some((id) => !id.startsWith('table:'))) {
  throw new Error(`Expected exactly 39 missing table nodes, found ${missing.length}`);
}

const databaseLayer = layers.find((layer) => layer.id === 'layer:database');
if (!databaseLayer) throw new Error('layer:database is missing');
databaseLayer.nodeIds.push(...missing);
databaseLayer.nodeIds.sort();

const assignedAfter = layers.flatMap((layer) => layer.nodeIds);
const assignedAfterSet = new Set(assignedAfter);
const dangling = [...assignedAfterSet].filter((id) => !expectedIds.has(id));
const stillMissing = [...expectedIds].filter((id) => !assignedAfterSet.has(id));
if (
  assignedAfter.length !== 393 ||
  assignedAfterSet.size !== 393 ||
  dangling.length > 0 ||
  stillMissing.length > 0
) {
  throw new Error(
    `Invalid final assignments: total=${assignedAfter.length}, unique=${assignedAfterSet.size}, dangling=${dangling.length}, missing=${stillMissing.length}`
  );
}

writeFileSync(`${root}/.ua/intermediate/layers.json`, `${JSON.stringify(layers, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  addedTableNodes: missing.length,
  databaseCount: databaseLayer.nodeIds.length,
  totalAssigned: assignedAfter.length,
  uniqueAssigned: assignedAfterSet.size,
  dangling: dangling.length,
  missing: stillMissing.length
}));
