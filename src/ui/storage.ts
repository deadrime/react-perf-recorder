export type Corner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface PanelState {
  visible?: boolean;
  collapsed: boolean;
  corner: Corner;
  highlight: boolean;
  showWrappers: boolean;
  label: string;
  /** Components followed by name through a recording: renders and which root pulled each one. */
  watch: string[];
  lastScope: { names: string[]; label: string } | null;
}

const KEY = 'react-perf-recorder:v1';
const ON_LOAD_KEY = 'react-perf-recorder:record-on-load';

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
  collapsed: true,
  corner,
  highlight,
  showWrappers: false,
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
