import type { PerfRecorderPlugin } from '../../vite/plugin-api';

/** Classes emotion inserted during the recording, grouped by label and by what their values differ in. */
export function emotion(): PerfRecorderPlugin {
  return { name: 'emotion', runtime: { module: 'react-perf-recorder/plugins/emotion/runtime' } };
}
