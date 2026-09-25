import path from 'node:path';
import { act, version, type ReactNode } from 'react';
import { reasonTexts } from '../../src/shared/summary';
import { createRoot, type Root } from 'react-dom/client';
import { PluginHost, type PluginEntry } from '../../src/core/plugins';
import { Recorder, type EngineConfig, type RecordOptions } from '../../src/core/recorder';
import type { SessionEvent } from '../../src/shared/schema';

export const config: EngineConfig = {
  version: 'test',
  projectRoot: '',
  wrapperPattern: '^(Anonymous|ForwardRef|Memo)$',
  actions: { values: false, secretSelector: '' },
  maxDurationMs: 600_000,
  bigCommit: 150,
  timelineLimit: 5000,
};

export function mount(ui: ReactNode) {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(ui);
  });
  return {
    container,
    rerender: (next: ReactNode) => act(() => root.render(next)),
    unmount: () => act(() => root.unmount()),
  };
}

export function makeRecorder(options: RecordOptions = {}, plugins: PluginEntry[] = []) {
  const host = new PluginHost(plugins);
  host.setupAll();
  const events: SessionEvent[] = [];
  const recorder = new Recorder(
    { config, plugins: host, ownHost: null, highlight: null, onEvent: (e) => events.push(e) },
    { source: 'test', ...options }
  );
  return { recorder, events, host };
}

export const flush = (fn: () => void) => act(fn);

/** Reasons of a root or a component as sentences; the recording keeps them once and points at them by id. */
export const reasonsOf = (rec: { reasons: Parameters<typeof reasonTexts>[0]['reasons'] }, stat: { reasons: Array<[number, number]> }) =>
  reasonTexts(rec, stat).map(([text]) => text);

export const reasonPairs = (rec: { reasons: Parameters<typeof reasonTexts>[0]['reasons'] }, stat: { reasons: Array<[number, number]> }) =>
  reasonTexts(rec, stat);

/** The node_modules of the React under test: a module written there imports that React, as a package's file does. */
export const nodeModules = () => path.resolve(__dirname, version.startsWith('19') ? '../react19/node_modules' : '../../node_modules');
