import { chromium, type FullConfig } from '@playwright/test';

/**
 * Opens each fixture once before the run. Vite pre-bundles a dependency the first time a page asks for it and
 * reloads the page when it does, which lands in the middle of whichever test goes first — and a recording that
 * starts from the page load has no page load left to record.
 */
export default async function warmFixtures(config: FullConfig) {
  // A framework that compiles each route on its first request (Next.js) warms every page it has.
  const urls = new Set(
    config.projects
      .filter((project) => project.use.baseURL)
      .flatMap((project) => [project.metadata?.warm ?? '/app'].flat().map((page: string) => `${project.use.baseURL}${page}`))
  );
  const browser = await chromium.launch();
  try {
    for (const url of urls) {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
