import type { Digest } from '../shared/compare';

export type Corner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

/** How far the panel sits from its corner's two edges, in pixels. */
export interface Offset {
  x: number;
  y: number;
}

export interface PanelState {
  visible?: boolean;
  collapsed: boolean;
  corner: Corner;
  /** Where along the corner's two edges the panel was left; unset means the corner itself. */
  offset?: Offset;
  /** The report is read in a wider panel. */
  wide?: boolean;
  highlight: boolean;
  showLibrary: boolean;
  showProviders: boolean;
  label: string;
  /** Components followed by name through a recording: renders and which root pulled each one. */
  watch: string[];
  lastScope: { names: string[]; label: string } | null;
}

const KEY = 'react-perf-recorder:v1';
const ON_LOAD_KEY = 'react-perf-recorder:record-on-load';
const PREVIOUS_KEY = 'react-perf-recorder:previous';

/** The digest of the last recording in this tab: the next one is compared with it, across reloads and HMR. */
export function takePrevious(next: Digest): Digest | null {
  try {
    const raw = sessionStorage.getItem(PREVIOUS_KEY);
    sessionStorage.setItem(PREVIOUS_KEY, JSON.stringify(next));
    return raw ? (JSON.parse(raw) as Digest) : null;
  } catch {
    return null;
  }
}

export interface RecordOnLoad {
  names?: string[];
  watch?: string[];
  label?: string;
}

/** The panel asks for a reload that records from the first render; the flag is consumed by the next boot. */
export function setRecordOnLoad(value: RecordOnLoad) {
  try {
    sessionStorage.setItem(ON_LOAD_KEY, JSON.stringify(value));
  } catch {
    // See loadState.
  }
}

export function takeRecordOnLoad(): RecordOnLoad | null {
  try {
    const raw = sessionStorage.getItem(ON_LOAD_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(ON_LOAD_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const defaults = (corner: Corner, highlight: boolean): PanelState => ({
  // Open on the first visit: a tool nobody can see is a tool nobody uses. Collapsing it is remembered.
  collapsed: false,
  corner,
  highlight,
  showLibrary: false,
  showProviders: false,
  label: '',
  watch: [],
  lastScope: null,
});

// Storage can throw (private mode, blocked site data): the panel then keeps its state in memory only.
export function loadState(base: PanelState): PanelState {
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return base;
  }
}

export function saveState(state: PanelState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // See loadState.
  }
}
