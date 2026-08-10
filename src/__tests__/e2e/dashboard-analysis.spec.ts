import { expect, test, type Page } from '@playwright/test';

async function enterLocalSandbox(page: Page) {
  await page.goto('/');

  const enter = page.getByRole('button', { name: 'Enter local sandbox' });
  await expect(enter).toBeVisible();
  await enter.click();

  const dismiss = page.getByRole('button', { name: 'Skip walkthrough' });
  const walkthroughShown = await dismiss
    .waitFor({ state: 'visible', timeout: 1_500 })
    .then(() => true)
    .catch(() => false);
  if (walkthroughShown) {
    await dismiss.click();
    await expect(dismiss).toBeHidden();
  }

  await expect(page.getByRole('button', { name: /ordered actions\. Open Do now/ })).toBeVisible();
  await expect(page.getByText('Mistake surface', { exact: true })).toBeVisible();
}

test('Dashboard and practical study-loop routes render in the local-first shell', async ({ page }) => {
  await enterLocalSandbox(page);

  const routes = [
    ['/today', 'Do now'],
    ['/capture', 'Quick capture'],
    ['/pyq', 'GATE PYQs'],
    ['/mocks', 'Mock tests'],
    ['/revision-pack', 'Revision pack'],
    ['/syllabus', 'Syllabus tracker'],
    ['/patterns', 'Patterns'],
    ['/reattempts', 'Re-attempts'],
    ['/weekly-review', 'Weekly review'],
    ['/heatmap', 'Weakness heatmap'],
    ['/calibration', 'Calibration'],
    ['/readiness', 'Readiness']
  ] as const;

  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'More', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /ordered actions\. Open Do now/ })).toBeVisible();
});
