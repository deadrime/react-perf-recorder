import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { findRoots } from '../../src/core/fiber';
import { noteRoot } from '../../src/core/roots-notify';

describe('finding the roots of the app', () => {
  it('finds a root mounted deep in the page once the app has created it', () => {
    document.body.innerHTML = '<div class="layout"><main><div id="app"></div></main></div>';
    const root = createRoot(document.getElementById('app')!);
    act(() => root.render(<p>deep</p>));
    // Deeper than #root and the grandchildren of body: a search of the page does not look there.
    expect(findRoots()).toHaveLength(0);
    noteRoot(root as unknown as { _internalRoot?: never });
    expect(findRoots().map((r) => r.containerInfo.id)).toEqual(['app']);
    // Taken off the page, it is not a root to record any more.
    act(() => root.unmount());
    document.body.innerHTML = '';
    expect(findRoots()).toHaveLength(0);
  });
});
