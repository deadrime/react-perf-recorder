# Sources: ideas for later

Not planned yet. Where a recording's file and line could still be wrong, and what fixing it needs.

## React 18 lines when recording without the plugin

- **Element lines 19 too low under @vitejs/plugin-react 4.** plugin-react 4 puts its Fast Refresh header above
  the module before esbuild compiles the JSX, so the `lineNumber` esbuild writes into `jsxDEV`, which React 18 keeps
  as `_debugSource`, is counted from the top of the header. The Vite plugin corrects it as the module is served
  (`src/vite/jsx-lines.ts`); `record_page` against a dev server without the plugin still reports `App.tsx:52` for
  an element on line 33.
- **What it needs.** `siteOf` marks `_debugSource` sites `exact`, so nothing maps them. The served script and its
  map are already in `ScriptCatalog` (CDP): the shift can be read the same way as in the plugin, by
  `fixJsxLines`' leaf elements (where a `jsxDEV` call maps in the file against the line in its source object),
  once per script, and taken off the lines of that file. A test: the bare fixture with plugin-react 4 and React 18,
  a component's line in `record_page` equal to the file's.
- **Not affected**: React 19 (its sites come from the stack, through the map), plugin-react 5 (the header goes at
  the end), plugin-react-swc.
