/** Where record_page leaves the injected recorder its settings, in front of the script itself. */
export const INJECT_KEY = '__REACT_PERF_RECORDER_INJECT__';

export interface InjectConfig {
  /** The app's folder: React 18 names a component's file by its absolute path. */
  projectRoot: string;
  /** Set by the page: `aside` when the plugin's own recorder turned out to be there. */
  state?: 'booted' | 'aside';
}

/** Where record_page leaves each bundled script's sources by line, as the page loads it. */
export const SCRIPTS_KEY = '__REACT_PERF_RECORDER_SCRIPTS__';

/** `s`: the sources as paths from the root; `l`: pairs of first generated line and index in `s`, -1 for none. */
export interface ScriptSources {
  s: string[];
  l: number[];
}
