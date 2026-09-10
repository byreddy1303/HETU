import { readFile } from 'node:fs/promises';

const planUrl = new URL('../docs/closed-learning-loop-plan.md', import.meta.url);
const source = await readFile(planUrl, 'utf8');

const requiredRecommendations = [
  'Automatic weak-attempt capture, including exams',
  'Journal enrichment never gates recovery',
  'One canonical learning identity / one schedule',
  'Append-only learning events',
  'Blind retrieval and explicit hint evidence',
  'Failure vs defer vs interruption',
  'Again/Hard/Good/Easy adaptive grading',
  'Durable recovery sessions',
  'Bounded workload-aware recovery sprints',
  'Remediation/leech state',
  'Transfer checks before durable mastery',
  'Recommended PYQ set presets',
  'Seeded stratified question selection',
  'Live setup preflight',
  'Confidence-aware selection and reports',
  'Exact actionable report subsets',
  'Complete searchable session history',
  'Capacity-aware Build my day',
  'Executable planner prescriptions/results',
  'Review load forecast',
  'Agenda/time windows/buffer',
  'Replicate/copy/template/recurrence/rollover',
  'Plan-vs-actual and estimation calibration',
  'Mobile agenda/week visibility',
  'Full planner sync, tombstones, outbox, backup',
  'Unify legacy and current planner sources',
  'Recovery-focused Weekly Review and Readiness',
  'Honest past/today/future analytics',
  'RLS/RPC hardening and explicit API grants',
  'Manual NAT exact/tolerance/range evaluation',
  'No passive-only insights; every priority insight has an action'
];

const missing = requiredRecommendations.filter(
  (recommendation) => !source.includes(`| ${recommendation} |`)
);
if (missing.length > 0) {
  throw new Error(`Closed-loop traceability rows are missing:\n- ${missing.join('\n- ')}`);
}

const ledgerRows = source
  .split('## Traceability ledger')[1]
  ?.split('## Verification log')[0]
  .split('\n')
  .filter((line) => line.startsWith('| ') && !line.startsWith('| ---'))
  .slice(1) ?? [];
if (ledgerRows.length !== requiredRecommendations.length) {
  throw new Error('Traceability must contain exactly one row per recommendation.');
}
const allowedStatuses = new Set(['Pending', 'In progress', 'Complete', 'Blocked']);
for (const row of ledgerRows) {
  const cells = row
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
  if (cells.length !== 3 || !allowedStatuses.has(cells[2])) {
    throw new Error(`Invalid traceability ledger row: ${row}`);
  }
}

const planStatus = source.match(/^Status:\s*(.+?)\s*$/m)?.[1]?.toLowerCase();
const unchecked = (source.match(/^- \[ \]/gm) ?? []).length;
const pendingLedger = ledgerRows.filter((row) => row.endsWith('| Pending |')).length;
const incompleteLedger = ledgerRows.filter((row) => !row.endsWith('| Complete |')).length;
if (planStatus === 'complete' && (unchecked > 0 || incompleteLedger > 0)) {
  throw new Error(
    `Plan is marked complete with ${unchecked} unchecked tasks and ${incompleteLedger} incomplete recommendations.`
  );
}

console.log(
  `Closed-loop plan is traceable: ${requiredRecommendations.length} recommendations, ${unchecked} unchecked tasks, ${incompleteLedger} incomplete (${pendingLedger} not started).`
);
