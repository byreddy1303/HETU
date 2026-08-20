import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node ua-tour-analyze.js <input-json> <output-json>');
  process.exit(1);
}

try {
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(input.nodes) || !Array.isArray(input.edges) || !Array.isArray(input.layers)) {
    throw new Error('Input must contain nodes, edges, and layers arrays');
  }

  const nodes = input.nodes;
  const edges = input.edges;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  if (nodeById.size !== nodes.length) throw new Error('Input contains duplicate node IDs');

  const incomingSources = new Map(nodes.map((node) => [node.id, new Set()]));
  const outgoingTargets = new Map(nodes.map((node) => [node.id, new Set()]));
  for (const edge of edges) {
    if (incomingSources.has(edge.target) && edge.source !== edge.target) {
      incomingSources.get(edge.target).add(edge.source);
    }
    if (outgoingTargets.has(edge.source) && edge.source !== edge.target) {
      outgoingTargets.get(edge.source).add(edge.target);
    }
  }

  const fanInOf = (id) => incomingSources.get(id)?.size ?? 0;
  const fanOutOf = (id) => outgoingTargets.get(id)?.size ?? 0;
  const fanInRanking = nodes
    .map((node) => ({ id: node.id, fanIn: fanInOf(node.id), name: node.name }))
    .sort((a, b) => b.fanIn - a.fanIn || a.id.localeCompare(b.id))
    .slice(0, 20);
  const fanOutRanking = nodes
    .map((node) => ({ id: node.id, fanOut: fanOutOf(node.id), name: node.name }))
    .sort((a, b) => b.fanOut - a.fanOut || a.id.localeCompare(b.id))
    .slice(0, 20);

  const topCount = Math.max(1, Math.ceil(nodes.length * 0.10));
  const bottomCount = Math.max(1, Math.ceil(nodes.length * 0.25));
  const fanOutValues = nodes.map((node) => fanOutOf(node.id)).sort((a, b) => b - a);
  const fanInValues = nodes.map((node) => fanInOf(node.id)).sort((a, b) => a - b);
  const fanOutThreshold = fanOutValues[topCount - 1];
  const fanInThreshold = fanInValues[bottomCount - 1];
  const fanOutTopIds = new Set(nodes.filter((node) => fanOutOf(node.id) >= fanOutThreshold).map((node) => node.id));
  const fanInBottomIds = new Set(nodes.filter((node) => fanInOf(node.id) <= fanInThreshold).map((node) => node.id));

  const codeEntryNames = new Set([
    'index.ts', 'index.tsx', 'index.js', 'index.jsx', 'main.ts', 'main.tsx',
    'main.js', 'main.jsx', 'app.ts', 'app.tsx', 'app.js', 'app.jsx', 'server.ts',
    'server.js', 'mod.rs', 'main.go', 'main.py', 'main.rs', 'manage.py', 'app.py',
    'wsgi.py', 'asgi.py', 'run.py', '__main__.py', 'application.java', 'main.java',
    'program.cs', 'config.ru', 'index.php', 'app.swift', 'application.kt', 'main.cpp',
    'main.c'
  ]);
  const entryPointCandidates = nodes
    .map((node) => {
      const filePath = node.filePath ?? '';
      const basename = path.posix.basename(filePath).toLowerCase();
      const depth = filePath.split('/').filter(Boolean).length;
      let score = 0;
      if (node.type === 'file') {
        if (codeEntryNames.has(basename)) score += 3;
        if (depth <= 2) score += 1;
        if (fanOutTopIds.has(node.id)) score += 1;
        if (fanInBottomIds.has(node.id)) score += 1;
      } else if (node.type === 'document') {
        if (filePath === 'README.md') score += 5;
        else if (depth === 1 && basename.endsWith('.md')) score += 2;
      }
      const entryPriority = filePath === 'README.md'
        ? 3
        : /^main\./.test(basename)
          ? 2
          : /^app\./.test(basename)
            ? 1
            : 0;
      return {
        id: node.id,
        score,
        name: node.name,
        summary: node.summary,
        fanIn: fanInOf(node.id),
        fanOut: fanOutOf(node.id),
        entryPriority
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || b.entryPriority - a.entryPriority || b.fanOut - a.fanOut || a.id.localeCompare(b.id))
    .slice(0, 5);

  const codeStart = entryPointCandidates.find((candidate) => nodeById.get(candidate.id)?.type === 'file');
  const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));
  for (const edge of edges) {
    if ((edge.type === 'imports' || edge.type === 'calls') && edge.direction === 'forward'
      && nodeById.has(edge.source) && nodeById.has(edge.target)) {
      adjacency.get(edge.source).add(edge.target);
    }
  }

  const order = [];
  const depthMap = {};
  if (codeStart) {
    const queue = [codeStart.id];
    depthMap[codeStart.id] = 0;
    while (queue.length > 0) {
      const current = queue.shift();
      order.push(current);
      const neighbors = [...adjacency.get(current)]
        .sort((a, b) => fanInOf(b) - fanInOf(a) || a.localeCompare(b));
      for (const target of neighbors) {
        if (depthMap[target] !== undefined) continue;
        depthMap[target] = depthMap[current] + 1;
        queue.push(target);
      }
    }
  }
  const byDepth = {};
  for (const id of order) {
    const depth = String(depthMap[id]);
    (byDepth[depth] ??= []).push(id);
  }

  const inventoryItem = (node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    summary: node.summary
  });
  const nonCodeFiles = {
    documentation: nodes.filter((node) => node.type === 'document').map(inventoryItem),
    infrastructure: nodes.filter((node) => ['service', 'pipeline', 'resource'].includes(node.type)).map(inventoryItem),
    data: nodes.filter((node) => ['table', 'schema', 'endpoint'].includes(node.type)).map(inventoryItem),
    config: nodes.filter((node) => node.type === 'config').map(inventoryItem)
  };

  const relationshipEdges = edges.filter((edge) =>
    (edge.type === 'imports' || edge.type === 'calls')
    && nodeById.has(edge.source)
    && nodeById.has(edge.target)
  );
  const directedPairs = new Set(relationshipEdges.map((edge) => `${edge.source}\u0000${edge.target}`));
  const undirectedNeighbors = new Map(nodes.map((node) => [node.id, new Set()]));
  for (const edge of relationshipEdges) {
    undirectedNeighbors.get(edge.source).add(edge.target);
    undirectedNeighbors.get(edge.target).add(edge.source);
  }
  const seeds = [];
  for (const edge of relationshipEdges) {
    if (!directedPairs.has(`${edge.target}\u0000${edge.source}`)) continue;
    const pair = [edge.source, edge.target].sort();
    const key = pair.join('\u0000');
    if (!seeds.some((seed) => seed.key === key)) seeds.push({ key, nodes: pair });
  }
  const clusterMap = new Map();
  for (const seed of seeds) {
    const cluster = new Set(seed.nodes);
    let changed = true;
    while (changed && cluster.size < 5) {
      changed = false;
      const candidates = nodes
        .filter((node) => !cluster.has(node.id))
        .map((node) => ({
          id: node.id,
          links: [...cluster].filter((member) => undirectedNeighbors.get(node.id).has(member)).length
        }))
        .filter((candidate) => candidate.links >= 2)
        .sort((a, b) => b.links - a.links || a.id.localeCompare(b.id));
      if (candidates.length > 0) {
        cluster.add(candidates[0].id);
        changed = true;
      }
    }
    const clusterNodes = [...cluster].sort();
    const clusterSet = new Set(clusterNodes);
    const edgeCount = relationshipEdges.filter((edge) => clusterSet.has(edge.source) && clusterSet.has(edge.target)).length;
    const key = clusterNodes.join('\u0000');
    const previous = clusterMap.get(key);
    if (!previous || edgeCount > previous.edgeCount) clusterMap.set(key, { nodes: clusterNodes, edgeCount });
  }
  const clusters = [...clusterMap.values()]
    .sort((a, b) => b.edgeCount - a.edgeCount || b.nodes.length - a.nodes.length || a.nodes[0].localeCompare(b.nodes[0]))
    .slice(0, 10);

  const nodeSummaryIndex = Object.fromEntries(nodes.map((node) => [node.id, {
    name: node.name,
    type: node.type,
    summary: node.summary
  }]));

  const output = {
    scriptCompleted: true,
    entryPointCandidates,
    fanInRanking,
    fanOutRanking,
    bfsTraversal: {
      startNode: codeStart?.id ?? null,
      order,
      depthMap,
      byDepth
    },
    nonCodeFiles,
    clusters,
    layers: {
      count: input.layers.length,
      list: input.layers.map(({ id, name, description }) => ({ id, name, description }))
    },
    nodeSummaryIndex,
    totalNodes: nodes.length,
    totalEdges: edges.length
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({
    scriptCompleted: true,
    totalNodes: output.totalNodes,
    totalEdges: output.totalEdges,
    bfsStart: output.bfsTraversal.startNode,
    bfsReached: output.bfsTraversal.order.length,
    clusters: output.clusters.length
  }));
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
}
