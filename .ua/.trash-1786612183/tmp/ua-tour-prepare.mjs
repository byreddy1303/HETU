import fs from 'node:fs';

const graphPath = process.argv[2];
const layersPath = process.argv[3];
const outputPath = process.argv[4];

if (!graphPath || !layersPath || !outputPath) {
  console.error('Usage: node ua-tour-prepare.mjs <graph> <layers> <output>');
  process.exit(1);
}

const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const layers = JSON.parse(fs.readFileSync(layersPath, 'utf8'));
const topologyTypes = new Set([
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

const input = {
  nodes: graph.nodes.filter((node) => topologyTypes.has(node.type)),
  edges: graph.edges,
  layers: layers.map(({ id, name, description }) => ({ id, name, description }))
};

fs.writeFileSync(outputPath, `${JSON.stringify(input, null, 2)}\n`);
console.log(JSON.stringify({
  nodes: input.nodes.length,
  edges: input.edges.length,
  layers: input.layers.length,
  nodeTypes: [...new Set(input.nodes.map((node) => node.type))].sort()
}));
