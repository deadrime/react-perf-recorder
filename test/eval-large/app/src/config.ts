const params = new URLSearchParams(location.search);

/** How often the realtime socket delivers an event; `?tick=` speeds the demo workspace up or slows it down. */
export const TICK_MS = Number(params.get('tick') ?? 400);

/** The members list is polled for presence and profile changes. */
export const MEMBERS_POLL_MS = TICK_MS * 12;

/** Simulated network latency of the fake API. */
export const API_LATENCY_MS = Number(params.get('latency') ?? 60);

export const PAGE_SIZE = 60;
