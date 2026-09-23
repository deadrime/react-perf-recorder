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
 * `mcp --reload`: a running server keeps the code it started with, so it runs as a child that is restarted when
 * `dist/cli.js` changes and handed the client's `initialize` again; a call cut by the restart is told to call again.
 */
export function superviseStdio(script: string, childArgs: string[]) {
  const pending = new Set<string | number>();
  const queue: string[] = [];
  let child: ChildProcess | null = null;
  let ready = false;
  let initialize: string | null = null;
  let initialized: string | null = null;
  let replaying: string | number | undefined;
  /** The client has its answer to initialize: a replayed one goes nowhere; until then it is the client's. */
  let initAnswered = false;
  let stamp = mtime(script);

  const toClient = (message: object) => process.stdout.write(`${JSON.stringify(message)}\n`);
  const flush = () => {
    ready = true;
    while (queue.length && child?.stdin) child.stdin.write(`${queue.shift()}\n`);
  };

  const start = (replay: boolean) => {
    const current = spawn(process.execPath, [script, ...childArgs], { stdio: ['pipe', 'pipe', 'inherit'] });
    child = current;
    // A child that was stopped may still write a line or refuse one: neither may reach the client or stop this.
    current.stdin!.on('error', () => {});
    readline.createInterface({ input: current.stdout! }).on('line', (line) => {
      if (child !== current) return;
      const message = parse(line);
      if (replaying !== undefined && message?.id === replaying && !message.method) {
        // The answer to the replayed handshake: finish it, then let the client's calls through again.
        replaying = undefined;
        if (initialized) current.stdin!.write(`${initialized}\n`);
        flush();
        if (initAnswered) toClient({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
        else {
          // The client was still connecting when the server restarted: this is the answer it is waiting for.
          initAnswered = true;
          pending.delete(message.id!);
          process.stdout.write(`${line}\n`);
        }
        return;
      }
      if (message && message.id !== undefined && !message.method) {
        pending.delete(message.id);
        if (initialize && message.id === parse(initialize)?.id) initAnswered = true;
      }
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
    const initId = initialize ? parse(initialize)?.id : undefined;
    for (const id of pending) {
      // An unanswered initialize is answered by the new server; every other call is asked to be made again.
      if (id === initId) continue;
      toClient({ jsonrpc: '2.0', id, error: { code: -32603, message: 'react-perf-recorder was rebuilt while this ran; call it again' } });
      pending.delete(id);
    }
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
