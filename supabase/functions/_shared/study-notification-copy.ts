export interface StudyPlanBlock {
  subject: string;
  customSubject: string | null;
  durationMin: number;
  mode: string;
  target: string;
}

export interface StudyPlanItem {
  id: string;
  title: string;
  subject: string | null;
  targetMin: number | null;
}

export interface DetailedPlanInput {
  blocks: StudyPlanBlock[];
  openItems: StudyPlanItem[];
  reattemptsDue: number;
}

export interface PyqReminderInput {
  blocks: StudyPlanBlock[];
  attemptedLast24h: number;
}

function clean(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function compact(value: string, maxLength: number): string {
  const normalized = value.replace(/[ \t]+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function plural(value: number, singular: string, pluralForm = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

export function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export function parseStudyPlanBlocks(value: unknown): StudyPlanBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: StudyPlanBlock[] = [];
  for (const item of value.slice(0, 24)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const subject = clean(row.subject, 80);
    const durationMin =
      typeof row.durationMin === 'number' && Number.isFinite(row.durationMin)
        ? Math.max(0, Math.min(480, Math.round(row.durationMin)))
        : 0;
    if (!subject || durationMin === 0) continue;
    blocks.push({
      subject,
      customSubject: clean(row.customSubject, 80) || null,
      durationMin,
      mode: clean(row.mode, 60) || 'Study',
      target: clean(row.target, 180)
    });
  }
  return blocks;
}

function blockSubject(block: StudyPlanBlock): string {
  return block.subject === 'Custom...' && block.customSubject ? block.customSubject : block.subject;
}

function blockDetail(block: StudyPlanBlock): string {
  return compact(block.target || block.mode, 72);
}

export function detailedDayPlanCopy(input: DetailedPlanInput): {
  hasPlan: boolean;
  title: string;
  body: string;
} {
  const blocks = input.blocks.slice(0, 24);
  const items = input.openItems.slice(0, 24);
  const totalMinutes = blocks.reduce((sum, block) => sum + block.durationMin, 0);
  const hasPlan = blocks.length > 0 || items.length > 0;
  if (!hasPlan) {
    return {
      hasPlan: false,
      title: 'HETU · Daily overview',
      body:
        input.reattemptsDue > 0
          ? `${plural(input.reattemptsDue, 're-attempt')} due today. Add one concrete study block, then clear the oldest re-attempt.`
          : 'No study blocks or open tasks are planned yet. Add one concrete block for today.'
    };
  }

  const titleParts = [
    'Today’s plan',
    blocks.length > 0 ? plural(blocks.length, 'block') : '',
    totalMinutes > 0 ? formatMinutes(totalMinutes) : '',
    items.length > 0 ? plural(items.length, 'task') : ''
  ].filter(Boolean);
  const lines: string[] = [];
  for (const [index, block] of blocks.slice(0, 4).entries()) {
    lines.push(
      `${index + 1}. ${compact(blockSubject(block), 50)} · ${formatMinutes(block.durationMin)} — ${blockDetail(block)}`
    );
  }
  if (blocks.length > 4) lines.push(`+ ${plural(blocks.length - 4, 'more block')}`);
  for (const item of items.slice(0, 2)) {
    const subject = item.subject ? `${compact(item.subject, 35)} · ` : '';
    const duration = item.targetMin ? ` · ${formatMinutes(item.targetMin)}` : '';
    lines.push(`Task: ${subject}${compact(item.title, 80)}${duration}`);
  }
  if (items.length > 2) lines.push(`+ ${plural(items.length - 2, 'more task')}`);
  if (input.reattemptsDue > 0) {
    lines.push(`${plural(input.reattemptsDue, 're-attempt')} also due.`);
  }
  return {
    hasPlan: true,
    title: compact(titleParts.join(' · '), 110),
    body: compact(lines.join('\n'), 480)
  };
}

function isPyqBlock(block: StudyPlanBlock): boolean {
  return /\bpyq\b|previous year/i.test(`${block.mode} ${block.target}`);
}

export function dailyPyqCopy(input: PyqReminderInput): { title: string; body: string } {
  const planned = input.blocks.filter(isPyqBlock);
  if (planned.length > 0) {
    const totalMinutes = planned.reduce((sum, block) => sum + block.durationMin, 0);
    const details = planned
      .slice(0, 2)
      .map(
        (block) =>
          `${compact(blockSubject(block), 45)} · ${formatMinutes(block.durationMin)} — ${blockDetail(block)}`
      )
      .join('\n');
    return {
      title: `Daily PYQs · ${formatMinutes(totalMinutes)} planned`,
      body: compact(
        `${details}${planned.length > 2 ? `\n+ ${plural(planned.length - 2, 'more PYQ block')}` : ''}\n${plural(input.attemptedLast24h, 'PYQ')} solved in the last 24h. Start today’s planned set now.`,
        480
      )
    };
  }
  return {
    title: 'Daily PYQ reminder',
    body: `${plural(input.attemptedLast24h, 'PYQ')} solved in the last 24h. Start today’s subject-wise set now and complete at least 10 questions.`
  };
}
