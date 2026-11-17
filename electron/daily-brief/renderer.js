const text = (id, value) => { document.getElementById(id).textContent = value; };

async function render() {
  const view = await window.dailyBrief.get();
  text('date', view.date);
  text('schedule', view.preview ? 'PREVIEW' : view.schedule);
  for (const stat of view.stats) {
    const button = document.createElement('button');
    button.className = 'stat';
    button.dataset.action = stat.action;
    button.setAttribute('aria-label', `${stat.count} ${stat.label.toLowerCase()}. Open queue.`);
    for (const [className, value] of [['stat-count', stat.count], ['stat-label', stat.label], ['stat-note', stat.note]]) {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = value;
      button.append(span);
    }
    document.getElementById('stats').append(button);
  }
  for (const key of ['eyebrow', 'title', 'detail', 'meta']) text(`focus-${key}`, view.focus[key]);
  text('primary', `${view.focus.label} →`);
  document.getElementById('primary').dataset.action = view.focus.action;
  for (const block of view.plan) {
    const li = document.createElement('li');
    const title = document.createElement('span');
    const minutes = document.createElement('span');
    title.textContent = block.title;
    minutes.textContent = block.minutes;
    minutes.className = 'minutes';
    li.append(title, minutes);
    document.getElementById('plan').append(li);
  }
  text('remaining', view.remainingBlocks ? `+${view.remainingBlocks} more in Planner` : view.plan.length ? '' : 'No unfinished blocks saved for today.');
  text('reattempt-topics', view.reattemptTopics ? `Reattempts · ${view.reattemptTopics}` : '');
  text('concept-topics', view.conceptTopics ? `Concepts · ${view.conceptTopics}` : '');
  document.getElementById('partial').hidden = !view.partial;
  if (view.preview) {
    document.getElementById('snooze').hidden = true;
    text('dismiss', 'Close preview');
    text('footer-note', 'Preview · your daily delivery is unchanged.');
  }
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (button) window.dailyBrief.act(button.dataset.action);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') window.dailyBrief.act('dismiss');
  });
  window.dailyBrief.ready();
  document.getElementById('primary').focus({ preventScroll: true });
}

void render();
