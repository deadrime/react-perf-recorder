import { useEffect, useRef, type RefObject } from 'react';

export function useClickOutside(ref: RefObject<HTMLElement>, onOutside: () => void, enabled = true) {
  const latest = useRef(onOutside);
  latest.current = onOutside;
  useEffect(() => {
    if (!enabled) return;
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) latest.current();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [ref, enabled]);
}
