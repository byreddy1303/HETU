import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2];
const outputPath = process.argv[3];

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const raw = item && typeof item[key] === 'string' ? item[key] : '(missing)';
    counts[raw] = (counts[raw] || 0) + 1;
  }
  return counts;
}

function quoted(value) {
  return `'${String(value)}'`;
}

try {
  if (!inputPath || !outputPath) {
    throw new Error('Usage: node ua-graph-validate.js <graph-file> <output-file>');
  }

  const graph = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const issues = [];
  const warnings = [];

  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const layers = Array.isArray(graph.layers) ? graph.layers : [];
  const tourSteps = Array.isArray(graph.tour)
    ? graph.tour
    : graph.tour && Array.isArray(graph.tour.steps)
      ? graph.tour.steps
      : [];

  if (!Array.isArray(graph.nodes)) issues.push("Graph field 'nodes' must be an array");
  if (!Array.isArray(graph.edges)) issues.push("Graph field 'edges' must be an array");
  if (!Array.isArray(graph.layers)) {
    const hasDomainNode = nodes.some((node) => ['domain', 'flow', 'step'].includes(node?.type));
    (hasDomainNode ? warnings : issues).push("Graph field 'layers' must be an array");
  }
  if (!(Array.isArray(graph.tour) || (graph.tour && Array.isArray(graph.tour.steps)))) {
    const hasDomainNode = nodes.some((node) => ['domain', 'flow', 'step'].includes(node?.type));
    (hasDomainNode ? warnings : issues).push("Graph field 'tour' must be an array or an object with a steps array");
  }

  const validNodeTypes = new Set([
    'file', 'function', 'class', 'module', 'concept', 'config', 'document',
    'service', 'table', 'endpoint', 'pipeline', 'schema', 'resource', 'domain',
    'flow', 'step'
  ]);
  const validPrefixes = new Set([
    'file', 'function', 'class', 'module', 'concept', 'config', 'document',
    'service', 'table', 'endpoint', 'pipeline', 'schema', 'resource', 'domain',
    'flow', 'step'
  ]);
  const validComplexities = new Set(['simple', 'moderate', 'complex']);
  const validEdgeTypes = new Set([
    'imports', 'exports', 'contains', 'inherits', 'implements', 'calls',
    'subscribes', 'publishes', 'middleware', 'reads_from', 'writes_to',
    'transforms', 'validates', 'depends_on', 'tested_by', 'configures',
    'related', 'similar_to', 'deploys', 'serves', 'migrates', 'documents',
    'provisions', 'routes', 'defines_schema', 'triggers', 'contains_flow',
    'flow_step', 'cross_domain'
  ]);
  const validDirections = new Set(['forward', 'backward', 'bidirectional']);
  const tagPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const label = `Node at index ${index}`;
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      issues.push(`${label} must be an object`);
      continue;
    }
    if (typeof node.id !== 'string' || node.id.trim() === '') {
      issues.push(`${label} has missing or invalid 'id'`);
    } else {
      const prefix = node.id.includes(':') ? node.id.slice(0, node.id.indexOf(':')) : '';
      if (!validPrefixes.has(prefix)) {
        issues.push(`${label} has ID ${quoted(node.id)} with an invalid prefix`);
      }
    }
    if (typeof node.type !== 'string' || !validNodeTypes.has(node.type)) {
      issues.push(`${label} (${quoted(node.id)}) has invalid node type ${quoted(node.type)}`);
    }
    if (typeof node.name !== 'string' || node.name.trim() === '') {
      issues.push(`${label} (${quoted(node.id)}) has missing or invalid 'name'`);
    }
    if (typeof node.summary !== 'string' || node.summary.trim() === '') {
      issues.push(`${label} (${quoted(node.id)}) has missing or invalid 'summary'`);
    }
    if (!Array.isArray(node.tags) || node.tags.length < 1) {
      issues.push(`${label} (${quoted(node.id)}) must have a non-empty string array in 'tags'`);
    } else {
      for (let tagIndex = 0; tagIndex < node.tags.length; tagIndex += 1) {
        const tag = node.tags[tagIndex];
        if (typeof tag !== 'string' || !tagPattern.test(tag)) {
          issues.push(`${label} (${quoted(node.id)}) has invalid lowercase-hyphenated tag at index ${tagIndex}: ${quoted(tag)}`);
        }
      }
    }
    if (typeof node.complexity !== 'string' || !validComplexities.has(node.complexity)) {
      issues.push(`${label} (${quoted(node.id)}) has invalid complexity ${quoted(node.complexity)}`);
    }
  }

  const idToIndices = new Map();
  for (let index = 0; index < nodes.length; index += 1) {
    const id = nodes[index]?.id;
    if (typeof id !== 'string') continue;
    if (!idToIndices.has(id)) idToIndices.set(id, []);
    idToIndices.get(id).push(index);
  }
  for (const [id, indices] of idToIndices) {
    if (indices.length > 1) {
      issues.push(`Duplicate node ID ${quoted(id)} appears at indices ${indices.join(', ')}`);
    }
  }
  const nodeIds = new Set(idToIndices.keys());

  for (let index = 0; index < edges.length; index += 1) {
    const edge = edges[index];
    const label = `Edge at index ${index}`;
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
      issues.push(`${label} must be an object`);
      continue;
    }
    if (typeof edge.source !== 'string' || edge.source.trim() === '') {
      issues.push(`${label} has missing or invalid 'source'`);
    }
    if (typeof edge.target !== 'string' || edge.target.trim() === '') {
      issues.push(`${label} has missing or invalid 'target'`);
    }
    if (typeof edge.type !== 'string' || !validEdgeTypes.has(edge.type)) {
      issues.push(`${label} has invalid edge type ${quoted(edge.type)}`);
    }
    if (typeof edge.direction !== 'string' || !validDirections.has(edge.direction)) {
      issues.push(`${label} has invalid direction ${quoted(edge.direction)}`);
    }
    if (typeof edge.weight !== 'number' || !Number.isFinite(edge.weight) || edge.weight < 0 || edge.weight > 1) {
      issues.push(`${label} has invalid weight ${quoted(edge.weight)}; expected a finite number from 0.0 through 1.0`);
    }
    if (typeof edge.source === 'string' && edge.source.trim() !== '' && !nodeIds.has(edge.source)) {
      issues.push(`${label} references non-existent source node ${quoted(edge.source)}`);
    }
    if (typeof edge.target === 'string' && edge.target.trim() !== '' && !nodeIds.has(edge.target)) {
      issues.push(`${label} references non-existent target node ${quoted(edge.target)}`);
    }
  }

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const layer = layers[layerIndex];
    const layerName = layer && typeof layer.name === 'string' && layer.name.trim() !== ''
      ? layer.name
      : `index ${layerIndex}`;
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
      issues.push(`Layer at index ${layerIndex} must be an object`);
      continue;
    }
    if (!Array.isArray(layer.nodeIds) || layer.nodeIds.length === 0) {
      issues.push(`Layer ${quoted(layerName)} has an empty or missing 'nodeIds' array`);
      continue;
    }
    for (let entryIndex = 0; entryIndex < layer.nodeIds.length; entryIndex += 1) {
      const id = layer.nodeIds[entryIndex];
      if (typeof id !== 'string' || !nodeIds.has(id)) {
        issues.push(`Layer ${quoted(layerName)} nodeIds[${entryIndex}] references non-existent node ${quoted(id)}`);
      }
    }
  }

  for (let stepIndex = 0; stepIndex < tourSteps.length; stepIndex += 1) {
    const step = tourSteps[stepIndex];
    const stepName = step && typeof step.title === 'string' && step.title.trim() !== ''
      ? step.title
      : `index ${stepIndex}`;
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      warnings.push(`Tour step at index ${stepIndex} must be an object`);
      continue;
    }
    if (!Array.isArray(step.nodeIds) || step.nodeIds.length === 0) {
      warnings.push(`Tour step ${quoted(stepName)} has an empty or missing 'nodeIds' array`);
    } else {
      for (let entryIndex = 0; entryIndex < step.nodeIds.length; entryIndex += 1) {
        const id = step.nodeIds[entryIndex];
        if (typeof id !== 'string' || !nodeIds.has(id)) {
          issues.push(`Tour step ${quoted(stepName)} nodeIds[${entryIndex}] references non-existent node ${quoted(id)}`);
        }
      }
    }
  }

  const isDomainGraph = nodes.some((node) => ['domain', 'flow', 'step'].includes(node?.type));
  if (nodes.length === 0) issues.push('Graph has zero nodes');
  if (edges.length === 0) issues.push('Graph has zero edges');
  if (layers.length === 0) {
    (isDomainGraph ? warnings : issues).push('Graph has zero layers');
  }
  if (tourSteps.length === 0) {
    (isDomainGraph ? warnings : issues).push('Graph has zero tour steps');
  }

  const fileLevelTypes = new Set([
    'file', 'config', 'document', 'service', 'pipeline', 'table', 'schema',
    'resource', 'endpoint'
  ]);
  if (!(isDomainGraph && layers.length === 0)) {
    const layerMembership = new Map();
    for (const layer of layers) {
      if (!layer || !Array.isArray(layer.nodeIds)) continue;
      for (const id of new Set(layer.nodeIds.filter((value) => typeof value === 'string'))) {
        layerMembership.set(id, (layerMembership.get(id) || 0) + 1);
      }
    }
    for (const node of nodes) {
      if (!fileLevelTypes.has(node?.type) || typeof node.id !== 'string') continue;
      const count = layerMembership.get(node.id) || 0;
      if (count === 0) {
        issues.push(`File-level node ${quoted(node.id)} is missing from all layers`);
      } else if (count > 1) {
        issues.push(`File-level node ${quoted(node.id)} appears in ${count} layers; expected exactly one`);
      }
    }
  }

  const ordersToIndices = new Map();
  for (let index = 0; index < tourSteps.length; index += 1) {
    const order = tourSteps[index]?.order;
    if (!Number.isInteger(order)) {
      warnings.push(`Tour step at index ${index} has invalid order ${quoted(order)}; expected integer ${index + 1}`);
    } else {
      if (!ordersToIndices.has(order)) ordersToIndices.set(order, []);
      ordersToIndices.get(order).push(index);
      if (order !== index + 1) {
        warnings.push(`Tour step at index ${index} has order ${order}; expected sequential order ${index + 1}`);
      }
    }
  }
  for (const [order, indices] of ordersToIndices) {
    if (indices.length > 1) {
      warnings.push(`Tour order ${order} is duplicated at step indices ${indices.join(', ')}`);
    }
  }
  if (tourSteps.length < 5 || tourSteps.length > 15) {
    warnings.push(`Tour has ${tourSteps.length} steps; expected between 5 and 15`);
  }

  const connectedNodeIds = new Set();
  for (let index = 0; index < edges.length; index += 1) {
    const edge = edges[index];
    if (!edge || typeof edge !== 'object') continue;
    if (typeof edge.source === 'string') connectedNodeIds.add(edge.source);
    if (typeof edge.target === 'string') connectedNodeIds.add(edge.target);
    if (typeof edge.source === 'string' && edge.source === edge.target) {
      warnings.push(`Edge at index ${index} is self-referencing on node ${quoted(edge.source)}`);
    }
  }
  for (const node of nodes) {
    if (typeof node?.id === 'string' && !connectedNodeIds.has(node.id)) {
      warnings.push(`Node ${quoted(node.id)} is orphaned with no incoming or outgoing edges`);
    }
    if (typeof node?.summary === 'string' && node.summary.trim() !== '') {
      const summary = node.summary.trim().replace(/[.!?]+$/, '').toLowerCase();
      const candidates = new Set();
      if (typeof node.name === 'string') candidates.add(node.name.trim().replace(/[.!?]+$/, '').toLowerCase());
      if (typeof node.filePath === 'string') {
        candidates.add(path.basename(node.filePath).trim().replace(/[.!?]+$/, '').toLowerCase());
      }
      if (candidates.has(summary)) {
        warnings.push(`Node ${quoted(node.id)} has a generic summary that only restates its filename or name`);
      }
    }
  }

  const expectedNonCodeEdges = {
    document: ['documents'],
    service: ['deploys', 'depends_on'],
    pipeline: ['triggers'],
    table: ['migrates', 'defines_schema'],
    schema: ['defines_schema'],
    domain: ['contains_flow'],
    flow: ['flow_step']
  };
  for (const node of nodes) {
    const expectedTypes = expectedNonCodeEdges[node?.type];
    if (!expectedTypes || typeof node.id !== 'string') continue;
    const hasExpectedEdge = edges.some((edge) =>
      edge && expectedTypes.includes(edge.type) && (edge.source === node.id || edge.target === node.id)
    );
    if (!hasExpectedEdge) {
      warnings.push(`${node.type[0].toUpperCase() + node.type.slice(1)} node ${quoted(node.id)} has no ${expectedTypes.map(quoted).join(' or ')} edge`);
    }
  }

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node || typeof node.type !== 'string' || typeof node.id !== 'string') continue;
    const expectedPrefix = `${node.type}:`;
    if (validNodeTypes.has(node.type) && !node.id.startsWith(expectedPrefix)) {
      warnings.push(`Node at index ${index} has type ${quoted(node.type)} but ID ${quoted(node.id)} does not start with ${quoted(expectedPrefix)}`);
    }
  }

  const result = {
    scriptCompleted: true,
    issues,
    warnings,
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      totalLayers: layers.length,
      tourSteps: tourSteps.length,
      nodeTypes: countBy(nodes, 'type'),
      edgeTypes: countBy(edges, 'type')
    }
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
}
