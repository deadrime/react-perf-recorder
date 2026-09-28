// The apps a case's workspace is made from: the chat here (the default) and Orbit, the large app in ../eval-large.
// A case names its app in its scaffold.sh (`--app=large`); scaffold.mjs, verify.mjs and transcripts.mjs read it there.
// Orbit's cases sit in evals-large/, so a run of evals/ stays the chat's (run.sh --eval-dir evals-large runs them).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as chat from './scenarios.mjs';
import * as large from '../eval-large/scenarios.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export const APPS = {
  chat: {
    dir: path.join(here, 'app'),
    bugs: path.join(here, 'bugs'),
    ...chat,
    /** How a first visit knows the page is up. */
    open: async (page, url) => {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.getByTestId('unread').waitFor();
    },
    /** The page the person means, for dev-url.txt. */
    pageUrl: (url) => url,
  },
  large: {
    dir: path.join(here, '../eval-large/app'),
    bugs: path.join(here, '../eval-large/bugs'),
    ...large,
    // The rows are 16 deep in the hover scenario: a smaller window leaves some below the fold.
    viewport: { width: 1440, height: 900 },
    // The fake socket keeps a worker busy, so the network is never idle.
    open: async (page, url) => {
      await page.goto(`${url}#/issues`, { waitUntil: 'load' });
      await page.getByTestId('issue-row').first().waitFor({ timeout: 60_000 });
    },
    pageUrl: (url, scenario) => `${url}#${large.SCENARIOS[scenario]?.route ?? '/issues'}`,
  },
};

export const EVAL_DIRS = ['evals', 'evals-large'].map((dir) => path.join(here, dir));

/** Every case with its folder, in both eval dirs. */
export const caseDirs = () =>
  Object.fromEntries(
    EVAL_DIRS.flatMap((dir) =>
      fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'case.yaml')))
        .map((e) => [e.name, path.join(dir, e.name)])
    )
  );

/** The app, bugs and scenario a case's scaffold.sh gives scaffold.mjs. */
export function scaffoldArgs(script) {
  return {
    bugs: /scaffold\.mjs"?\s+([\w,-]+)/.exec(script)[1],
    scenario: /--recorded=([\w-]+)/.exec(script)?.[1],
    app: /--app=(\w+)/.exec(script)?.[1] ?? 'chat',
  };
}
