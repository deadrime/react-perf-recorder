import { installClaude } from './install';
import path from 'node:path';
import { defaultStatePath, recordPage, saveLogin } from './record';
import { runStdio, section } from './server';
import { superviseStdio } from './supervise';
import { findSession, listSessions, readRecording, resolveDir, waitForSession } from './store';
import { summarize } from '../shared/summary';

const args = process.argv.slice(2);
const command = args[0] ?? 'help';
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dir = resolveDir(flag('dir'));

async function main() {
  if (command === 'mcp') {
    // --reload: the server is a child that is started again whenever this file is rebuilt.
    if (args.includes('--reload')) superviseStdio(process.argv[1], args.filter((a) => a !== '--reload'));
    else await runStdio(dir);
    return;
  }
  if (command === 'init-claude') {
    const root = args[1] && !args[1].startsWith('--') ? path.resolve(args[1]) : process.cwd();
    installClaude(root, args.includes('--force'));
    return;
  }
  if (command === 'list') {
    for (const s of listSessions(dir).slice(0, Number(flag('limit') ?? 20))) {
      console.log(`${s.id}\t${s.status}\t${s.meta.scope?.name ?? 'whole app'}\t${s.meta.page.url}`);
    }
    return;
  }
  if (command === 'show') {
    const ref = args[1] && !args[1].startsWith('--') ? args[1] : 'latest';
    const entry = findSession(dir, ref);
    const name = flag('section') ?? 'summary';
    const hooks = flag('hooks') === 'short' ? 'short' : 'full';
    console.log(JSON.stringify(section(readRecording(entry), name, Number(flag('top') ?? 10), 0, hooks), null, 1));
    return;
  }
  if (command === 'record') {
    const url = args[1];
    if (!url || url.startsWith('--')) {
      console.error('usage: react-perf-recorder record <url> [--ms 3000] [--label x] [--scope {"names":["Row"]}] [--script f.mjs] [--from-load]');
      process.exitCode = 1;
      return;
    }
    const result = await recordPage(
      {
        url,
        ...(flag('ms') ? { ms: Number(flag('ms')) } : {}),
        ...(flag('label') ? { label: flag('label') } : {}),
        ...(flag('scope') ? { scope: flag('scope')!.startsWith('{') ? JSON.parse(flag('scope')!) : flag('scope') } : {}),
        ...(flag('watch') ? { watch: flag('watch')!.split(',') } : {}),
        ...(flag('script') ? { script: flag('script') } : {}),
        ...(flag('viewport') ? { viewport: flag('viewport') } : {}),
        ...(flag('throttle') ? { throttle: Number(flag('throttle')) } : {}),
        ...(flag('state') ? { state: flag('state') } : {}),
        ...(flag('cdp') ? { cdp: flag('cdp') } : {}),
        ...(flag('via') ? { via: flag('via') } : {}),
        fromLoad: args.includes('--from-load'),
        headed: args.includes('--headed'),
      },
      dir
    );
    console.log(JSON.stringify(result, null, 1));
    return;
  }
  if (command === 'login') {
    const url = args[1];
    if (!url || url.startsWith('--')) {
      console.error('usage: react-perf-recorder login <url> [--state file]');
      process.exitCode = 1;
      return;
    }
    const file = flag('state') ?? defaultStatePath(dir);
    const forSelector = flag('for');
    const waitMs = flag('wait');
    // A link that signs itself in — `/debug/<token>` — needs no one at the keyboard: open it, let it settle, save.
    if (forSelector || waitMs) {
      const saved = await saveLogin(
        url,
        file,
        (page) => (forSelector ? page.waitForSelector(forSelector).then(() => {}) : new Promise<void>((r) => setTimeout(r, Number(waitMs)))),
        true
      );
      console.log(`saved the session to ${saved} — recordings use it from now on`);
      return;
    }
    console.error(`A browser is opening ${url}. Sign in there, then press Enter here.`);
    process.stdin.resume();
    const saved = await saveLogin(url, file, () => new Promise<void>((resolve) => process.stdin.once('data', () => resolve())));
    process.stdin.pause();
    console.log(`saved the session to ${saved} — recordings use it from now on`);
    return;
  }
  if (command === 'pull') {
    const entry = await waitForSession(dir, { until: 'done', timeoutMs: Number(flag('timeout') ?? 600_000) });
    if (!entry) {
      console.error('timeout: no finished recording');
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(summarize(readRecording(entry), 5), null, 1));
    return;
  }
  console.log(`react-perf-recorder <command> [--dir <sessions folder>]

  mcp     MCP server over stdio (list_recordings, get_recording, wait_for_recording, compare_recordings, record_page)
          [--reload] start it again whenever the CLI is rebuilt, for a checkout of this repository
  list    sessions, newest first  [--limit 20]
  show    one session  [id|latest] [--section summary|actions|roots|components|causes|plugins|…] [--top 10]
  pull    wait for the next finished recording and print its summary  [--timeout ms]
  record  record a page in a browser of its own  <url> [--ms 3000] [--label x] [--scope json] [--watch A,B]
          [--script f.mjs] [--from-load] [--viewport 1280x800] [--throttle 4] [--state file] [--cdp url] [--via url] [--headed]
  login   keep a session for later recordings  <url> [--state file] [--for <selector> | --wait <ms>]
          without --for/--wait it opens a real browser and waits for you to sign in and press Enter

  init-claude  copy the skill and the agent into <dir>/.claude and register the MCP server  [dir] [--force]

Sessions folder: --dir, then REACT_PERF_RECORDER_DIR, then ./.agent-artifacts/perf-recorder (${dir})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
