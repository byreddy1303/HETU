#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  fail("Usage: node ua-tour-analyze.js <input.json> <output.json>");
}

try {
  const graph = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const layers = Array.isArray(graph.layers) ? graph.layers : [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  if (nodeById.size !== nodes.length) {
    fail("Input graph contains duplicate node IDs.");
  }

  const incoming = new Map(nodes.map((node) => [node.id, new Set()]));
  const outgoing = new Map(nodes.map((node) => [node.id, new Set()]));
  const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));

  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    incoming.get(edge.target).add(edge.source);
    outgoing.get(edge.source).add(edge.target);
    adjacency.get(edge.source).add(edge.target);
    adjacency.get(edge.target).add(edge.source);
  }

  const rank = (direction, key) => nodes
    .map((node) => ({ id: node.id, [key]: direction.get(node.id).size, name: node.name }))
    .sort((a, b) => b[key] - a[key] || a.id.localeCompare(b.id))
    .slice(0, 20);

  const fanInRanking = rank(incoming, "fanIn");
  const fanOutRanking = rank(outgoing, "fanOut");
  const fanOutValues = nodes.map((node) => outgoing.get(node.id).size).sort((a, b) => a - b);
  const fanInValues = nodes.map((node) => incoming.get(node.id).size).sort((a, b) => a - b);
  const percentileValue = (values, fraction) => values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))] ?? 0;
  const highFanOutThreshold = percentileValue(fanOutValues, 0.9);
  const lowFanInThreshold = percentileValue(fanInValues, 0.25);

  const entryNames = new Set([
    "index.ts", "index.js", "index.tsx", "index.jsx", "main.ts", "main.js", "main.tsx", "main.jsx",
    "app.ts", "app.js", "app.tsx", "app.jsx", "server.ts", "server.js", "mod.rs", "main.go", "main.py",
    "main.rs", "manage.py", "app.py", "wsgi.py", "asgi.py", "run.py", "__main__.py", "Application.java",
    "Main.java", "Program.cs", "config.ru", "index.php", "App.swift", "Application.kt", "main.cpp", "main.c",
  ]);

  const pathDepth = (node) => {
    const candidate = node.filePath || node.name || "";
    return candidate.split(/[\\/]/).filter(Boolean).length;
  };
  const isDocumentation = (node) => node.type === "document";
  const codeTypes = new Set(["file"]);

  const entryPointCandidates = nodes
    .map((node) => {
      let score = 0;
      const filename = path.basename(node.filePath || node.name || "");
      if (codeTypes.has(node.type)) {
        if (entryNames.has(filename)) score += 3;
        if (pathDepth(node) <= 2) score += 1;
        if (outgoing.get(node.id).size >= highFanOutThreshold) score += 1;
        if (incoming.get(node.id).size <= lowFanInThreshold) score += 1;
      } else if (isDocumentation(node)) {
        if ((node.filePath || node.name) === "README.md") score += 5;
        else if (filename.endsWith(".md") && pathDepth(node) === 1) score += 2;
      }
      return { id: node.id, score, name: node.name, summary: node.summary || "" };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 5);

  const explicitMain = nodeById.has("file:src/main.tsx") ? "file:src/main.tsx" : null;
  const topCodeCandidate = explicitMain || entryPointCandidates.find((candidate) => nodeById.get(candidate.id)?.type === "file")?.id;
  const traversalTypes = new Set(["imports", "calls"]);
  const forward = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (traversalTypes.has(edge.type) && nodeById.has(edge.source) && nodeById.has(edge.target)) {
      forward.get(edge.source).push(edge.target);
    }
  }
  for (const targets of forward.values()) targets.sort();

  const bfsOrder = [];
  const depthMap = {};
  const byDepth = {};
  if (topCodeCandidate) {
    const queue = [topCodeCandidate];
    depthMap[topCodeCandidate] = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      bfsOrder.push(current);
      const depth = depthMap[current];
      (byDepth[depth] ||= []).push(current);
      for (const target of forward.get(current) || []) {
        if (Object.hasOwn(depthMap, target)) continue;
        depthMap[target] = depth + 1;
        queue.push(target);
      }
    }
  }

  const inventoryItem = (node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    summary: node.summary || "",
  });
  const sortedInventory = (predicate) => nodes.filter(predicate).sort((a, b) => a.id.localeCompare(b.id)).map(inventoryItem);
  const nonCodeFiles = {
    documentation: sortedInventory((node) => node.type === "document"),
    infrastructure: sortedInventory((node) => ["service", "pipeline", "resource"].includes(node.type)),
    data: sortedInventory((node) => ["table", "schema", "endpoint"].includes(node.type)),
    config: sortedInventory((node) => node.type === "config"),
  };

  const relationships = new Map();
  for (const edge of edges) {
    if (!["imports", "calls"].includes(edge.type)) continue;
    relationships.set(`${edge.type}\u0000${edge.source}\u0000${edge.target}`, true);
  }
  const reciprocalPairs = [];
  for (const edge of edges) {
    if (!["imports", "calls"].includes(edge.type)) continue;
    if (!relationships.has(`${edge.type}\u0000${edge.target}\u0000${edge.source}`)) continue;
    const pair = [edge.source, edge.target].sort();
    if (pair[0] === edge.source) reciprocalPairs.push(pair);
  }
  reciprocalPairs.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

  const pairKeySet = new Set();
  const seedClusters = [];
  for (const pair of reciprocalPairs) {
    const key = pair.join("\u0000");
    if (pairKeySet.has(key)) continue;
    pairKeySet.add(key);
    seedClusters.push(new Set(pair));
  }
  for (const cluster of seedClusters) {
    let expanded = true;
    while (expanded && cluster.size < 5) {
      expanded = false;
      const candidates = nodes
        .filter((node) => !cluster.has(node.id))
        .map((node) => ({
          id: node.id,
          connections: [...cluster].filter((member) => adjacency.get(node.id).has(member)).length,
        }))
        .filter((candidate) => candidate.connections >= 2)
        .sort((a, b) => b.connections - a.connections || a.id.localeCompare(b.id));
      if (candidates.length > 0) {
        cluster.add(candidates[0].id);
        expanded = true;
      }
    }
  }

  const uniqueClusters = new Map();
  for (const cluster of seedClusters) {
    const members = [...cluster].sort();
    uniqueClusters.set(members.join("\u0000"), members);
  }
  const internalEdgeCount = (members) => {
    const memberSet = new Set(members);
    return edges.filter((edge) => memberSet.has(edge.source) && memberSet.has(edge.target)).length;
  };
  const clusters = [...uniqueClusters.values()]
    .map((members) => ({ nodes: members, edgeCount: internalEdgeCount(members) }))
    .sort((a, b) => b.edgeCount - a.edgeCount || b.nodes.length - a.nodes.length || a.nodes.join("\u0000").localeCompare(b.nodes.join("\u0000")))
    .slice(0, 10);

  const nodeSummaryIndex = Object.fromEntries(nodes
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node) => [node.id, { name: node.name, type: node.type, summary: node.summary || "" }]));

  const result = {
    scriptCompleted: true,
    entryPointCandidates,
    fanInRanking,
    fanOutRanking,
    bfsTraversal: { startNode: topCodeCandidate || null, order: bfsOrder, depthMap, byDepth },
    nonCodeFiles,
    clusters,
    layers: {
      count: layers.length,
      list: layers.map(({ id, name, description }) => ({ id, name, description })),
    },
    nodeSummaryIndex,
    totalNodes: nodes.length,
    totalEdges: edges.length,
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  fail(error instanceof Error ? error.stack || error.message : String(error));
}
