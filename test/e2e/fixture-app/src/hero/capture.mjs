// Captures the landing's hero: walks the real flow on Orbit and saves the panel's markup at each step.
//   npx vite --config test/eval-large/vite.config.ts   (in another terminal)
//   node test/e2e/fixture-app/src/hero/capture.mjs
// Writes board.webp (the board without the panel) and panel.json next to this file.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const BASE = 'http://localhost:5394/?tick=150';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

// The backdrop: the board with the panel hidden, as a webdriver sees it without ?rpr=panel.
await page.goto(`${BASE}#/board`);
await page.waitForSelector('[data-testid="card"]');
await page.mouse.move(1270, 790);
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
await page.waitForTimeout(1500);

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

const out = { board, clicks: {}, html: {}, rec: [], recAt: [] };
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
await page.mouse.move(640, 790);
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
out.clicks.dismiss = await centre(panel('.result-bar button:last-child'));
out.report = await page.evaluate(() => {
  const root = document.querySelector('[data-react-perf-recorder]').shadowRoot;
  const card = root.querySelector('.card');
  const top = card.getBoundingClientRect().top;
  const at = (selector) => Math.round(root.querySelector(selector).getBoundingClientRect().top - top);
  const b = card.getBoundingClientRect();
  return {
    card: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
    scrollable: card.scrollHeight - card.clientHeight,
    verdict: at('[data-rpr="verdict"]'),
    memo: at('[data-rpr="memo"]'),
    causes: at('[data-rpr="causes"]'),
  };
});
fs.writeFileSync(path.join(here, 'panel.json'), JSON.stringify(out));
await browser.close();
