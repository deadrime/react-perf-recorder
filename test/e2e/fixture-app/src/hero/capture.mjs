// Captures the landing's hero: walks the real flow on Orbit and saves the panel's markup at each step.
//   npm run dev:pages   (in another terminal; it serves Orbit under orbit/)
//   node test/e2e/fixture-app/src/hero/capture.mjs
// Writes board.webp (the board without the panel) and panel.json next to this file.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const BASE = 'http://localhost:5393/react-perf-recorder/orbit/?tick=150';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
// Small enough to read at half the landing's width: the board with its sidebar folded shows three columns.
const VIEW = { width: 760, height: 760 };
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
const foldSidebar = async () => {
  await page.click('[data-testid="sidebar"] [aria-label="Toggle sidebar"]');
  await page.mouse.move(VIEW.width - 10, VIEW.height - 10);
  await page.waitForTimeout(600);
};

// The backdrop: the board with the panel hidden, as a webdriver sees it without ?rpr=panel.
await page.goto(`${BASE}#/board`);
await page.waitForSelector('[data-testid="card"]');
await foldSidebar();
await page.waitForTimeout(2500);
const png = (await page.screenshot()).toString('base64');
const webp = await page.evaluate(async (png) => {
  const img = new Image();
  img.src = `data:image/png;base64,${png}`;
  await img.decode();
  const canvas = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvas.toDataURL('image/webp', 0.75).split(',')[1];
}, png);
fs.writeFileSync(path.join(here, 'board.webp'), Buffer.from(webp, 'base64'));

await page.goto(`${BASE}&rpr=panel#/board`);
await page.evaluate(() => (localStorage.clear(), sessionStorage.clear()));
await page.reload();
await page.waitForSelector('[data-testid="card"]');
await foldSidebar();
await page.waitForTimeout(1000);

/** The panel as it is drawn now; a checkbox's state is a property, so it is copied to the attribute. */
const snapshot = (hover) =>
  page.evaluate((hover) => {
    const root = document.querySelector('[data-react-perf-recorder]').shadowRoot;
    const live = root.querySelector('.rpr');
    const clone = live.cloneNode(true);
    const inputs = live.querySelectorAll('input');
    clone.querySelectorAll('input').forEach((el, i) => el.toggleAttribute('checked', inputs[i].checked));
    clone.querySelectorAll('[title]').forEach((el) => el.removeAttribute('title'));
    if (hover) clone.querySelector(`.picker li[data-name="${hover}"]`)?.setAttribute('data-hover', 'true');
    return clone.outerHTML;
  }, hover);

const centre = async (selector) => {
  const b = await page.locator(selector).first().boundingBox();
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
};
const panel = (selector) => `[data-react-perf-recorder] ${selector}`;

const board = await page.evaluate(() => {
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  };
  const card = document.querySelector('[data-testid="card"][data-key="WEB-32"]');
  const column = card.closest('.column');
  const body = column.querySelector('.column-body').getBoundingClientRect();
  const cards = [...column.querySelectorAll('[data-testid="card"]')].map(r).filter((c) => c.y + c.h <= body.bottom);
  return { target: r(card), column: r(column), cards };
});

const out = { view: VIEW, board, clicks: {}, html: {}, rec: [], recAt: [] };
out.html.idle = await snapshot();
out.clicks.pick = await centre(panel('[data-rpr="pick"]'));
await page.click(panel('[data-rpr="pick"]'));
await page.waitForTimeout(400);
out.html.browsing = await snapshot();
out.clicks.card = { x: board.target.x + 110, y: board.target.y + 62 };
await page.mouse.click(out.clicks.card.x, out.clicks.card.y);
await page.waitForTimeout(500);
out.html.child = await snapshot();
const row = panel('.picker li[data-name="BoardColumn"] .name');
out.clicks.row = await centre(row);
out.html.hoverParent = await snapshot('BoardColumn');
await page.click(row);
await page.waitForTimeout(500);
out.html.parent = await snapshot();
out.clicks.rec = await centre(panel('[data-rpr="record"]'));
await page.mouse.move(VIEW.width / 2, VIEW.height - 10);
await page.click(panel('[data-rpr="record"]'));
const started = Date.now();
for (let i = 1; i <= 20; i++) {
  await page.waitForTimeout(Math.max(0, started + i * 500 - Date.now()));
  out.recAt.push(Date.now() - started);
  out.rec.push(await snapshot());
}
out.clicks.stop = await centre(panel('[data-rpr="stop"]'));
await page.click(panel('[data-rpr="stop"]'));
await page.waitForTimeout(1500);
out.html.report = await snapshot();

/** Where the report's parts are, from the top of its content (not of the card, which scrolls), and how far it scrolls. */
const layout = () =>
  page.evaluate(() => {
    const root = document.querySelector('[data-react-perf-recorder]').shadowRoot;
    const card = root.querySelector('.card');
    const top = card.getBoundingClientRect().top - card.scrollTop;
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.top - top), w: Math.round(b.width), h: Math.round(b.height) };
    };
    const fold = (title) => [...root.querySelectorAll('details.fold')].find((d) => d.querySelector('.fold-title')?.textContent === title);
    const b = card.getBoundingClientRect();
    return {
      card: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
      scrollable: card.scrollHeight - card.clientHeight,
      kpis: r(root.querySelector('.kpis')),
      rendered: r(root.querySelector('.verdict .stat')),
      memos: r(fold('Memos that miss')),
      memosSummary: r(fold('Memos that miss')?.querySelector('summary')),
      others: r(fold('Other roots')),
      timeline: r(fold('Timeline')),
      tracks: r(root.querySelector('.timeline')),
      bar: r(root.querySelector('.tl-bar[data-picked="true"]')),
      detail: r(root.querySelector('.tl-detail')),
    };
  });

out.report = { plain: await layout() };
const memos = panel('details.fold:has(.fold-title) > summary >> text=Memos that miss');
await page.click(memos);
await page.waitForTimeout(300);
out.html.reportMemos = await snapshot();
out.report.memos = await layout();
await page.click(memos);
await page.waitForTimeout(300);

// A commit of the busiest cascade root, picked on the timeline: the panel outlines where its root renders on the page.
const bars = page.locator(panel('.tl-lane:not(.tl-actions)')).nth(1).locator('.tl-bar');
let tallest = 0;
for (let i = 0, most = -1; i < (await bars.count()); i++) {
  const h = (await bars.nth(i).boundingBox())?.height ?? 0;
  if (h > most) [most, tallest] = [h, i];
}
await bars.nth(tallest).click();
await page.waitForTimeout(500);
out.html.reportCommit = await snapshot();
out.report.commit = await layout();
// The outlines as the overlay drew them: its canvas, transparent around them.
const pinned = await page.evaluate(
  () =>
    document.querySelector('[data-react-perf-recorder]').shadowRoot.querySelector('[data-rpr="overlay"]').toDataURL('image/webp', 0.8).split(',')[1]
);
fs.writeFileSync(path.join(here, 'pinned.webp'), Buffer.from(pinned, 'base64'));
out.clicks.dismiss = await centre(panel('.result-bar button:last-child'));
fs.writeFileSync(path.join(here, 'panel.json'), JSON.stringify(out));
await browser.close();
