#!/usr/bin/env node

import fs from 'node:fs';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) fail('usage: ua-tour-analyze.js <input.json> <output.json>');

try {
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const nodes = Array.isArray(input.nodes) ? input.nodes : [];
  const edges = Array.isArray(input.edges) ? input.edges : [];
  const layers = Array.isArray(input.layers) ? input.layers : [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const fanIn = new Map(nodes.map((node) => [node.id, 0]));
  const fanOut = new Map(nodes.map((node) => [node.id, 0]));

  for (const edge of edges) {
    if (fanOut.has(edge.source)) fanOut.set(edge.source, fanOut.get(edge.source) + 1);
    if (fanIn.has(edge.target)) fanIn.set(edge.target, fanIn.get(edge.target) + 1);
  }

  const rank = (counts, field) => [...counts.entries()]
    .map(([id, count]) => ({ id, [field]: count, name: byId.get(id)?.name ?? id }))
    .sort((a, b) => b[field] - a[field] || a.id.localeCompare(b.id));

  const fanInAll = rank(fanIn, 'fanIn');
  const fanOutAll = rank(fanOut, 'fanOut');
  const fanOutCutoff = Math.max(1, Math.ceil(nodes.length * 0.1));
  const highFanOutIds = new Set(fanOutAll.slice(0, fanOutCutoff).map((item) => item.id));
  const lowFanInCutoff = Math.ceil(nodes.length * 0.25);
  const lowFanInIds = new Set([...fanInAll].reverse().slice(0, lowFanInCutoff).map((item) => item.id));
  const codeEntryNames = new Set([
    'index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js', 'server.ts', 'server.js',
    'mod.rs', 'main.go', 'main.py', 'main.rs', 'manage.py', 'app.py', 'wsgi.py', 'asgi.py',
    'run.py', '__main__.py', 'Application.java', 'Main.java', 'Program.cs', 'config.ru',
    'index.php', 'App.swift', 'Application.kt', 'main.cpp', 'main.c', 'main.tsx', 'App.tsx',
  ]);

  const entryPointCandidates = nodes.map((node) => {
    const path = node.filePath ?? '';
    const name = node.name ?? path.split('/').pop() ?? '';
    const depth = path.split('/').filter(Boolean).length;
    const isReadme = /^README\.md$/i.test(path);
    const isRootMarkdown = depth === 1 && /\.md$/i.test(path);
    let score = 0;
    if (node.type === 'document' || /\.md$/i.test(path)) {
      if (isReadme) score += 5;
      else if (isRootMarkdown) score += 2;
    } else if (node.type === 'file') {
      if (codeEntryNames.has(name)) score += 3;
      if (depth <= 2) score += 1;
      if (highFanOutIds.has(node.id)) score += 1;
      if (lowFanInIds.has(node.id)) score += 1;
    }
    return { id: node.id, score, name, summary: node.summary ?? '', type: node.type, filePath: path };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 5);

  const topCodeEntry = entryPointCandidates.find((item) => item.type === 'file' && !/\.md$/i.test(item.filePath))
    ?? nodes.find((node) => node.filePath === input.entryPoint)
    ?? nodes.find((node) => node.type === 'file');
  const startNode = topCodeEntry?.id;
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if ((edge.type === 'imports' || edge.type === 'calls') && adjacency.has(edge.source) && byId.has(edge.target)) {
      adjacency.get(edge.source).push(edge.target);
    }
  }
  for (const targets of adjacency.values()) targets.sort();
  const order = [];
  const depthMap = {};
  const byDepth = {};
  if (startNode) {
    const queue = [startNode];
    depthMap[startNode] = 0;
    while (queue.length > 0) {
      const current = queue.shift();
      const depth = depthMap[current];
      order.push(current);
      (byDepth[depth] ??= []).push(current);
      for (const target of adjacency.get(current) ?? []) {
        if (depthMap[target] !== undefined) continue;
        depthMap[target] = depth + 1;
        queue.push(target);
      }
    }
  }

  const asInventory = (node) => ({ id: node.id, name: node.name, type: node.type, summary: node.summary ?? '' });
  const nonCodeFiles = {
    documentation: nodes.filter((node) => node.type === 'document' || /\.md$/i.test(node.filePath ?? '')).map(asInventory),
    infrastructure: nodes.filter((node) => ['service', 'pipeline', 'resource'].includes(node.type)).map(asInventory),
    data: nodes.filter((node) => ['table', 'schema', 'endpoint'].includes(node.type)).map(asInventory),
    config: nodes.filter((node) => node.type === 'config').map(asInventory),
  };

  const relationPairs = new Map();
  for (const edge of edges) {
    if (edge.type !== 'imports' && edge.type !== 'calls') continue;
    relationPairs.set(`${edge.source}\0${edge.target}\0${edge.type}`, true);
  }
  const seedPairs = [];
  for (const edge of edges) {
    if (edge.type !== 'imports' && edge.type !== 'calls') continue;
    if (!relationPairs.has(`${edge.target}\0${edge.source}\0${edge.type}`)) continue;
    if (edge.source.localeCompare(edge.target) >= 0) continue;
    seedPairs.push([edge.source, edge.target]);
  }
  const undirectedCounts = new Map();
  for (const edge of edges) {
    const key = [edge.source, edge.target].sort().join('\0');
    undirectedCounts.set(key, (undirectedCounts.get(key) ?? 0) + 1);
  }
  const clusters = [];
  for (const pair of seedPairs) {
    const cluster = new Set(pair);
    let changed = true;
    while (changed && cluster.size < 5) {
      changed = false;
      for (const candidate of nodes) {
        if (cluster.has(candidate.id)) continue;
        const connected = [...cluster].filter((member) => undirectedCounts.has([candidate.id, member].sort().join('\0'))).length;
        if (connected >= 2) {
          cluster.add(candidate.id);
          changed = true;
          if (cluster.size >= 5) break;
        }
      }
    }
    const ids = [...cluster].sort();
    if (clusters.some((item) => ids.every((id) => item.nodes.includes(id)))) continue;
    let edgeCount = 0;
    for (const source of ids) for (const target of ids) {
      if (source !== target) edgeCount += edges.filter((edge) => edge.source === source && edge.target === target).length;
    }
    clusters.push({ nodes: ids, edgeCount });
  }
  clusters.sort((a, b) => b.edgeCount - a.edgeCount || b.nodes.length - a.nodes.length);

  const nodeSummaryIndex = Object.fromEntries(nodes.map((node) => [node.id, {
    name: node.name,
    type: node.type,
    summary: node.summary ?? '',
    filePath: node.filePath ?? '',
  }]));
  const results = {
    scriptCompleted: true,
    entryPointCandidates,
    fanInRanking: fanInAll.slice(0, 20),
    fanOutRanking: fanOutAll.slice(0, 20),
    bfsTraversal: { startNode, order, depthMap, byDepth },
    nonCodeFiles,
    clusters: clusters.slice(0, 10),
    layers: { count: layers.length, list: layers.map(({ id, name, description }) => ({ id, name, description })) },
    nodeSummaryIndex,
    totalNodes: nodes.length,
    totalEdges: edges.length,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`);
} catch (error) {
  fail(error?.stack ?? String(error));
}
