// A small, answer-free presentation model. Queue counts are never a progress score.
function buildBriefView(brief, { preview = false, time = '09:00' } = {}) {
  const { planner, reattempts, concepts } = brief;
  const partial = reattempts.complete === false || concepts.complete === false;
  const first = planner.items[0];
  const minutes = Number.isFinite(first?.minutes) && first.minutes > 0 ? first.minutes : null;
  let focus;
  if (planner.count > 0) {
    focus = {
      eyebrow: 'YOUR FIRST PLANNED BLOCK',
      title: first?.title || 'Pick up today’s plan',
      detail: minutes ? `${minutes} minutes set aside in Planner. Open the block and begin.` : 'Start with a commitment you already made in Planner.',
      label: 'Open today’s plan', action: 'planner',
      meta: minutes ? `${minutes} min planned` : 'From your saved plan'
    };
  } else if (reattempts.count > 0) {
    focus = {
      eyebrow: 'ONE SMALL START', title: 'Revisit a due question',
      detail: 'Try it from memory, then check your reasoning. Choose a short session in Do now.',
      label: 'Choose a reattempt', action: 'today', meta: 'Recall before checking'
    };
  } else if (concepts.count > 0) {
    focus = {
      eyebrow: 'ONE SMALL START', title: 'Bring one concept back to mind',
      detail: 'Explain it from memory before revealing the reference. Start with one due review.',
      label: 'Open concept revisions', action: 'concepts', meta: 'One concept at a time'
    };
  } else {
    focus = {
      eyebrow: partial ? 'CHECK YOUR QUEUE' : 'MAKE ROOM FOR ONE THING',
      title: partial ? 'Your review counts are incomplete' : 'Choose today’s first study block',
      detail: partial ? 'Open Do now to refresh the available work before choosing your next step.' : 'No blocks or due reviews in this brief. Set one focused task in Planner.',
      label: partial ? 'Check Do now' : 'Plan a study block',
      action: partial ? 'today' : 'planner', meta: partial ? 'Partial queue snapshot' : 'A clear place to begin'
    };
  }
  const count = (group) => `${group.count}${group.complete === false ? '+' : ''}`;
  const topics = (group) => [...new Set(group.items.map((item) => item.label).filter(Boolean))].slice(0, 2).join(' · ');
  const [hour, minute] = time.split(':').map(Number);
  const schedule = `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'} IST`;
  return {
    preview,
    date: new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(`${brief.date}T12:00:00+05:30`)),
    schedule,
    focus,
    stats: [
      { count: count(planner), label: 'Planned blocks', note: 'Unfinished today', action: 'planner' },
      { count: count(reattempts), label: 'Due reattempts', note: 'Practice again', action: 'today' },
      { count: count(concepts), label: 'Concept reviews', note: 'Recall & revise', action: 'concepts' }
    ],
    plan: planner.items.slice(0, 3).map((item) => ({
      title: item.title,
      minutes: Number.isFinite(item.minutes) && item.minutes > 0 ? `${item.minutes} min` : ''
    })),
    remainingBlocks: Math.max(0, planner.count - Math.min(planner.items.length, 3)),
    reattemptTopics: topics(reattempts),
    conceptTopics: topics(concepts),
    partial
  };
}

module.exports = { buildBriefView };
