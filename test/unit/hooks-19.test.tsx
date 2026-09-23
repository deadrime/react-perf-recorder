import * as React from 'react';
import { useState } from 'react';
import { compositeChain, fiberFromNode } from '../../src/core/fiber';
import { inspectHooks } from '../../src/core/hook-names';
import { hookTypeAt } from '../../src/core/reasons';
import { mount } from './helpers';

const react = React as unknown as {
  useOptimistic?: <T>(value: T) => [T, (next: T) => void];
  useActionState?: <S>(action: (state: S) => S, initial: S) => [S, () => void, boolean];
};
const onReact19 = typeof react.useActionState === 'function' && typeof react.useOptimistic === 'function';

/** React 19's own hooks: skipped on 18, where they do not exist. */
(onReact19 ? describe : describe.skip)('hooks React 19 added', () => {
  it('names them, and keeps the cells after them in step', () => {
    const useOptimistic = react.useOptimistic!;
    const useActionState = react.useActionState!;
    const useTicket = (n: number) => useOptimistic(n)[0];
    const Modern = () => {
      const [n] = useState(1);
      const ticket = useTicket(n);
      const [state] = useActionState(() => 'done', 'init');
      const [tail] = useState('tail');
      return <b>{`${n}${ticket}${state}${tail}`}</b>;
    };
    mount(<Modern />);
    const fiber = compositeChain(fiberFromNode(document.querySelector('b'))!).pop()!;
    const inspected = inspectHooks(fiber);

    // useState, useOptimistic, then useActionState over three cells, then the useState after it.
    expect([...(inspected?.hooks.keys() ?? [])]).toEqual([0, 1, 2, 5]);
    expect(inspected?.hooks.get(1)?.path).toEqual(['useTicket', 'Optimistic']);
    expect(inspected?.hooks.get(2)?.path).toEqual(['ActionState']);
    expect(inspected?.hooks.get(5)?.path).toEqual(['State']);
    expect(hookTypeAt(fiber, 2)).toBe('useActionState');
    expect(hookTypeAt(fiber, 5)).toBe('useState');
  });
});
