import { expect, test } from '@playwright/test';

test('local daily preferences and a blind skill check survive navigation and reload', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const time = page.getByRole('combobox', { name: 'Time available' });
  await expect(time).toBeEnabled();
  await time.selectOption('45');
  await expect(time).toBeEnabled();
  await page.reload();
  await expect(time).toHaveValue('45');
  await page.getByRole('link', { name: 'Check a skill' }).click();
  await page.getByRole('button', { name: 'Start contrast check' }).first().click();
  await expect(page.getByRole('heading', { name: 'Cache address fields' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Contrast feedback' })).toHaveCount(0);
  await page.getByRole('group', { name: 'Case 1', exact: true }).getByRole('radio').first().check();
  await page.getByRole('textbox').fill('The number of cache sets changes the index field.');
  await page.getByRole('button', { name: 'Save and return' }).click();
  await expect(page).toHaveURL(/\/skills$/);
  await page.reload();
  await page.getByRole('button', { name: 'Resume contrast check' }).click();
  await expect(page.getByRole('textbox')).toHaveValue(
    'The number of cache sets changes the index field.'
  );
  await expect(
    page.getByRole('group', { name: 'Case 1', exact: true }).getByRole('radio').first()
  ).toBeChecked();
  await page.getByRole('group', { name: 'Case 2', exact: true }).getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Commit and compare' }).click();
  await expect(page.getByRole('region', { name: 'Contrast feedback' })).toBeVisible();
  await page.getByRole('button', { name: 'Save assessment and prepare practice' }).click();
  await page.getByRole('link', { name: 'Open linked practice and progress' }).click();
  await page.getByRole('button', { name: 'Start selected practice' }).click();
  await expect(
    page.getByRole('heading', { name: 'Application check: Cache address fields' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start selected practice' }).click();
  await expect(page.getByText('Q 1/3', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Q 1/3', { exact: true })).toBeVisible();
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: 'Left blank: skipped', exact: true }).click();
    await page.getByRole('button', { name: 'Commit & reveal key', exact: true }).click();
    await page.getByRole('button', { name: 'Save for later', exact: true }).click();
    await page
      .getByRole('button', { name: index === 2 ? 'Finish set' : 'Next question', exact: true })
      .click();
  }
  await page.getByRole('link', { name: 'Open skill results and next check' }).click();
  await page.getByText('Results and study conditions (1)', { exact: true }).click();
  await expect(page.getByText(/0\/3 selected questions correct/)).toBeVisible();
  await page.getByRole('button', { name: 'Used hints or notes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Skill practice and evidence' })).toBeVisible();
  await page.getByText('Results and study conditions (1)', { exact: true }).click();
  await expect(page.getByText('You reported using help.', { exact: true })).toBeVisible();
  await expect(page.getByText('Retry remaining questions', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('local navigation remains usable at narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Time available' })).toBeEnabled();
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  for (const name of ['Today', 'Practice', 'Review', 'Knowledge', 'Progress']) {
    await expect(navigation.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await navigation.getByRole('link', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});
