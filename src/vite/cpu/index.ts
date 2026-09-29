import type { CpuSummary } from '../../shared/cpu';
import { aggregate } from './aggregate';
import { isProfile, isTrace, profileFromTrace, type CpuInput, type CpuProfile } from './profile';
import { resolveFrames, type ModuleSource } from './symbols';

export type { CpuInput, CpuProfile } from './profile';

/** The page's profile as a summary for the recording, and as a DevTools-readable file. */
export async function summarizeCpu(input: CpuInput, server: ModuleSource): Promise<{ summary: CpuSummary; profile: CpuProfile } | { error: string }> {
  const profile =
    input.format === 'cdp' ? (isProfile(input.profile) ? input.profile : null) : isTrace(input.trace) ? profileFromTrace(input.trace) : null;
  if (!profile) return { error: 'the CPU profile sent with the recording is not one' };
  const intervalMs = Number(input.intervalMs) > 0 ? Number(input.intervalMs) : 1;
  const resolved = await resolveFrames(
    profile.nodes.map((n) => n.callFrame),
    server
  );
  return { summary: aggregate(profile, resolved, { source: input.format, intervalMs }), profile };
}
