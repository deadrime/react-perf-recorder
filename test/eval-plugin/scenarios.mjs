// The person's steps and the recording of them, for the scaffold (the person's recording before a run) and for
// verify.mjs (the same steps on what the agent left).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const SCENARIOS = {
  wait: (page) => page.waitForTimeout(5000),
  type: (page) => page.getByTestId('message').pressSequentially('see you at five', { delay: 90 }),
  // A box that loses focus after every letter: the person clicks it again before each one.
  retype: async (page) => {
    for (const key of 'see you') {
      await page.getByTestId('message').click();
      await page.keyboard.press(key === ' ' ? 'Space' : key);
      await page.waitForTimeout(90);
    }
  },
  tabs: async (page) => {
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('tab-people').click();
      await page.getByTestId('tab-chat').click();
    }
  },
};

/** What the scenario types into the message box, which must be there when it ends. */
export const TYPED = { type: 'see you at five', retype: 'see you' };

/** The parts of the page a fix must leave in place. */
const PARTS = ['header', 'unread', 'timezone', 'messages', 'message', 'send', 'stats', 'members', 'typing'];

/** Chromium from the browsers' folder when there is one: the eval moves HOME, where Playwright would look. */
export function launchChromium(repo, browsers) {
  const build =
    browsers && fs.existsSync(browsers)
      ? fs
          .readdirSync(browsers)
          .filter((d) => /^chromium-\d+$/.test(d))
          .sort()
          .pop()
      : undefined;
  const executablePath = build && path.join(browsers, build, 'chrome-linux/chrome');
  const { chromium } = createRequire(path.join(repo, 'package.json'))('playwright');
  return chromium.launch({ headless: true, ...(executablePath && fs.existsSync(executablePath) ? { executablePath } : {}) });
}

/**
 * Rec, the steps, Stop — as from the panel; the dev server saves the recording in its sessions folder. Returns its id
 * and what the page showed after the steps: the parts missing and what the message box holds.
 */
export async function recordScenario(page, url, scenario) {
  if (!SCENARIOS[scenario]) throw new Error(`no scenario ${scenario}`);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByTestId('unread').waitFor();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__REACT_PERF_RECORDER__.engine.start({ source: 'panel', highlight: false }));
  await SCENARIOS[scenario](page);
  const { id } = await page.evaluate(() => window.__REACT_PERF_RECORDER__.engine.stop());
  if (!id) throw new Error('the recording has no id: the dev server did not save it');
  const health = await page.evaluate((ids) => {
    const input = document.querySelector('[data-testid="message"]');
    return { missing: ids.filter((id) => !document.querySelector(`[data-testid="${id}"]`)), typed: input?.value ?? null };
  }, PARTS);
  return { id, scenario, ...health };
}
