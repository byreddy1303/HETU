#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) fail('Usage: node final-arch-analyze.js <input.json> <output.json>');

let input;
try {
  input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (error) {
  fail(`Could not read architecture input: ${error.message}`);
}

const fileNodes = Array.isArray(input.fileNodes) ? input.fileNodes : [];
const importEdges = Array.isArray(input.importEdges) ? input.importEdges : [];
const allEdges = Array.isArray(input.allEdges) ? input.allEdges : [];
if (!fileNodes.length) fail('Architecture input has no fileNodes');

const nodeById = new Map(fileNodes.map((node) => [node.id, node]));
const paths = fileNodes.map((node) => node.filePath || node.name || node.id);

function commonDirectoryPrefix(values) {
  const segments = values.map((value) => String(value).split('/'));
  const limit = Math.min(...segments.map((parts) => parts.length - 1));
  const prefix = [];
  for (let index = 0; index < limit; index += 1) {
    const candidate = segments[0][index];
    if (!segments.every((parts) => parts[index] === candidate)) break;
    prefix.push(candidate);
  }
  return prefix;
}

const commonPrefixParts = commonDirectoryPrefix(paths);
const commonPrefix = commonPrefixParts.length ? `${commonPrefixParts.join('/')}/` : '';
const directoryGroups = {};
const groupById = new Map();

function groupFor(node) {
  const filePath = String(node.filePath || node.name || node.id);
  const parts = filePath.split('/');
  const remaining = commonPrefixParts.length ? parts.slice(commonPrefixParts.length) : parts;
  if (remaining.length <= 1) return 'root';
  return remaining[0] || 'root';
}

for (const node of fileNodes) {
  const group = groupFor(node);
  (directoryGroups[group] ||= []).push(node.id);
  groupById.set(node.id, group);
}
for (const ids of Object.values(directoryGroups)) ids.sort();

const nodeTypeGroups = {};
for (const node of fileNodes) (nodeTypeGroups[node.type || 'file'] ||= []).push(node.id);
for (const ids of Object.values(nodeTypeGroups)) ids.sort();

const fileFanIn = Object.fromEntries(fileNodes.map((node) => [node.id, 0]));
const fileFanOut = Object.fromEntries(fileNodes.map((node) => [node.id, 0]));
const adjacency = Object.fromEntries(fileNodes.map((node) => [node.id, []]));
const importedGroups = Object.fromEntries(Object.keys(directoryGroups).map((group) => [group, new Set()]));
const importedByGroups = Object.fromEntries(Object.keys(directoryGroups).map((group) => [group, new Set()]));
const interGroupCounter = new Map();
const groupInternal = Object.fromEntries(Object.keys(directoryGroups).map((group) => [group, 0]));
const groupIncident = Object.fromEntries(Object.keys(directoryGroups).map((group) => [group, 0]));

for (const edge of importEdges) {
  if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
  fileFanOut[edge.source] += 1;
  fileFanIn[edge.target] += 1;
  adjacency[edge.source].push(edge.target);
  const from = groupById.get(edge.source);
  const to = groupById.get(edge.target);
  groupIncident[from] += 1;
  if (to !== from) groupIncident[to] += 1;
  if (from === to) {
    groupInternal[from] += 1;
  } else {
    importedGroups[from].add(to);
    importedByGroups[to].add(from);
    const key = `${from}\u0000${to}`;
    interGroupCounter.set(key, (interGroupCounter.get(key) || 0) + 1);
  }
}
for (const ids of Object.values(adjacency)) ids.sort();

const interGroupImports = [...interGroupCounter.entries()]
  .map(([key, count]) => {
    const [from, to] = key.split('\u0000');
    return { from, to, count };
  })
  .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

const intraGroupDensity = {};
for (const group of Object.keys(directoryGroups).sort()) {
  const totalEdges = groupIncident[group];
  const internalEdges = groupInternal[group];
  intraGroupDensity[group] = {
    internalEdges,
    totalEdges,
    density: totalEdges ? Number((internalEdges / totalEdges).toFixed(4)) : 0,
  };
}

const directoryPatterns = [
  [/^(routes|api|controllers|endpoints|handlers|serializers|routers|blueprints)$/i, 'api'],
  [/^(services|core|lib|domain|logic|internal|composables|mailers|jobs|channels|signals)$/i, 'service'],
  [/^(models|db|data|persistence|repository|entities|entity|migrations|sql|database|schema)$/i, 'data'],
  [/^(components|views|pages|ui|layouts|screens)$/i, 'ui'],
  [/^(middleware|plugins|interceptors|guards)$/i, 'middleware'],
  [/^(utils|helpers|common|shared|tools|pkg|templatetags)$/i, 'utility'],
  [/^(config|constants|env|settings|management|commands)$/i, 'config'],
  [/^(__tests__|test|tests|spec|specs)$/i, 'test'],
  [/^(types|interfaces|schemas|contracts|dtos|dto|request|response)$/i, 'types'],
  [/^hooks$/i, 'hooks'],
  [/^(store|stores|state|reducers|actions|slices)$/i, 'state'],
  [/^(assets|static|public)$/i, 'assets'],
  [/^(cmd|bin)$/i, 'entry'],
  [/^(docs|documentation|wiki)$/i, 'documentation'],
  [/^(deploy|deployment|infra|infrastructure|k8s|kubernetes|helm|charts|terraform|tf|docker)$/i, 'infrastructure'],
  [/^(\.github|\.gitlab|\.circleci)$/i, 'ci-cd'],
];

function classifyFile(node) {
  const filePath = String(node.filePath || node.name || '');
  const base = path.basename(filePath);
  if (/((^|\.)test|\.spec)\.[^.]+$/i.test(base) || /^test_.*\.py$/i.test(base) || /_test\.go$/i.test(base) || /(Test|Tests)\.(java|php|cs)$/i.test(base) || /_spec\.rb$/i.test(base)) return 'test';
  if (/\.d\.ts$/i.test(base)) return 'types';
  if (/^(index\.(ts|js)|__init__\.py)$/i.test(base)) return 'entry';
  if (/^manage\.py$/i.test(base)) return 'entry';
  if (/^(wsgi|asgi)\.py$/i.test(base)) return 'config';
  if (/^(main\.rs|lib\.rs)$/i.test(base) && /^src\//.test(filePath)) return 'entry';
  if (/^(Application\.java|Program\.cs|config\.ru)$/i.test(base)) return 'entry';
  if (/^(Cargo\.toml|go\.mod|Gemfile|pom\.xml|build\.gradle)$/i.test(base)) return 'config';
  if (/^(Dockerfile|docker-compose\.)/i.test(base) || /\.(tf|tfvars)$/i.test(base) || /(^|\/)k8s\//i.test(filePath)) return 'infrastructure';
  if (/^\.github\/workflows\//i.test(filePath) || /^\.gitlab-ci\.yml$/i.test(filePath) || /^Jenkinsfile$/i.test(base)) return 'ci-cd';
  if (/\.sql$/i.test(base)) return 'data';
  if (/\.(graphql|gql|proto)$/i.test(base)) return 'types';
  if (/\.(md|rst)$/i.test(base)) return 'documentation';
  if (/^Makefile$/i.test(base)) return 'infrastructure';
  return null;
}

const patternMatches = {};
for (const group of Object.keys(directoryGroups).sort()) {
  const direct = directoryPatterns.find(([regex]) => regex.test(group));
  if (direct) patternMatches[group] = direct[1];
  else {
    const classifications = directoryGroups[group].map((id) => classifyFile(nodeById.get(id))).filter(Boolean);
    const counts = classifications.reduce((acc, label) => ((acc[label] = (acc[label] || 0) + 1), acc), {});
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (best && best[1] / directoryGroups[group].length >= 0.5) patternMatches[group] = best[0];
  }
}

const crossCategoryCounter = new Map();
const nonCodeConnections = [];
for (const edge of allEdges) {
  const source = nodeById.get(edge.source);
  const target = nodeById.get(edge.target);
  if (!source || !target) continue;
  const key = `${source.type || 'file'}\u0000${target.type || 'file'}\u0000${edge.type || 'related'}`;
  crossCategoryCounter.set(key, (crossCategoryCounter.get(key) || 0) + 1);
  if ((source.type || 'file') !== 'file' || (target.type || 'file') !== 'file') {
    nonCodeConnections.push({ source: edge.source, target: edge.target, edgeType: edge.type || 'related' });
  }
}
const crossCategoryEdges = [...crossCategoryCounter.entries()]
  .map(([key, count]) => {
    const [fromType, toType, edgeType] = key.split('\u0000');
    return { fromType, toType, edgeType, count };
  })
  .sort((a, b) => a.fromType.localeCompare(b.fromType) || a.toType.localeCompare(b.toType) || a.edgeType.localeCompare(b.edgeType));

const infraFiles = fileNodes
  .filter((node) => ['infrastructure', 'ci-cd'].includes(classifyFile(node)) || ['service', 'resource', 'pipeline'].includes(node.type))
  .map((node) => node.filePath)
  .sort();
const deploymentTopology = {
  hasDockerfile: paths.some((value) => /(^|\/)Dockerfile/i.test(value)),
  hasCompose: paths.some((value) => /(^|\/)docker-compose\./i.test(value)),
  hasK8s: paths.some((value) => /(^|\/)(k8s|kubernetes|helm|charts)(\/|$)/i.test(value)),
  hasTerraform: paths.some((value) => /(^|\/)(terraform|tf)(\/|$)|\.(tf|tfvars)$/i.test(value)),
  hasCI: paths.some((value) => /(^|\/)(\.github\/workflows|\.gitlab|\.circleci)(\/|$)|Jenkinsfile$/i.test(value)),
  infraFiles,
};

const dataPipeline = {
  schemaFiles: fileNodes.filter((node) => /(^|\/)(schema[^/]*|.*\.(graphql|gql|proto))$/i.test(node.filePath || '') || node.type === 'schema').map((node) => node.filePath).sort(),
  migrationFiles: fileNodes.filter((node) => /(^|\/)migrations\/.*\.sql$/i.test(node.filePath || '')).map((node) => node.filePath).sort(),
  dataModelFiles: fileNodes.filter((node) => /(^|\/)(models?|entities|types)\//i.test(node.filePath || '')).map((node) => node.filePath).sort(),
  apiHandlerFiles: fileNodes.filter((node) => /(^|\/)(routes|api|controllers|endpoints|handlers|functions)\//i.test(node.filePath || '') || node.type === 'endpoint').map((node) => node.filePath).sort(),
};

const docNodes = fileNodes.filter((node) => node.type === 'document' || /\.(md|rst)$/i.test(node.filePath || ''));
const groupsWithDocsSet = new Set(docNodes.map((node) => groupById.get(node.id)));
const allGroups = Object.keys(directoryGroups).sort();
const docCoverage = {
  groupsWithDocs: groupsWithDocsSet.size,
  totalGroups: allGroups.length,
  coverageRatio: Number((groupsWithDocsSet.size / allGroups.length).toFixed(4)),
  undocumentedGroups: allGroups.filter((group) => !groupsWithDocsSet.has(group)),
};

const directionPairs = new Set();
const dependencyDirection = [];
for (const item of interGroupImports) {
  const pair = [item.from, item.to].sort();
  const pairKey = pair.join('\u0000');
  if (directionPairs.has(pairKey)) continue;
  directionPairs.add(pairKey);
  const forward = interGroupCounter.get(`${pair[0]}\u0000${pair[1]}`) || 0;
  const reverse = interGroupCounter.get(`${pair[1]}\u0000${pair[0]}`) || 0;
  if (forward === reverse) {
    dependencyDirection.push({ dependent: pair[0], dependsOn: pair[1], count: forward, reverseCount: reverse, bidirectional: true });
  } else if (forward > reverse) {
    dependencyDirection.push({ dependent: pair[0], dependsOn: pair[1], count: forward, reverseCount: reverse });
  } else {
    dependencyDirection.push({ dependent: pair[1], dependsOn: pair[0], count: reverse, reverseCount: forward });
  }
}

const results = {
  scriptCompleted: true,
  commonPrefix,
  directoryGroups,
  nodeTypeGroups,
  adjacency,
  groupAdjacency: Object.fromEntries(allGroups.map((group) => [group, {
    importsFrom: [...importedGroups[group]].sort(),
    importedBy: [...importedByGroups[group]].sort(),
  }])),
  crossCategoryEdges,
  nonCodeConnections,
  interGroupImports,
  intraGroupDensity,
  patternMatches,
  deploymentTopology,
  dataPipeline,
  docCoverage,
  dependencyDirection,
  fileStats: {
    totalFileNodes: fileNodes.length,
    filesPerGroup: Object.fromEntries(allGroups.map((group) => [group, directoryGroups[group].length])),
    nodeTypeCounts: Object.fromEntries(Object.entries(nodeTypeGroups).map(([type, ids]) => [type, ids.length])),
  },
  fileFanIn,
  fileFanOut,
};

try {
  fs.writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`);
} catch (error) {
  fail(`Could not write architecture results: ${error.message}`);
}
