#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error('Usage: node ua-arch-analyze.js <input.json> <output.json>');
  process.exit(1);
}

try {
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const fileNodes = input.fileNodes ?? input.nodes ?? [];
  const importEdges = input.importEdges ?? [];
  const allEdges = input.allEdges ?? input.edges ?? [];
  const nodeById = new Map(fileNodes.map((node) => [node.id, node]));
  const normalizedPath = (node) => String(node.filePath ?? node.name ?? '').replaceAll('\\', '/');

  const splitPaths = fileNodes.map((node) => normalizedPath(node).split('/').filter(Boolean));
  let commonSegments = splitPaths[0] ? [...splitPaths[0].slice(0, -1)] : [];
  for (const segments of splitPaths.slice(1)) {
    let index = 0;
    while (index < commonSegments.length && commonSegments[index] === segments[index]) index += 1;
    commonSegments = commonSegments.slice(0, index);
  }

  const extensionGroup = (filePath) => {
    if (/\.(test|spec)\.[^/]+$/i.test(filePath)) return 'test';
    if (/(^|\/)[^/]*config\.[^/]+$/i.test(filePath)) return 'config';
    const extension = path.posix.extname(filePath).slice(1).toLowerCase();
    return extension || 'root';
  };
  const pathGroup = (node) => {
    const filePath = normalizedPath(node);
    const segments = filePath.split('/').filter(Boolean);
    const remainder = segments.slice(commonSegments.length);
    if (remainder.length > 1) return remainder[0];
    if (commonSegments.length === 0 && segments.length > 1) return segments[0];
    return extensionGroup(filePath);
  };

  const directoryGroups = {};
  const groupById = new Map();
  for (const node of fileNodes) {
    const group = pathGroup(node);
    groupById.set(node.id, group);
    (directoryGroups[group] ??= []).push(node.id);
  }
  for (const ids of Object.values(directoryGroups)) ids.sort();

  const nodeTypeGroups = {};
  for (const node of fileNodes) (nodeTypeGroups[node.type] ??= []).push(node.id);
  for (const ids of Object.values(nodeTypeGroups)) ids.sort();

  const fileFanIn = Object.fromEntries(fileNodes.map((node) => [node.id, 0]));
  const fileFanOut = Object.fromEntries(fileNodes.map((node) => [node.id, 0]));
  const adjacency = Object.fromEntries(fileNodes.map((node) => [node.id, []]));
  const interGroupCount = new Map();
  const groupDependencies = {};
  const groupImportedBy = {};
  const groupInternal = Object.fromEntries(Object.keys(directoryGroups).map((group) => [group, 0]));
  const groupInvolving = Object.fromEntries(Object.keys(directoryGroups).map((group) => [group, 0]));

  for (const edge of importEdges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    fileFanOut[edge.source] += 1;
    fileFanIn[edge.target] += 1;
    adjacency[edge.source].push(edge.target);
    const from = groupById.get(edge.source);
    const to = groupById.get(edge.target);
    if (from === to) {
      groupInternal[from] += 1;
      groupInvolving[from] += 1;
    } else {
      groupInvolving[from] += 1;
      groupInvolving[to] += 1;
      interGroupCount.set(`${from}\0${to}`, (interGroupCount.get(`${from}\0${to}`) ?? 0) + 1);
      (groupDependencies[from] ??= new Set()).add(to);
      (groupImportedBy[to] ??= new Set()).add(from);
    }
  }
  for (const targets of Object.values(adjacency)) targets.sort();

  const directoryDependencySets = Object.fromEntries(Object.keys(directoryGroups).map((group) => [group, {
    importsFrom: [...(groupDependencies[group] ?? [])].sort(),
    importedBy: [...(groupImportedBy[group] ?? [])].sort(),
  }]));
  const interGroupImports = [...interGroupCount.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split('\0');
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  const intraGroupDensity = Object.fromEntries(Object.keys(directoryGroups).map((group) => [group, {
    internalEdges: groupInternal[group],
    totalEdges: groupInvolving[group],
    density: groupInvolving[group] ? Number((groupInternal[group] / groupInvolving[group]).toFixed(4)) : 0,
  }]));

  const directoryPatterns = [
    [/^(routes?|api|controllers?|endpoints?|handlers?)$/i, 'api'],
    [/^(services?|core|lib|domain|logic|internal|signals|composables|mailers|jobs|channels)$/i, 'service'],
    [/^(models?|db|data|persistence|repositories|entities|migrations|sql|database|schema)$/i, 'data'],
    [/^(components?|views?|pages?|ui|layouts?|screens?)$/i, 'ui'],
    [/^(middleware|plugins?|interceptors?|guards?)$/i, 'middleware'],
    [/^(utils?|helpers?|common|shared|tools|pkg|templatetags)$/i, 'utility'],
    [/^(config|constants|env|settings|management|commands)$/i, 'config'],
    [/^(__tests__|tests?|specs?)$/i, 'test'],
    [/^(types?|interfaces?|schemas?|contracts?|dtos?|dto|request|response)$/i, 'types'],
    [/^hooks$/i, 'hooks'],
    [/^(stores?|state|reducers|actions|slices)$/i, 'state'],
    [/^(assets?|static|public)$/i, 'assets'],
    [/^(docs|documentation|wiki)$/i, 'documentation'],
    [/^(deploy|deployment|infra|infrastructure|k8s|kubernetes|helm|charts|terraform|tf|docker)$/i, 'infrastructure'],
    [/^(\.github|\.gitlab|\.circleci)$/i, 'ci-cd'],
    [/^(cmd|bin)$/i, 'entry'],
  ];
  const filePattern = (filePath) => {
    const base = path.posix.basename(filePath);
    if (/\.(test|spec)\.[^.]+$/i.test(base) || /^test_.*\.py$/i.test(base) || /(_test\.go|Test\.java|_spec\.rb|Test\.php|Tests\.cs)$/i.test(base)) return 'test';
    if (/\.d\.ts$/i.test(base)) return 'types';
    if (/^(index\.(ts|js)|__init__\.py)$/i.test(base)) return 'entry';
    if (/^(manage\.py|config\.ru|Application\.java|Program\.cs)$/i.test(base)) return 'entry';
    if (/^(wsgi|asgi)\.py$/i.test(base)) return 'config';
    if (/^(Cargo\.toml|go\.mod|Gemfile|pom\.xml|build\.gradle|package\.json)$/i.test(base)) return 'config';
    if (/^(Dockerfile.*|docker-compose\..*)$/i.test(base) || /\.(tf|tfvars)$/i.test(base) || /^Makefile$/i.test(base)) return 'infrastructure';
    if (/^(\.gitlab-ci\.yml|Jenkinsfile)$/i.test(base) || filePath.startsWith('.github/workflows/')) return 'ci-cd';
    if (/\.sql$/i.test(base)) return 'data';
    if (/\.(graphql|gql|proto)$/i.test(base)) return 'types';
    if (/\.(md|rst)$/i.test(base)) return 'documentation';
    return null;
  };
  const patternMatches = {};
  for (const [group, ids] of Object.entries(directoryGroups)) {
    const directoryPattern = directoryPatterns.find(([matcher]) => matcher.test(group))?.[1];
    const filePatterns = ids.map((id) => filePattern(normalizedPath(nodeById.get(id)))).filter(Boolean);
    patternMatches[group] = directoryPattern ?? (filePatterns.length === ids.length && new Set(filePatterns).size === 1 ? filePatterns[0] : null);
  }

  const crossCategory = new Map();
  const nonCodeConnections = {};
  for (const edge of allEdges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    const key = `${source.type}\0${target.type}\0${edge.type}`;
    crossCategory.set(key, (crossCategory.get(key) ?? 0) + 1);
    if (source.type !== 'file') (nonCodeConnections[source.id] ??= []).push(target.id);
    if (target.type !== 'file') (nonCodeConnections[target.id] ??= []).push(source.id);
  }
  const crossCategoryEdges = [...crossCategory.entries()].map(([key, count]) => {
    const [fromType, toType, edgeType] = key.split('\0');
    return { fromType, toType, edgeType, count };
  }).sort((a, b) => b.count - a.count || a.fromType.localeCompare(b.fromType));
  for (const connections of Object.values(nonCodeConnections)) connections.sort();

  const paths = fileNodes.map(normalizedPath);
  const infraFiles = paths.filter((filePath) => /(^|\/)(Dockerfile[^/]*|docker-compose\.[^/]+|[^/]+\.(tf|tfvars)|Makefile)$|^\.github\/workflows\/|^\.gitlab-ci\.yml$|(^|\/)Jenkinsfile$/i.test(filePath));
  const deploymentTopology = {
    hasDockerfile: paths.some((filePath) => /(^|\/)Dockerfile[^/]*$/i.test(filePath)),
    hasCompose: paths.some((filePath) => /(^|\/)docker-compose\.[^/]+$/i.test(filePath)),
    hasK8s: paths.some((filePath) => /(^|\/)(k8s|kubernetes|helm|charts)(\/|$)/i.test(filePath)),
    hasTerraform: paths.some((filePath) => /\.(tf|tfvars)$/i.test(filePath)),
    hasCI: paths.some((filePath) => /^\.github\/workflows\/|^\.gitlab-ci\.yml$|(^|\/)Jenkinsfile$/i.test(filePath)),
    infraFiles: infraFiles.sort(),
  };

  const byPath = (matcher) => paths.filter(matcher).sort();
  const dataPipeline = {
    schemaFiles: byPath((filePath) => /(^|\/)(schema|schemas)(\/|\.)|\.(graphql|gql|proto|prisma)$/i.test(filePath)),
    migrationFiles: byPath((filePath) => /(^|\/)migrations?\//i.test(filePath)),
    dataModelFiles: byPath((filePath) => /(^|\/)(models?|entities|repositories)\//i.test(filePath)),
    apiHandlerFiles: byPath((filePath) => /(^|\/)(routes?|api|controllers?|endpoints?|handlers?|supabase\/functions)\//i.test(filePath)),
  };

  const documentNodes = fileNodes.filter((node) => node.type === 'document' || /\.(md|rst)$/i.test(normalizedPath(node)));
  const documentedGroups = new Set();
  for (const node of documentNodes) {
    const group = groupById.get(node.id);
    if (group) documentedGroups.add(group);
    const summary = `${node.summary ?? ''} ${(node.tags ?? []).join(' ')}`.toLowerCase();
    for (const candidate of Object.keys(directoryGroups)) if (summary.includes(candidate.toLowerCase())) documentedGroups.add(candidate);
  }
  const groupNames = Object.keys(directoryGroups);
  const docCoverage = {
    groupsWithDocs: documentedGroups.size,
    totalGroups: groupNames.length,
    coverageRatio: groupNames.length ? Number((documentedGroups.size / groupNames.length).toFixed(4)) : 0,
    undocumentedGroups: groupNames.filter((group) => !documentedGroups.has(group)).sort(),
  };

  const dependencyDirection = [];
  const groupPairs = new Set(interGroupImports.map(({ from, to }) => [from, to].sort().join('\0')));
  for (const pair of groupPairs) {
    const [a, b] = pair.split('\0');
    const aToB = interGroupCount.get(`${a}\0${b}`) ?? 0;
    const bToA = interGroupCount.get(`${b}\0${a}`) ?? 0;
    if (aToB === bToA) continue;
    dependencyDirection.push(aToB > bToA ? { dependent: a, dependsOn: b, count: aToB } : { dependent: b, dependsOn: a, count: bToA });
  }
  dependencyDirection.sort((a, b) => b.count - a.count || a.dependent.localeCompare(b.dependent));

  const result = {
    scriptCompleted: true,
    commonPathPrefix: commonSegments.length ? `${commonSegments.join('/')}/` : '',
    directoryGroups,
    nodeTypeGroups,
    importAdjacency: adjacency,
    directoryDependencySets,
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
      filesPerGroup: Object.fromEntries(Object.entries(directoryGroups).map(([group, ids]) => [group, ids.length])),
      nodeTypeCounts: Object.fromEntries(Object.entries(nodeTypeGroups).map(([type, ids]) => [type, ids.length])),
    },
    fileFanIn,
    fileFanOut,
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
}
