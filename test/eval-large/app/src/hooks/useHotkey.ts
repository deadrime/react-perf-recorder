import { useEffect, useRef } from 'react';

/** `mod+k`, `escape`, `c`… Ignored while typing in a field unless it has a modifier. */
export function useHotkey(combo: string, handler: (event: KeyboardEvent) => void, enabled = true) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const parts = combo.toLowerCase().split('+');
    const key = parts.pop()!;
    const mod = parts.includes('mod');
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key) return;
      if (mod !== (event.metaKey || event.ctrlKey)) return;
      const target = event.target as HTMLElement;
      if (!mod && key !== 'escape' && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      latest.current(event);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, enabled]);
}
