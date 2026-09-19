export type Corner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface PanelState {
  visible?: boolean;
  collapsed: boolean;
  corner: Corner;
  highlight: boolean;
  showWrappers: boolean;
  label: string;
  lastScope: { names: string[]; label: string } | null;
}

const KEY = 'react-perf-recorder:v1';

export const defaults = (corner: Corner, highlight: boolean): PanelState => ({
  collapsed: true,
  corner,
  highlight,
  showWrappers: false,
  label: '',
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
