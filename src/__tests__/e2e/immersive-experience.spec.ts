import { expect, test } from '@playwright/test';

test('a learner can explore an answer, its cause, and fresh recall with the keyboard', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Understand. Rebuild. Remember.' })).toBeVisible();
  const main = page.getByRole('main');
  await expect(
    main.getByRole('region', { name: 'The answer is only the beginning.' })
  ).toBeVisible();
  await expect(main.getByRole('region', { name: 'A place for your best thinking.' })).toBeVisible();

  const phases = page.getByRole('group', { name: 'Explore the learning loop', exact: true });
  await phases.getByRole('button', { name: /02 Diagnose/ }).click();
  await expect(phases.getByRole('button', { name: /02 Diagnose/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByText('A mistake becomes a connection', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '6 bits', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('There’s a useful clue here.')).toBeVisible();
  const reasoning = page.getByRole('button', { name: 'Explore the reasoning', exact: true });
  await reasoning.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Diagnose example' })).toBeFocused();
  await expect(page.getByText('8 index bits', { exact: true })).toBeVisible();

  const fresh = page.getByRole('button', { name: 'Try a fresh retrieval' });
  await fresh.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Recall example' })).toBeFocused();
  const reveal = page.getByRole('button', { name: 'Reveal the reasoning', exact: true });
  await reveal.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Still 8 index bits. Now 7 offset bits.')).toBeVisible();
  await page.getByRole('button', { name: 'Hide the answer' }).click();
  await expect(page.getByText('Still 8 index bits. Now 7 offset bits.')).toBeHidden();

  await page
    .getByRole('group', { name: 'Explore the example', exact: true })
    .getByRole('button', { name: '1 Practice', exact: true })
    .click();
  await expect(page.getByRole('button', { name: '6 bits', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.getByRole('button', { name: '8 bits', exact: true }).click();
  await expect(page.getByText('That’s right.', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Request access', exact: true }).first().click();
  await expect(page).toHaveURL(/\/request-access$/);
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/auth$/);
  expect(errors).toEqual([]);
});

test('motion pauses on request and respects the system reduced-motion setting', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const canvas = page.locator('.observatory-instrument canvas');
  await expect(page.locator('.observatory-instrument .learning-sculpture')).toHaveAttribute(
    'data-ready',
    'true'
  );
  const before = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(before);

  await page.getByRole('button', { name: 'Pause sculpture motion' }).click();
  await expect(page.getByRole('button', { name: 'Resume sculpture motion' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  const paused = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  // Give the renderer several frame opportunities; a paused canvas must stay unchanged.
  await page.waitForTimeout(250);
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).toBe(paused);
  await page.getByRole('button', { name: 'Resume sculpture motion' }).click();
  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(paused);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('.observatory-instrument .learning-sculpture')).toHaveAttribute(
    'data-ready',
    'true'
  );
  await expect(page.getByRole('button', { name: 'Pause sculpture motion' })).toHaveCount(0);
  const still = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.waitForTimeout(250);
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).toBe(still);
  await page
    .getByRole('group', { name: 'Explore the learning loop', exact: true })
    .getByRole('button', { name: /03 Recall/ })
    .click();
  await expect(page.getByText('A return becomes understanding', { exact: true })).toBeVisible();
});

test('the landing page fits narrow screens and both themes keep the method usable', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    );
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page
    .getByRole('group', { name: 'Explore the example', exact: true })
    .getByRole('button', { name: '2 Diagnose', exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Diagnose example' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
