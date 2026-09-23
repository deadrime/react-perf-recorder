import type { RecordingV2, SessionMeta } from './schema';
import { reasonsById, textOf } from './summary';

function topReason(rec: RecordingV2): string {
  const id = rec.roots[0]?.reasons[0]?.[0];
  const reason = id === undefined ? undefined : reasonsById(rec.reasons).get(id);
  return reason ? textOf(reason) : '';
}

/** A finished recording as a listing shows it: kept in the session's metadata, so a listing reads no recording. */
export function listingOf(rec: RecordingV2): NonNullable<SessionMeta['listing']> {
  // It arrives over the network: whatever part of it is missing is shown as nothing, not an error.
  const top = rec.roots?.[0];
  return {
    durationMs: rec.durationMs ?? 0,
    actions: rec.actions?.length ?? 0,
    commits: rec.totals?.commitsInScope ?? 0,
    renders: rec.totals?.renders ?? 0,
    topRoot: top ? `${top.name} ×${top.hits} · ${rec.reasons ? topReason(rec) : ''}` : null,
  };
}
