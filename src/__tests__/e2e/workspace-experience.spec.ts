import { expect, test, type Page } from '@playwright/test';

const INTERIOR_ROUTES = [
  { path: '/today', label: 'Do now', heading: 'Do now' },
  { path: '/pyq', label: 'PYQ practice', heading: 'GATE PYQs' },
  { path: '/session/new', label: 'Session', heading: 'New session' },
  { path: '/log', label: 'Log', heading: 'Log a question' },
  { path: '/planner', label: 'Planner', heading: 'Planner' },
  { path: '/capture', label: 'Quick capture', heading: 'Quick capture' },
  { path: '/mocks', label: 'Mock tests', heading: 'Mock tests' },
  { path: '/buddy', label: 'Buddy', heading: 'Buddy' },
  { path: '/journal', label: 'Journal', heading: 'Journal' },
  { path: '/patterns', label: 'Patterns', heading: 'Patterns' },
  { path: '/reattempts', label: 'Re-attempts', heading: 'Re-attempts' },
  { path: '/weekly-review', label: 'Weekly review', heading: 'Weekly review' },
  { path: '/heatmap', label: 'Heatmap', heading: 'Weakness heatmap' },
  { path: '/calibration', label: 'Calibration', heading: 'Calibration' },
  { path: '/readiness', label: 'Readiness', heading: 'Readiness' },
  { path: '/topper-notes', label: 'Topper notes', heading: 'GATE Topper Notes' },
  { path: '/revision-pack', label: 'Revision pack', heading: 'Revision pack' },
  { path: '/syllabus', label: 'Syllabus tracker', heading: 'Syllabus tracker' },
  { path: '/trigger-drill', label: 'Trigger drill', heading: 'Trigger drill' },
  { path: '/formulas', label: 'Formulas', heading: 'Formulas' },
  { path: '/settings', label: 'Settings', heading: 'Settings' }
] as const;

async function enterSandbox(page: Page) {
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Enter local sandbox' }).click();
  await page.getByRole('button', { name: 'Skip walkthrough' }).click();
  await expect(page.getByRole('button', { name: /ordered actions\. Open Do now/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip walkthrough' })).toBeHidden();
}

async function assertNoPageOverflow(page: Page, route: string) {
  await page.evaluate(() => document.fonts.ready);
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  expect(
    dimensions.document,
    `${route} document overflows ${dimensions.viewport}px viewport`
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(
    dimensions.body,
    `${route} body overflows ${dimensions.viewport}px viewport`
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test('section search supports both shortcuts, real navigation, focus containment, and focus return', async ({
  page
}) => {
  await enterSandbox(page);
  const trigger = page.getByRole('button', { name: 'Search sections', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Find your next step' });
  const input = dialog.getByRole('textbox', { name: 'Search sections' });

  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Close search' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('button', { name: 'Settings Workspace', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close search' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.keyboard.press('Control+k');
  await expect(input).toBeFocused();
  await input.fill('weekly');
  await expect(dialog.getByRole('button', { name: 'Weekly review Reflect' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Formulas Library' })).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('button', { name: 'Weekly review Reflect' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/weekly-review$/);
  await expect(page.getByRole('heading', { name: 'Weekly review', exact: true })).toBeVisible();
  await expect(dialog).toBeHidden();

  await page.keyboard.press('Meta+k');
  await expect(input).toBeFocused();
  await input.fill('no-such-study-section');
  await expect(dialog.getByText(/No sections match/)).toBeVisible();
  await input.fill('equations');
  await expect(dialog.getByRole('button', { name: 'Formulas Library' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/formulas$/);
  await expect(page.getByRole('heading', { name: 'Formulas', exact: true })).toBeVisible();
});

test('sidebar collapse removes hidden links and visible theme controls persist a choice', async ({
  page
}) => {
  await enterSandbox(page);
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation).toBeVisible();
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(navigation).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.getByRole('main').focus();
  await page.keyboard.press('Control+b');
  await expect(navigation).toBeVisible();

  const before = await page.locator('html').getAttribute('data-theme');
  await page.getByRole('button', { name: /Switch to (light|dark) mode/ }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    before === 'dark' ? 'light' : 'dark'
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    before === 'dark' ? 'light' : 'dark'
  );
  await expect(page.getByRole('button', { name: /Switch to (light|dark) mode/ })).toBeVisible();
});

test('mobile all-sections navigation reaches every destination and returns focus when dismissed', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterSandbox(page);
  const menu = page.getByRole('dialog', { name: 'All sections', exact: true });
  const more = page.getByRole('button', { name: 'More sections', exact: true });
  await more.click();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(menu.getByRole('button', { name: 'Sign out', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('mobile-all-sections.png') });
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();

  const dockRoutes = ['/session/new', '/log', '/planner'];
  for (const route of INTERIOR_ROUTES.filter((item) => !dockRoutes.includes(item.path))) {
    await test.step(`Open ${route.label} from mobile navigation`, async () => {
      await more.click();
      const link = menu.getByRole('link', { name: route.label, exact: true });
      await expect(link).toHaveAttribute('href', route.path);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${route.path}$`));
      await expect(menu).toBeHidden();
      await expect(page.getByRole('heading', { name: route.heading, exact: true })).toBeVisible();
    });
  }
  const primary = page.getByRole('navigation', { name: 'Primary navigation' });
  for (const [label, path, heading] of [
    ['Log', '/log', 'Log a question'],
    ['Planner', '/planner', 'Planner'],
    ['Start session', '/session/new', 'New session']
  ]) {
    await primary.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await primary.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('button', { name: /ordered actions\. Open Do now/ })).toBeVisible();
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 }
]) {
  test(`interior routes stay inside a ${viewport.width}px viewport in both themes`, async ({
    page
  }, testInfo) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterSandbox(page);
    await assertNoPageOverflow(page, 'Dashboard');
    for (const theme of ['light', 'dark']) {
      if ((await page.locator('html').getAttribute('data-theme')) !== theme) {
        await page.getByRole('button', { name: `Switch to ${theme} mode`, exact: true }).click();
      }
      for (const route of INTERIOR_ROUTES) {
        await test.step(`${theme}: ${route.label}`, async () => {
          await page.goto(route.path);
          await expect(
            page.getByRole('heading', { name: route.heading, exact: true })
          ).toBeVisible();
          await assertNoPageOverflow(page, `${theme} ${route.path}`);
          if (['/planner', '/patterns', '/settings'].includes(route.path)) {
            await page.screenshot({
              path: testInfo.outputPath(`${theme}-${route.path.slice(1)}-${viewport.width}.png`)
            });
          }
        });
      }
    }
    expect(errors).toEqual([]);
  });
}

test('shared tabs use roving focus, wrap with arrows, and select with Home and End', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/primitives');
  const tabs = page.getByRole('tablist');
  const first = tabs.getByRole('tab', { name: 'Patterns', exact: true });
  const second = tabs.getByRole('tab', { name: 'Re-attempts', exact: true });
  const last = tabs.getByRole('tab', { name: 'Weekly', exact: true });
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await expect(first).toHaveAttribute('tabindex', '-1');
  await expect(page.getByText('active: two', { exact: true })).toBeVisible();
  await page.keyboard.press('End');
  await expect(last).toBeFocused();
  await expect(page.getByText('active: three', { exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(last).toBeFocused();
  await page.keyboard.press('Home');
  await expect(first).toBeFocused();
  await expect(page.getByText('active: one', { exact: true })).toBeVisible();
  await expect(tabs.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
});
