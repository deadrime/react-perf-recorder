import { useCallback, useRef, useState } from 'react';

/** Keyboard and pointer highlight for a list of options, with a prop getter per option as headless menu packages do. */
export function useListbox(count: number, onPick: (index: number) => void) {
  const [active, setActive] = useState(0);
  const pick = useRef(onPick);
  pick.current = onPick;
  const activate = useCallback((index: number) => setActive(index), []);
  const choose = useCallback((index: number) => pick.current(index), []);
  const move = (delta: number) => setActive((a) => Math.min(Math.max(a + delta, 0), count - 1));
  const getOptionProps = (index: number) => ({ index, active: index === active, onActivate: activate, onChoose: choose });
  return { active, setActive, move, getOptionProps };
}
