import { runStdio, section } from './server';
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
    await runStdio(dir);
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
    console.log(JSON.stringify(section(readRecording(entry), name, Number(flag('top') ?? 10), 0), null, 1));
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

  mcp     MCP server over stdio (list_recordings, get_recording, wait_for_recording, compare_recordings)
  list    sessions, newest first  [--limit 20]
  show    one session  [id|latest] [--section summary|actions|roots|components|causes|plugins|…] [--top 10]
  pull    wait for the next finished recording and print its summary  [--timeout ms]

Sessions folder: --dir, then REACT_PERF_RECORDER_DIR, then ./.agent-artifacts/perf-recorder (${dir})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
