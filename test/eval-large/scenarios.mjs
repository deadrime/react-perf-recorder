// What a person does on the large app to see each bug, recorded as from the panel: Rec, the steps, Stop.
export { launchChromium } from '../eval-plugin/scenarios.mjs';

const settle = (page) => page.waitForTimeout(600);

export const SCENARIOS = {
  /** The issue list left open while teammates work. */
  'wait-issues': {
    route: '/issues',
    ready: 'issue-row',
    steps: 'open the issue list, wait for the issues to load, then leave it alone for a few seconds while teammates work.',
    run: (page) => page.waitForTimeout(5000),
  },
  'wait-board': {
    route: '/board',
    ready: 'card',
    steps: 'open the board, wait for the cards to load, then leave it alone for a few seconds while teammates work.',
    run: (page) => page.waitForTimeout(5000),
  },
  'wait-dashboard': {
    route: '/dashboard',
    ready: 'throughput',
    steps: 'open the dashboard, wait for the chart to load, then leave it alone for a few seconds.',
    run: (page) => page.waitForTimeout(5000),
  },
  /** Typing a search into the issue list. */
  search: {
    route: '/issues',
    ready: 'issue-row',
    steps: 'open the issue list and type "sso login" into the search box above it.',
    run: async (page) => {
      await page.getByTestId('issue-search').pressSequentially('sso login', { delay: 90 });
      await page.waitForTimeout(800);
    },
    typed: { testId: 'issue-search', text: 'sso login' },
  },
  /** The pointer down the issue list, row by row. */
  'hover-rows': {
    route: '/issues',
    ready: 'issue-row',
    steps: 'open the issue list and move the pointer slowly down the first sixteen rows.',
    run: async (page) => {
      const rows = page.getByTestId('issue-row');
      for (let i = 0; i < 16; i++) {
        const box = await rows.nth(i).boundingBox();
        if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
        await page.waitForTimeout(60);
      }
      await settle(page);
    },
  },
  /** Ticking issues in the list one after another, as before a bulk change. */
  'select-rows': {
    route: '/issues',
    ready: 'issue-row',
    steps: 'open the issue list and tick the checkboxes of the first eight issues, one after another.',
    run: async (page) => {
      const rows = page.getByTestId('issue-row');
      for (let i = 0; i < 8; i++) {
        await rows.nth(i).getByRole('checkbox').click();
        await page.waitForTimeout(150);
      }
      await settle(page);
    },
  },
  /** The pointer down the people in the issue list's Assignee filter. */
  'hover-menu': {
    route: '/issues',
    ready: 'issue-row',
    steps: 'open the issue list, open the Assignee filter above it and move the pointer slowly down the list of people.',
    run: async (page) => {
      await page.getByTestId('filter-assignee').locator('.dropdown-trigger').click();
      const options = page.getByTestId('filter-assignee').getByRole('option');
      await options.first().waitFor();
      const count = await options.count();
      for (let i = 0; i < count; i++) {
        const box = await options.nth(i).boundingBox();
        if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
        await page.waitForTimeout(60);
      }
      await settle(page);
    },
  },
  /** Writing a comment on an issue other people have open too. */
  comment: {
    route: '/issues/WEB-2',
    ready: 'comment-input',
    steps: 'open issue WEB-2, click the comment box and type "Looks good to me, merging after lunch".',
    run: async (page) => {
      await page.getByTestId('comment-input').click();
      await page.getByTestId('comment-input').pressSequentially('Looks good to me, merging after lunch', { delay: 90 });
      await settle(page);
    },
    typed: { testId: 'comment-input', text: 'Looks good to me, merging after lunch' },
  },
  /** The pointer across the throughput chart. */
  'hover-chart': {
    route: '/dashboard',
    ready: 'throughput',
    steps: 'open the dashboard and move the pointer slowly across the throughput chart, left to right.',
    run: async (page) => {
      const box = await page.getByTestId('throughput').locator('svg').boundingBox();
      for (let i = 0; i <= 30; i++) {
        await page.mouse.move(box.x + 30 + ((box.width - 60) * i) / 30, box.y + box.height / 2);
        await page.waitForTimeout(50);
      }
      await settle(page);
    },
  },
};

/** The parts of each page a fix must leave in place. */
const PARTS = {
  common: ['sidebar', 'topbar', 'presence', 'sync', 'bell'],
  '/issues': ['toolbar', 'issue-table', 'issue-count'],
  '/board': ['board', 'column-todo', 'column-in_progress', 'card'],
  '/dashboard': ['stats', 'throughput', 'workload', 'activity'],
  '/issues/WEB-2': ['drawer', 'comments', 'composer', 'properties', 'issue-table'],
};

/**
 * Opens the scenario's page, records its steps as from the panel, and returns the recording's id with what the page
 * showed after them: the parts missing and whether what was typed is still there.
 */
export async function recordScenario(page, base, name) {
  const scenario = SCENARIOS[name];
  if (!scenario) throw new Error(`no scenario ${name}`);
  await page.goto(`${base}#${scenario.route}`, { waitUntil: 'load' });
  await page.getByTestId(scenario.ready).first().waitFor();
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__REACT_PERF_RECORDER__.engine.start({ source: 'panel', highlight: false }));
  await scenario.run(page);
  const { id } = await page.evaluate(() => window.__REACT_PERF_RECORDER__.engine.stop());
  if (!id) throw new Error('the recording has no id: the dev server did not save it');
  const parts = [...PARTS.common, ...(PARTS[scenario.route] ?? [])];
  const health = await page.evaluate(
    ({ parts, typed }) => ({
      missing: parts.filter((id) => !document.querySelector(`[data-testid="${id}"]`)),
      typed: typed ? document.querySelector(`[data-testid="${typed.testId}"]`)?.value ?? null : undefined,
    }),
    { parts, typed: scenario.typed }
  );
  const typedOk = !scenario.typed || health.typed === scenario.typed.text;
  return { id, scenario: name, ...health, typedOk, works: health.missing.length === 0 && typedOk };
}
