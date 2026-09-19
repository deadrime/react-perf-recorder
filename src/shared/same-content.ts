export type Same = true | false | 'unknown';

const REACT_ELEMENT = Symbol.for('react.element');
const REACT_TRANSITIONAL_ELEMENT = Symbol.for('react.transitional.element');
// Element internals point into the fiber tree; comparing them would walk the whole app.
const ELEMENT_SKIP = new Set(['_owner', '_store', '_self', '_source', '_debugInfo', '_debugStack', '_debugTask']);

const isElement = (value: object) => {
  const tag = (value as { $$typeof?: symbol }).$$typeof;
  return tag === REACT_ELEMENT || tag === REACT_TRANSITIONAL_ELEMENT;
};

/**
 * Structural equality with a node budget: `true` — same content under different references, `false` — really
 * different, `'unknown'` — too big to tell. Functions count as equal by kind: a new inline callback is not new data.
 */
export function sameContent(a: unknown, b: unknown, budget = 50_000): Same {
  const stack: Array<[unknown, unknown]> = [[a, b]];
  const seen = new WeakMap<object, object>();
  let nodes = 0;
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (Object.is(x, y)) continue;
    if (++nodes > budget) return 'unknown';
    if (typeof x !== typeof y) return false;
    if (typeof x === 'function') continue;
    if (typeof x !== 'object' || x === null || y === null) return false;
    const ox = x as object;
    const oy = y as object;
    if (seen.get(ox) === oy) continue;
    seen.set(ox, oy);
    if (Object.getPrototypeOf(ox) !== Object.getPrototypeOf(oy)) return false;
    if (typeof Node !== 'undefined' && ox instanceof Node) return false;
    if (Array.isArray(ox)) {
      const ay = oy as unknown[];
      if (ox.length !== ay.length) return false;
      for (let i = 0; i < ox.length; i++) stack.push([ox[i], ay[i]]);
    } else if (ox instanceof Date) {
      if (ox.getTime() !== (oy as Date).getTime()) return false;
    } else if (ox instanceof Map) {
      const my = oy as Map<unknown, unknown>;
      if (ox.size !== my.size) return false;
      for (const [k, v] of ox) {
        if (!my.has(k)) return false;
        stack.push([v, my.get(k)]);
      }
    } else if (ox instanceof Set) {
      const sy = oy as Set<unknown>;
      if (ox.size !== sy.size) return false;
      for (const v of ox) if (!sy.has(v)) return false;
    } else if (ArrayBuffer.isView(ox)) {
      const bx = new Uint8Array(ox.buffer, ox.byteOffset, ox.byteLength);
      const view = oy as ArrayBufferView;
      const by = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      if (bx.length !== by.length) return false;
      for (let i = 0; i < bx.length; i++) if (bx[i] !== by[i]) return false;
    } else {
      const element = isElement(ox);
      const keys = Object.keys(ox).filter((k) => !element || !ELEMENT_SKIP.has(k));
      const keysY = Object.keys(oy).filter((k) => !element || !ELEMENT_SKIP.has(k));
      if (keys.length !== keysY.length) return false;
      for (const k of keys) {
        if (!Object.prototype.hasOwnProperty.call(oy, k)) return false;
        stack.push([(ox as Record<string, unknown>)[k], (oy as Record<string, unknown>)[k]]);
      }
    }
  }
  return true;
}
