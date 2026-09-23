import { generatedSourceOf, isLibraryFiber, nameOf, relativeFile, siteKeyOf, sourceOf, type Fiber } from '../../src/core/fiber';

/** A fiber as React 19.1+ leaves it: no `_debugSource`, an owner stack whose first frame is React's own. */
const withOwnerStack = (url: string, line: number, column: number, extra: Partial<Fiber> = {}): Fiber => {
  const error = new Error('react-stack-top-frame');
  Object.defineProperty(error, 'stack', {
    value: [
      'Error: react-stack-top-frame',
      '    at exports.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=abc:246:31)',
      `    at Layout (${url}:${line}:${column})`,
      '    at react_stack_bottom_frame (http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=abc:17:20)',
    ].join('\n'),
  });
  return { tag: 0, type: function Row() {}, _debugStack: error, ...extra } as unknown as Fiber;
};

const withDebugSource = (fileName: string, lineNumber: number, extra: Partial<Fiber> = {}): Fiber =>
  ({ tag: 0, type: function Row() {}, _debugSource: { fileName, lineNumber, columnNumber: 7 }, ...extra } as unknown as Fiber);

describe('component sites across React versions', () => {
  it('reads React 18 sources off the fiber, with the line they were written at', () => {
    const fiber = withDebugSource('/home/me/app/src/components/Row.tsx', 42);
    expect(sourceOf(fiber, '/home/me/app')).toBe('src/components/Row.tsx:42');
    expect(generatedSourceOf(fiber)).toBeUndefined();
    expect(siteKeyOf(fiber, '/home/me/app')).toBe('src/components/Row.tsx:42:7');
  });

  it('reads React 19 sources off the owner stack, and leaves the built line for the dev server to map', () => {
    const fiber = withOwnerStack('http://localhost:5173/src/components/Row.tsx', 81, 35);
    // The position is the built module's, so the file is shown without a line rather than with a wrong one.
    expect(sourceOf(fiber)).toBe('src/components/Row.tsx');
    expect(generatedSourceOf(fiber)).toEqual({ url: 'http://localhost:5173/src/components/Row.tsx', line: 81, column: 35 });
    // Two components of the same name in one file are still told apart by where they were written.
    expect(siteKeyOf(fiber)).toBe('src/components/Row.tsx:81:35');
  });

  it('tells a package apart from the app by the file of what a component rendered, on either version', () => {
    const appChild = withOwnerStack('http://localhost:5173/src/components/Row.tsx', 12, 4);
    const packageChild = withOwnerStack('http://localhost:5173/node_modules/.vite/deps/react-router-dom.js?v=abc', 4233, 20);
    expect(isLibraryFiber({ tag: 0, type: function Own() {}, child: appChild } as unknown as Fiber)).toBe(false);
    expect(isLibraryFiber({ tag: 0, type: function Theirs() {}, child: packageChild } as unknown as Fiber)).toBe(true);
    expect(isLibraryFiber({ tag: 0, type: function Compiled() {}, child: null } as unknown as Fiber)).toBe(true);
  });

  it('strips the dev server off a URL and keeps the path from the project', () => {
    expect(relativeFile('http://localhost:5173/src/App.tsx?t=1712')).toBe('src/App.tsx');
    expect(relativeFile('/home/me/app/src/App.tsx', '/home/me/app')).toBe('src/App.tsx');
  });

  it('names a context provider whichever way React holds the context', () => {
    const context = { displayName: 'Theme' };
    const react18 = { tag: 10, type: { _context: context } } as unknown as Fiber;
    const react19 = { tag: 10, type: context } as unknown as Fiber;
    expect(nameOf(react18)).toBe('Provider(Theme)');
    expect(nameOf(react19)).toBe('Provider(Theme)');
    expect(nameOf({ tag: 9, type: { _context: context } } as unknown as Fiber)).toBe('Consumer(Theme)');
  });
});
