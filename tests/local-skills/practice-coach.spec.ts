import { expect, test } from '@playwright/test';

test('notebook batch becomes a deduplicated blind repair with durable answers and a dated follow-up', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/practice-lab?tab=notebook');
  await page.getByLabel('Book or source').fill('Isolated browser exercise');
  await page.getByLabel('Subject', { exact: true }).fill('Computer Networks');
  await page.getByLabel('Topic (optional)').fill('Hamming distance');
  await page.getByLabel('Question numbers, separated by spaces').fill('12 13');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Outcome for question 12').selectOption('wrong');
  await page.getByLabel('Outcome for question 13').selectOption('correct');
  await page
    .getByLabel('Attach notebook photo', { exact: false })
    .setInputFiles('public/hetu-cobalt-512.png');
  await expect(page.getByAltText('Notebook page to attach')).toBeVisible();
  await page.getByRole('button', { name: 'Save 2 questions together' }).click();
  await expect(page.getByText('2 questions saved together.', { exact: false })).toBeVisible();
  await page.getByText('Isolated browser exercise ·', { exact: false }).click();
  await page.getByRole('button', { name: 'Open notebook photo' }).click();
  await expect(
    page.getByAltText('Notebook page for Isolated browser exercise', { exact: false })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Prepare from my mistakes' }).click();
  await expect(
    page.getByText('repair packs prepared from your log.', { exact: false })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Mistake repairs', exact: true }).click();
  await page.getByRole('link', { name: /Distance, detection, and correction/ }).click();
  const practice = page.getByRole('region', { name: 'Mistake repair practice' });
  await expect(practice.getByText('Which quantity defines', { exact: false })).toBeVisible();
  await expect(practice.getByText('One close pair limits', { exact: false })).toHaveCount(0);
  await practice
    .getByRole('radio', { name: 'Smallest distance between distinct valid codewords' })
    .check();
  await expect(practice.getByRole('button', { name: 'Check answer' })).toBeEnabled();
  await page.reload();
  await expect(
    practice.getByRole('radio', { name: 'Smallest distance between distinct valid codewords' })
  ).toBeChecked();
  await practice.getByLabel('Practice conditions', { exact: true }).selectOption('without-help');
  await practice.getByRole('button', { name: 'Check answer' }).click();
  await expect(practice.getByText('One close pair limits', { exact: false })).toBeVisible();
  await page.reload();
  await expect(
    practice.getByText('A binary code has minimum distance', { exact: false })
  ).toBeVisible();
  await practice.getByRole('radio', { name: '1', exact: true }).check();
  await practice.getByRole('button', { name: 'Check answer' }).click();
  await practice.getByRole('button', { name: 'Next question', exact: true }).click();
  await practice.getByRole('radio', { name: '2', exact: true }).check();
  await practice.getByRole('button', { name: 'Check answer' }).click();
  await practice.getByRole('button', { name: 'See next step' }).click();
  await expect(practice.getByText(/3\/3 correct. Next check:/)).toBeVisible();
  await expect(practice.getByRole('button', { name: 'Start due check' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Prepare from my mistakes' }).click();
  await expect(page.getByText('No duplicates added.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'My principles' }).click();
  await page.getByText('Distance, detection, and correction', { exact: false }).first().click();
  await page.getByRole('button', { name: 'Confirm and save principle' }).click();
  await expect(page.getByText('Your confirmed principle is saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await expect(page.getByText('Recorded exercise answers', { exact: true })).toBeVisible();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const mode of ['light', 'dark']) {
      const toggle = page.getByRole('button', { name: `Switch to ${mode} mode` });
      if (await toggle.isVisible()) await toggle.click();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test('real PYQ answer commits without a confidence requirement or reflection popup', async ({
  page
}) => {
  await page.goto('/pyq?questionUids=go%3A422790&count=all&mode=practice');
  await page
    .getByRole('button', { name: /Start (?:selected practice|practice set|fresh set)/ })
    .click();
  await page.getByPlaceholder('Enter a number').fill('4096');
  await expect(page.getByRole('button', { name: 'Answered: committed' })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  await page.getByRole('button', { name: 'Commit & reveal key' }).click();
  await expect(page.getByRole('region', { name: 'PYQ attempt receipt' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Capture your thinking' })).toHaveCount(0);
  await expect(page.getByText('High confidence', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Got stuck', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Got stuck', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.getByRole('button', { name: 'Finish set', exact: true }).click();
  const review = page.getByRole('region', { name: 'Short practice review' });
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'Later', exact: true }).click();
  await expect(review.getByText('Left for later.', { exact: false })).toBeVisible();
  await review.getByRole('button', { name: 'Review now' }).click();
  await review.getByLabel('What deserves attention?').selectOption('recognition');
  await review.getByRole('button', { name: 'Save observation' }).click();
  await expect(review.getByText('Your assessment is saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Capture your thinking' })).toHaveCount(0);
});

test('balanced session stays within budget and retains completion; exam strategy persists', async ({
  page
}) => {
  await page.goto('/');
  await page.getByText('Build a balanced session', { exact: true }).click();
  const plan = page.getByRole('region', { name: 'Build a balanced practice session' });
  await plan.getByLabel('Session length').selectOption('10');
  await plan.getByRole('button', { name: 'Build session' }).click();
  await expect(plan.getByText('10 minutes planned', { exact: false })).toBeVisible();
  await plan.getByRole('button', { name: 'Mark done', exact: true }).first().click();
  await expect(plan.getByRole('button', { name: 'Marked done' })).toHaveCount(1);
  await page.reload();
  await page.getByText('Build a balanced session', { exact: true }).click();
  await plan.getByLabel('Session length').selectOption('10');
  await plan.getByRole('button', { name: 'Build session' }).click();
  await expect(plan.getByRole('button', { name: 'Marked done' })).toHaveCount(1);
  await page.goto('/practice-lab?tab=progress');
  const strategy = page.getByRole('region', { name: 'Exam judgement experiment' });
  await strategy.getByLabel('Next experiment').selectOption('protect-review');
  await strategy.getByLabel('Reserve for review (minutes)').fill('8');
  await strategy.getByRole('button', { name: 'Save next exam experiment' }).click();
  await expect(strategy.getByRole('status')).toContainText('Saved.');
  await page.reload();
  await expect(strategy.getByLabel('Next experiment')).toHaveValue('protect-review');
  await expect(strategy.getByLabel('Reserve for review (minutes)')).toHaveValue('8');
});
