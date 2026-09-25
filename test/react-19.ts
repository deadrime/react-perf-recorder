import path from 'node:path';

/**
 * React 19 lives in a tree of its own (`test/react19`), together with every package that renders with it: a copy of
 * zustand there finds the React next to it, which is the only way a second React can be tested from one checkout —
 * an alias reaches the app's own imports but not what a dependency requires for itself.
 *
 * `npm run test:19` and the `react19` Playwright project resolve through these; `npm --prefix test/react19 install`
 * fills the tree. The recorder's own proxies (`react-dom/client`, `zustand`) follow an aliased specifier to the
 * package it stands for, so they apply here exactly as they do in an app that imports by name.
 */
const tree = path.resolve(__dirname, 'react19/node_modules');

const inTree = (name: string) => ({ find: new RegExp(`^${name}(/.*)?$`), replacement: `${tree}/${name}$1` });

const RENDER_WITH_REACT = ['react', 'react-dom', 'zustand', 'react-redux', 'react-hook-form', 'react-router-dom', '@tanstack/react-query'];

/**
 * For the dev server, React alone: everything else keeps resolving from the repo's own install, and the optimizer
 * pre-bundles those with this alias applied, so they render with the same copy. Aliasing them as well would put
 * them in the optimizer's metadata early, and Vite answers such an import before any plugin of ours is asked —
 * the recorder's proxies of `zustand` and `react-dom/client` would never see it.
 */
export const react19Aliases = ['react', 'react-dom'].map(inTree);

/** For the unit tests, where nothing is pre-bundled and a CJS dependency would require the React next to itself. */
export const react19UnitAliases = RENDER_WITH_REACT.map(inTree);

export const reactVersionUnderTest = () => (process.env.RPR_REACT === '19' ? '19' : '18');


