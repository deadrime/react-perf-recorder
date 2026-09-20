import type { Saved } from '../core/engine';

/** The recording as a file, for when there is no dev server to save it or it has to leave the machine. */
export function downloadJson(rec: Saved) {
  const blob = new Blob([JSON.stringify(rec, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `react-perf-recorder-${rec.id ?? rec.startedAt.replace(/[:.]/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
