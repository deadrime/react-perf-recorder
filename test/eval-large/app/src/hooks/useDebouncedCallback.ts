import { useEffect, useMemo, useRef } from 'react';
import { debounce } from '../lib/debounce';

/** A debounced function that always calls the latest `fn`, and is cancelled on unmount. */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, wait: number) {
  const latest = useRef(fn);
  latest.current = fn;
  const debounced = useMemo(() => debounce((...args: A) => latest.current(...args), wait), [wait]);
  useEffect(() => () => debounced.cancel(), [debounced]);
  return debounced;
}
