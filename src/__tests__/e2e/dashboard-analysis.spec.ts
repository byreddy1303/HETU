import { expect, test, type Page } from '@playwright/test';

async function enterLocalSandbox(page: Page) {
  await page.goto('/');

  const enter = page.getByRole('button', { name: 'Enter local sandbox' });
  await expect(enter).toBeVisible();
  await enter.click();

  const dismiss = page.getByRole('button', { name: 'Skip walkthrough' });
  await expect(dismiss).toBeVisible();
  await dismiss.click();
  await expect(dismiss).toBeHidden();

  await expect(page.getByText('Due now', { exact: true })).toBeVisible();
  await expect(page.getByText('Mistake surface', { exact: true })).toBeVisible();
}

test('Dashboard and every Analysis route render in the local-first shell', async ({ page }) => {
  await enterLocalSandbox(page);

  const routes = [
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
  await expect(page.getByText('Due now', { exact: true })).toBeVisible();
});
