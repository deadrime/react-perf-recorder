import type { PerfRecorderPlugin } from '../../vite/plugin-api';

/** Query cache events (fetch, success, error, invalidate) as causes of the commits that follow them. */
export function reactQuery(): PerfRecorderPlugin {
  return { name: 'react-query', runtime: { module: 'react-perf-recorder/plugins/react-query/runtime' } };
}
