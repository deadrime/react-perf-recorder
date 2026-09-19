import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import { compareRecordings } from '../shared/compare';
import { hookText, rootLine, summarize } from '../shared/summary';
import type { RecordingV1 } from '../shared/schema';
import { findSession, listSessions, readRecording, waitForSession } from './store';

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';

const SECTIONS = [
  'summary',
  'actions',
  'roots',
  'outside',
  'causes',
  'components',
  'watch',
  'zones',
  'timeline',
  'segments',
  'frames',
  'navigations',
  'conditions',
  'warnings',
  'plugins',
] as const;

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }] });

export function section(rec: RecordingV1 & { id?: string; status?: string }, name: string, top: number, offset: number) {
  const page = <T>(list: T[]) => ({ total: list.length, offset, items: list.slice(offset, offset + top) });
  const ms = rec.durationMs;
  switch (name) {
    case 'summary':
      return summarize(rec, top);
    case 'actions': {
      const actions = new Map(rec.actions.map((a) => [a.id, a]));
      const roots = [...rec.roots, ...rec.outsideRoots];
      return page(
        rec.segments.map((s) => ({
          ...s,
          action: actions.get(s.action),
          topRoots: s.topRoots.map(([i, n]) => ({
            root: roots[i]?.name,
            renders: n,
            reason: roots[i]?.reasons[0]?.[0],
            hook: roots[i] ? hookText(roots[i].hooks?.[/#(\d+)/.exec(roots[i].reasons[0]?.[0] ?? '')?.[1] ?? '']) : '',
          })),
        }))
      );
    }
    case 'roots':
      return page(rec.roots.map((r) => ({ ...rootLine(r, ms), hooks: r.hooks })));
    case 'outside':
      return page(rec.outsideRoots.map((r) => ({ ...rootLine(r, ms), scopeRenders: r.scopeRenders })));
    case 'causes':
      return page(rec.causes);
    case 'components':
      return page(rec.components);
    case 'timeline':
      return { truncated: rec.timeline.truncated, ...page(rec.timeline.entries) };
    case 'segments':
      return page(rec.segments);
    case 'frames':
      return { longTasks: rec.frames.longTasks, ...page(rec.frames.loaf.slice().sort((a, b) => b.duration - a.duration)) };
    case 'navigations':
      return page(rec.navigations);
    case 'conditions':
      return { conditions: rec.conditions, conditionsChanged: rec.conditionsChanged ?? {}, page: rec.page };
    case 'warnings':
      return { warnings: rec.warnings, errors: rec.errors };
    case 'watch':
      return rec.watch ?? {};
    case 'zones':
      return rec.zones ?? {};
    case 'plugins':
      return Object.fromEntries(
        Object.entries(rec.plugins).map(([n, s]) => [
          n,
          {
            version: s.version,
            highlights: s.highlights ?? [],
            metrics: Object.entries(s.metrics ?? {})
              .sort((a, b) => b[1].value - a[1].value)
              .slice(0, top),
          },
        ])
      );
    default: {
      const plugin = /^plugin:(.+)$/.exec(name)?.[1];
      if (plugin && rec.plugins[plugin]) {
        const text = JSON.stringify(rec.plugins[plugin]);
        return text.length > 40_000 ? { truncated: true, text: text.slice(0, 40_000) } : rec.plugins[plugin];
      }
      throw new Error(`unknown section ${name}; one of ${SECTIONS.join(', ')} or plugin:<name>`);
    }
  }
}

export function createServer(dir: string) {
  const server = new McpServer({ name: 'react-perf-recorder', version: VERSION });

  server.registerTool(
    'list_recordings',
    {
      description:
        'Sessions recorded with the react-perf-recorder panel or scripts, newest first. status: recording (still running), done, interrupted (page reloaded or closed). Each has the area (scope), commits, renders and the top cascade root.',
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional(),
        status: z.enum(['recording', 'done', 'interrupted']).optional(),
        scope: z.string().optional(),
        source: z.string().optional(),
      },
    },
    async ({ limit = 20, status, scope, source }) => {
      const sessions = listSessions(dir).filter(
        (s) =>
          (!status || s.status === status) && (!scope || (s.meta.scope?.name ?? '').includes(scope)) && (!source || s.meta.source.includes(source))
      );
      return json({
        dir,
        total: sessions.length,
        recordings: sessions.slice(0, limit).map((s) => {
          const rec = s.hasRecording || s.status !== 'done' ? readRecording(s) : null;
          return {
            id: s.id,
            status: s.status,
            createdAt: s.meta.createdAt,
            source: s.meta.source,
            ...(s.meta.label ? { label: s.meta.label } : {}),
            url: s.meta.page.url,
            area: s.meta.scope?.name ?? 'whole app',
            durationSec: rec ? +(rec.durationMs / 1000).toFixed(1) : null,
            actions: rec?.actions.length ?? 0,
            commits: rec?.totals.commitsInScope ?? 0,
            renders: rec?.totals.renders ?? 0,
            topRoot: rec?.roots[0] ? `${rec.roots[0].name} ×${rec.roots[0].hits} · ${rec.roots[0].reasons[0]?.[0] ?? ''}` : null,
            plugins: s.meta.plugins.map((p) => p.name),
            bytes: s.bytes,
          };
        }),
      });
    }
  );

  server.registerTool(
    'get_recording',
    {
      description: `One session. id: an id from list_recordings, "latest" or "latest-1". section: ${SECTIONS.join(
        ', '
      )}, or plugin:<name> for a plugin's raw data. The default summary has totals, top cascade roots with reasons and hook names, roots outside the area, causes (store actions, queries) and the most expensive user actions. A running or interrupted session is rebuilt from its events (partial). The answer carries the session folder for grep.`,
      inputSchema: {
        id: z.string().default('latest'),
        section: z.string().optional(),
        top: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async ({ id, section: name = 'summary', top = 10, offset = 0 }) => {
      const entry = findSession(dir, id);
      const rec = readRecording(entry);
      return json({
        id: entry.id,
        status: entry.status,
        dir: entry.dir,
        ...(rec.partial ? { partial: true } : {}),
        [name]: section(rec, name, top, offset),
      });
    }
  );

  server.registerTool(
    'wait_for_recording',
    {
      description:
        'Blocks until the user starts (until: "started") or finishes (until: "done", default) a recording in the browser, then returns its summary. Use when you asked the user to record a scenario with the panel. Returns status "timeout" after timeoutMs; call again to keep waiting.',
      inputSchema: {
        timeoutMs: z.number().int().min(1000).max(600_000).optional(),
        afterId: z.string().optional(),
        until: z.enum(['started', 'done']).optional(),
      },
    },
    async ({ timeoutMs = 120_000, afterId, until = 'done' }, extra) => {
      const progressToken = extra._meta?.progressToken;
      const entry = await waitForSession(dir, {
        afterId,
        until,
        timeoutMs,
        signal: extra.signal,
        onTick: (waited) => {
          if (progressToken !== undefined) {
            void extra.sendNotification({ method: 'notifications/progress', params: { progressToken, progress: waited, total: timeoutMs } } as never);
          }
        },
      });
      if (!entry) return json({ status: 'timeout', waitedMs: timeoutMs, dir });
      const rec = readRecording(entry);
      return json({ status: entry.status, id: entry.id, dir: entry.dir, summary: summarize(rec, 5) });
    }
  );

  server.registerTool(
    'compare_recordings',
    {
      description:
        'Before/after of two sessions: totals per second and per commit, cascade roots (new, gone, changed by cascade per second), causes, the same user actions (renders, renders per char, latency) and plugin metrics. Warns when viewport, page, area, conditions or durations differ.',
      inputSchema: {
        before: z.string(),
        after: z.string().default('latest'),
        top: z.number().int().min(1).max(50).optional(),
        match: z.enum(['key', 'name']).optional(),
      },
    },
    async ({ before, after, top, match }) => {
      const a = readRecording(findSession(dir, before));
      const b = readRecording(findSession(dir, after));
      return json(compareRecordings(a, b, { top, match }));
    }
  );

  return server;
}

export async function runStdio(dir: string, transport: Transport = new StdioServerTransport()) {
  const server = createServer(dir);
  await server.connect(transport);
  return server;
}
