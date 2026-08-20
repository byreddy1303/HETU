#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) fail('Usage: ua-arch-analyze.mjs <input.json> <output.json>');

try {
  const input = JSON.parse(readFileSync(inputPath, 'utf8'));
  const { fileNodes, importEdges, allEdges } = input;
  if (!Array.isArray(fileNodes) || !Array.isArray(importEdges) || !Array.isArray(allEdges)) {
    throw new Error('Input must contain fileNodes, importEdges, and allEdges arrays');
  }

  const nodeById = new Map(fileNodes.map((node) => [node.id, node]));
  if (nodeById.size !== fileNodes.length) throw new Error('Duplicate file node IDs in input');
  for (const edge of [...importEdges, ...allEdges]) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) {
      throw new Error(`Edge endpoint is not file-level: ${edge.source} -> ${edge.target}`);
    }
  }

  const splitPath = (filePath) => filePath.split('/').filter(Boolean);
  const pathParts = fileNodes.map((node) => splitPath(node.filePath));
  const common = [];
  if (pathParts.length > 0) {
    for (let index = 0; ; index += 1) {
      const segment = pathParts[0][index];
      if (!segment || !pathParts.every((parts) => parts[index] === segment)) break;
      common.push(segment);
    }
  }
  const commonPrefix = common.length > 0 ? `${common.join('/')}/` : '';
  const flat = pathParts.every((parts) => parts.length - common.length <= 1);

  function flatPattern(node) {
    const file = path.basename(node.filePath).toLowerCase();
    if (/\.(?:test|spec)\./.test(file)) return 'test';
    if (/\.config\./.test(file) || node.type === 'config') return 'config';
    const extension = path.extname(file).replace(/^\./, '');
    return extension || 'other';
  }

  function groupFor(node) {
    const parts = splitPath(node.filePath).slice(common.length);
    if (flat) return flatPattern(node);
    return parts.length > 1 ? parts[0] : 'root';
  }

  function nestedGroupFor(node) {
    const parts = splitPath(node.filePath);
    if (parts.length <= 1) return 'root';
    if (parts[0] === 'src' && parts.length > 2) return `${parts[0]}/${parts[1]}`;
    if (parts[0] === 'supabase' && parts.length > 2) return `${parts[0]}/${parts[1]}`;
    if (parts[0] === 'android' && parts.length > 2) return `${parts[0]}/${parts[1]}`;
    if (parts[0] === 'public' && parts.length > 2) return `${parts[0]}/${parts[1]}`;
    return parts[0];
  }

  const directoryGroups = {};
  const nestedDirectoryGroups = {};
  const groupById = new Map();
  const nestedGroupById = new Map();
  for (const node of fileNodes) {
    const group = groupFor(node);
    const nestedGroup = nestedGroupFor(node);
    (directoryGroups[group] ??= []).push(node.id);
    (nestedDirectoryGroups[nestedGroup] ??= []).push(node.id);
    groupById.set(node.id, group);
    nestedGroupById.set(node.id, nestedGroup);
  }
  for (const groups of [directoryGroups, nestedDirectoryGroups]) {
    for (const ids of Object.values(groups)) ids.sort();
  }

  const nodeTypeGroups = {};
  for (const node of fileNodes) (nodeTypeGroups[node.type] ??= []).push(node.id);
  for (const ids of Object.values(nodeTypeGroups)) ids.sort();

  const fileFanIn = Object.fromEntries(fileNodes.map((node) => [node.id, 0]));
  const fileFanOut = Object.fromEntries(fileNodes.map((node) => [node.id, 0]));
  const importAdjacency = Object.fromEntries(fileNodes.map((node) => [node.id, []]));
  const groupImportsFrom = Object.fromEntries(Object.keys(directoryGroups).map((group) => [group, new Set()]));
  const groupImportedBy = Object.fromEntries(Object.keys(directoryGroups).map((group) => [group, new Set()]));
  const interGroupCounter = new Map();

  for (const edge of importEdges) {
    fileFanOut[edge.source] += 1;
    fileFanIn[edge.target] += 1;
    importAdjacency[edge.source].push(edge.target);
    const from = groupById.get(edge.source);
    const to = groupById.get(edge.target);
    if (from !== to) {
      groupImportsFrom[from].add(to);
      groupImportedBy[to].add(from);
      const key = `${from}\u0000${to}`;
      interGroupCounter.set(key, (interGroupCounter.get(key) ?? 0) + 1);
    }
  }
  for (const targets of Object.values(importAdjacency)) targets.sort();

  const directoryDependencies = {};
  for (const group of Object.keys(directoryGroups)) {
    directoryDependencies[group] = {
      importsFrom: [...groupImportsFrom[group]].sort(),
      importedBy: [...groupImportedBy[group]].sort()
    };
  }

  const crossCategoryCounter = new Map();
  const nonCodeConnections = [];
  for (const edge of allEdges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (source.type !== target.type) {
      const key = `${source.type}\u0000${target.type}\u0000${edge.type}`;
      crossCategoryCounter.set(key, (crossCategoryCounter.get(key) ?? 0) + 1);
    }
    if (source.type !== 'file' || target.type !== 'file') {
      nonCodeConnections.push({
        source: edge.source,
        target: edge.target,
        fromType: source.type,
        toType: target.type,
        edgeType: edge.type
      });
    }
  }

  const crossCategoryEdges = [...crossCategoryCounter.entries()]
    .map(([key, count]) => {
      const [fromType, toType, edgeType] = key.split('\u0000');
      return { fromType, toType, edgeType, count };
    })
    .sort((a, b) => a.fromType.localeCompare(b.fromType) || a.toType.localeCompare(b.toType) || a.edgeType.localeCompare(b.edgeType));

  const interGroupImports = [...interGroupCounter.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split('\u0000');
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  const intraGroupDensity = {};
  for (const group of Object.keys(directoryGroups)) {
    let internalEdges = 0;
    let totalEdges = 0;
    for (const edge of importEdges) {
      const from = groupById.get(edge.source);
      const to = groupById.get(edge.target);
      if (from === group || to === group) totalEdges += 1;
      if (from === group && to === group) internalEdges += 1;
    }
    intraGroupDensity[group] = {
      internalEdges,
      totalEdges,
      density: totalEdges === 0 ? 0 : Number((internalEdges / totalEdges).toFixed(4))
    };
  }

  const nestedInterGroupCounter = new Map();
  for (const edge of importEdges) {
    const from = nestedGroupById.get(edge.source);
    const to = nestedGroupById.get(edge.target);
    if (from === to) continue;
    const key = `${from}\u0000${to}`;
    nestedInterGroupCounter.set(key, (nestedInterGroupCounter.get(key) ?? 0) + 1);
  }
  const nestedInterGroupImports = [...nestedInterGroupCounter.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split('\u0000');
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  const nestedIntraGroupDensity = {};
  for (const group of Object.keys(nestedDirectoryGroups)) {
    let internalEdges = 0;
    let totalEdges = 0;
    for (const edge of importEdges) {
      const from = nestedGroupById.get(edge.source);
      const to = nestedGroupById.get(edge.target);
      if (from === group || to === group) totalEdges += 1;
      if (from === group && to === group) internalEdges += 1;
    }
    nestedIntraGroupDensity[group] = {
      internalEdges,
      totalEdges,
      density: totalEdges === 0 ? 0 : Number((internalEdges / totalEdges).toFixed(4))
    };
  }

  const directoryPatterns = [
    [/^(routes?|api|controllers?|endpoints?|handlers?|serializers?|routers?|blueprints?)$/i, 'api'],
    [/^(services?|core|lib|domain|logic|internal|signals?|mailers?|jobs?|channels?|composables?)$/i, 'service'],
    [/^(models?|db|data|persistence|repositories|entities|entity|migrations?|sql|database|schema)$/i, 'data'],
    [/^(components?|views?|pages?|ui|layouts?|screens?)$/i, 'ui'],
    [/^(middleware|plugins?|interceptors?|guards?)$/i, 'middleware'],
    [/^(utils?|helpers?|common|shared|tools|pkg|templatetags)$/i, 'utility'],
    [/^(config|constants?|env|settings|management|commands)$/i, 'config'],
    [/^(__tests__|tests?|specs?|src\/test\/java)$/i, 'test'],
    [/^(types?|interfaces?|schemas?|contracts?|dtos?|dto|requests?|responses?)$/i, 'types'],
    [/^hooks?$/i, 'hooks'],
    [/^(stores?|state|reducers?|actions?|slices?)$/i, 'state'],
    [/^(assets?|static|public)$/i, 'assets'],
    [/^(cmd|bin)$/i, 'entry'],
    [/^(docs?|documentation|wiki)$/i, 'documentation'],
    [/^(deploy|deployment|infra|infrastructure|k8s|kubernetes|helm|charts|terraform|tf|docker)$/i, 'infrastructure'],
    [/^(\.github|\.gitlab|\.circleci)$/i, 'ci-cd']
  ];

  function matchDirectory(name) {
    const candidates = [name, ...name.split('/')];
    for (const candidate of candidates) {
      for (const [pattern, label] of directoryPatterns) if (pattern.test(candidate)) return label;
    }
    return null;
  }

  function filePattern(node) {
    const filePath = node.filePath;
    const file = path.basename(filePath);
    const lower = file.toLowerCase();
    if (/\.(?:test|spec)\./i.test(filePath) || /(?:^|\/)test_[^/]+\.py$/i.test(filePath) || /_test\.go$/i.test(filePath) || /(?:Test\.java|Tests\.cs|_spec\.rb|Test\.php)$/i.test(filePath)) return 'test';
    if (/\.d\.ts$/i.test(filePath)) return 'types';
    if (/\.(graphql|gql|proto)$/i.test(filePath)) return 'types';
    if (/\.sql$/i.test(filePath)) return 'data';
    if (/\.(md|rst)$/i.test(filePath)) return 'documentation';
    if (/\.(tf|tfvars)$/i.test(filePath)) return 'infrastructure';
    if (/^(Dockerfile|docker-compose\.|Jenkinsfile)/i.test(file) || lower === 'makefile') return 'infrastructure';
    if (/^(.gitlab-ci\.yml)$/i.test(file) || filePath.startsWith('.github/workflows/') || filePath.startsWith('.circleci/')) return 'ci-cd';
    if (['cargo.toml', 'go.mod', 'gemfile', 'pom.xml', 'build.gradle', 'composer.json', 'package.json'].includes(lower)) return 'config';
    if (['index.ts', 'index.js', '__init__.py', 'manage.py', 'main.go', 'main.rs', 'lib.rs', 'application.java', 'program.cs', 'config.ru'].includes(lower)) return 'entry';
    const parts = splitPath(filePath).slice(0, -1).reverse();
    for (const part of parts) {
      const match = matchDirectory(part);
      if (match) return match;
    }
    if (node.type === 'config') return 'config';
    if (node.type === 'document') return 'documentation';
    if (node.type === 'table' || node.type === 'schema' || node.type === 'endpoint') return 'data';
    if (node.type === 'service' || node.type === 'resource') return 'infrastructure';
    if (node.type === 'pipeline') return 'ci-cd';
    return null;
  }

  const patternMatches = Object.fromEntries(Object.keys(directoryGroups).map((group) => [group, matchDirectory(group)]));
  const nestedPatternMatches = Object.fromEntries(Object.keys(nestedDirectoryGroups).map((group) => [group, matchDirectory(group)]));
  const filePatternMatches = Object.fromEntries(fileNodes.map((node) => [node.id, filePattern(node)]));

  const lowerPaths = fileNodes.map((node) => node.filePath.toLowerCase());
  const infraFiles = fileNodes
    .filter((node) => {
      const p = node.filePath.toLowerCase();
      return /(^|\/)(dockerfile|docker-compose[^/]*|jenkinsfile|makefile)$/.test(p) || /\.(tf|tfvars)$/.test(p) || p.startsWith('.github/workflows/') || p === '.gitlab-ci.yml' || p.startsWith('.circleci/') || /(^|\/)(k8s|kubernetes|helm|charts|terraform|infra|infrastructure)(\/|$)/.test(p);
    })
    .map((node) => node.filePath)
    .sort();
  const deploymentTopology = {
    hasDockerfile: lowerPaths.some((p) => /(^|\/)dockerfile$/.test(p)),
    hasCompose: lowerPaths.some((p) => /(^|\/)docker-compose/.test(p)),
    hasK8s: lowerPaths.some((p) => /(^|\/)(k8s|kubernetes|helm|charts)(\/|$)/.test(p)),
    hasTerraform: lowerPaths.some((p) => /\.tf(vars)?$/.test(p) || /(^|\/)terraform(\/|$)/.test(p)),
    hasCI: lowerPaths.some((p) => p.startsWith('.github/workflows/') || p === '.gitlab-ci.yml' || p.startsWith('.circleci/') || /(^|\/)jenkinsfile$/.test(p)),
    infraFiles
  };

  const dataPipeline = {
    schemaFiles: fileNodes.filter((node) => ['schema', 'table'].includes(node.type)).map((node) => node.filePath).sort(),
    migrationFiles: fileNodes.filter((node) => /(^|\/)migrations?\//i.test(node.filePath) || /\.sql$/i.test(node.filePath)).map((node) => node.filePath).sort(),
    dataModelFiles: fileNodes.filter((node) => /(^|\/)(models?|entities|types|data)(\/|$)/i.test(node.filePath) || node.tags?.some((tag) => ['data-model', 'type-definition', 'database'].includes(tag))).map((node) => node.filePath).sort(),
    apiHandlerFiles: fileNodes.filter((node) => /(^|\/)(api|routes|controllers|handlers|endpoints|functions)(\/|$)/i.test(node.filePath) || node.tags?.some((tag) => ['api-handler', 'endpoint'].includes(tag))).map((node) => node.filePath).sort()
  };

  const documentedGroups = new Set();
  for (const node of fileNodes) if (node.type === 'document') documentedGroups.add(groupById.get(node.id));
  for (const edge of allEdges) {
    if (edge.type !== 'documents') continue;
    const source = nodeById.get(edge.source);
    if (source?.type === 'document') documentedGroups.add(groupById.get(edge.target));
  }
  const groupNames = Object.keys(directoryGroups).sort();
  const docCoverage = {
    groupsWithDocs: documentedGroups.size,
    totalGroups: groupNames.length,
    coverageRatio: groupNames.length === 0 ? 0 : Number((documentedGroups.size / groupNames.length).toFixed(4)),
    documentedGroups: [...documentedGroups].sort(),
    undocumentedGroups: groupNames.filter((group) => !documentedGroups.has(group))
  };

  const pairCounts = new Map();
  for (const row of interGroupImports) pairCounts.set(`${row.from}\u0000${row.to}`, row.count);
  const dependencyDirection = [];
  const seenPairs = new Set();
  for (const row of interGroupImports) {
    const pair = [row.from, row.to].sort();
    const pairKey = pair.join('\u0000');
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    const forward = pairCounts.get(`${pair[0]}\u0000${pair[1]}`) ?? 0;
    const reverse = pairCounts.get(`${pair[1]}\u0000${pair[0]}`) ?? 0;
    if (forward === reverse) {
      dependencyDirection.push({ dependent: pair[0], dependsOn: pair[1], count: forward, reverseCount: reverse, dominant: false });
    } else if (forward > reverse) {
      dependencyDirection.push({ dependent: pair[0], dependsOn: pair[1], count: forward, reverseCount: reverse, dominant: true });
    } else {
      dependencyDirection.push({ dependent: pair[1], dependsOn: pair[0], count: reverse, reverseCount: forward, dominant: true });
    }
  }
  dependencyDirection.sort((a, b) => b.count - a.count || a.dependent.localeCompare(b.dependent));

  const nestedPairCounts = new Map();
  for (const row of nestedInterGroupImports) nestedPairCounts.set(`${row.from}\u0000${row.to}`, row.count);
  const nestedDependencyDirection = [];
  const seenNestedPairs = new Set();
  for (const row of nestedInterGroupImports) {
    const pair = [row.from, row.to].sort();
    const pairKey = pair.join('\u0000');
    if (seenNestedPairs.has(pairKey)) continue;
    seenNestedPairs.add(pairKey);
    const forward = nestedPairCounts.get(`${pair[0]}\u0000${pair[1]}`) ?? 0;
    const reverse = nestedPairCounts.get(`${pair[1]}\u0000${pair[0]}`) ?? 0;
    if (forward === reverse) {
      nestedDependencyDirection.push({ dependent: pair[0], dependsOn: pair[1], count: forward, reverseCount: reverse, dominant: false });
    } else if (forward > reverse) {
      nestedDependencyDirection.push({ dependent: pair[0], dependsOn: pair[1], count: forward, reverseCount: reverse, dominant: true });
    } else {
      nestedDependencyDirection.push({ dependent: pair[1], dependsOn: pair[0], count: reverse, reverseCount: forward, dominant: true });
    }
  }
  nestedDependencyDirection.sort((a, b) => b.count - a.count || a.dependent.localeCompare(b.dependent));

  const filesPerGroup = Object.fromEntries(Object.entries(directoryGroups).map(([group, ids]) => [group, ids.length]));
  const nodeTypeCounts = Object.fromEntries(Object.entries(nodeTypeGroups).map(([type, ids]) => [type, ids.length]));
  const fileStats = { totalFileNodes: fileNodes.length, filesPerGroup, nodeTypeCounts };

  const tagCountsByNestedGroup = {};
  for (const [group, ids] of Object.entries(nestedDirectoryGroups)) {
    const counts = new Map();
    for (const id of ids) for (const tag of nodeById.get(id).tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    tagCountsByNestedGroup[group] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([tag, count]) => ({ tag, count }));
  }

  const fileProfiles = fileNodes
    .map((node) => ({
      id: node.id,
      type: node.type,
      filePath: node.filePath,
      summary: node.summary,
      tags: node.tags ?? [],
      group: groupById.get(node.id),
      nestedGroup: nestedGroupById.get(node.id),
      pattern: filePatternMatches[node.id],
      fanIn: fileFanIn[node.id],
      fanOut: fileFanOut[node.id]
    }))
    .sort((a, b) => a.filePath.localeCompare(b.filePath));

  const result = {
    scriptCompleted: true,
    commonPrefix,
    directoryGroups,
    nestedDirectoryGroups,
    nodeTypeGroups,
    importAdjacency,
    directoryDependencies,
    crossCategoryEdges,
    nonCodeConnections,
    interGroupImports,
    nestedInterGroupImports,
    intraGroupDensity,
    nestedIntraGroupDensity,
    patternMatches,
    nestedPatternMatches,
    filePatternMatches,
    deploymentTopology,
    dataPipeline,
    docCoverage,
    dependencyDirection,
    nestedDependencyDirection,
    fileStats,
    fileFanIn,
    fileFanOut,
    tagCountsByNestedGroup,
    fileProfiles
  };

  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ scriptCompleted: true, totalFileNodes: fileNodes.length, directoryGroups: Object.keys(directoryGroups).length, importEdges: importEdges.length, allEdges: allEdges.length }));
} catch (error) {
  fail(error instanceof Error ? error.stack ?? error.message : String(error));
}
