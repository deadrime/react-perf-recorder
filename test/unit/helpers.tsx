import { act, type ReactNode } from 'react';
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
