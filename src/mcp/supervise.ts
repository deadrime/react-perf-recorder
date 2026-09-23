import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

type Message = { id?: string | number; method?: string };

const parse = (line: string): Message | null => {
  try {
    return JSON.parse(line) as Message;
  } catch {
    return null;
  }
};

/**
 * `mcp --reload`: the MCP server for a checkout of this repository, where `dist/cli.js` is rebuilt under a running
 * assistant. A server keeps the code it started with, and until someone reconnects it reads recordings with
 * yesterday's code — once that meant reason ids where words should be. So the client talks to this process instead,
 * and the server runs as its child: when the file changes the child is started again, handed the client's own
 * `initialize` once more (its answer goes nowhere, the client already has one), and the client is told the tools
 * may have changed. A call that was running when the file changed gets an error that says to call again.
 *
 * Messages are single JSON lines each way, which is how the stdio transport of MCP frames them.
 */
export function superviseStdio(script: string, childArgs: string[]) {
  const pending = new Set<string | number>();
  const queue: string[] = [];
  let child: ChildProcess | null = null;
  let ready = false;
  let initialize: string | null = null;
  let initialized: string | null = null;
  let replaying: string | number | undefined;
  let stamp = mtime(script);

  const toClient = (message: object) => process.stdout.write(`${JSON.stringify(message)}\n`);
  const flush = () => {
    ready = true;
    while (queue.length && child?.stdin) child.stdin.write(`${queue.shift()}\n`);
  };

  const start = (replay: boolean) => {
    const current = spawn(process.execPath, [script, ...childArgs], { stdio: ['pipe', 'pipe', 'inherit'] });
    child = current;
    readline.createInterface({ input: current.stdout! }).on('line', (line) => {
      const message = parse(line);
      if (replaying !== undefined && message?.id === replaying && !message.method) {
        // The answer to the replayed handshake: finish it, then let the client's calls through again.
        replaying = undefined;
        if (initialized) current.stdin!.write(`${initialized}\n`);
        flush();
        toClient({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
        return;
      }
      if (message && message.id !== undefined && !message.method) pending.delete(message.id);
      process.stdout.write(`${line}\n`);
    });
    current.on('exit', (code) => {
      // Stopped by us to start a new one: nothing to report. Otherwise the server is gone, and so is this.
      if (child === current) process.exit(code ?? 1);
    });
    if (replay && initialize) {
      replaying = parse(initialize)?.id;
      current.stdin!.write(`${initialize}\n`);
    } else flush();
  };

  const restart = () => {
    ready = false;
    const old = child;
    child = null;
    old?.kill();
    for (const id of pending)
      toClient({ jsonrpc: '2.0', id, error: { code: -32603, message: 'react-perf-recorder was rebuilt while this ran; call it again' } });
    pending.clear();
    process.stderr.write(`react-perf-recorder: ${path.basename(script)} changed, the MCP server restarted\n`);
    start(true);
  };

  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    const message = parse(line);
    if (message?.method === 'initialize') initialize = line;
    if (message?.method === 'notifications/initialized') initialized = line;
    if (message?.method && message.id !== undefined) pending.add(message.id);
    if (ready && child?.stdin) child.stdin.write(`${line}\n`);
    else queue.push(line);
  });
  process.stdin.on('end', () => {
    const last = child;
    child = null;
    last?.kill();
    process.exit(0);
  });

  // Polled rather than watched: the build removes the whole of `dist` first, and a watch on a removed folder goes
  // quiet for good. A build also writes the file more than once; the server is started again once it has settled.
  let timer: ReturnType<typeof setTimeout> | null = null;
  fs.watchFile(script, { interval: 400 }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const next = mtime(script);
      if (!next || next === stamp) return;
      stamp = next;
      restart();
    }, 400);
  });

  start(false);
}

function mtime(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}
