# Options

`perfRecorder({ … })` in `vite.config.ts`:

| Option       | Default                                                                                  |                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plugins`    | `[]`                                                                                     | [Plugins](plugins.md): `zustand()`, `redux()`, `proxyMemoize()`, `reactQuery()`, `emotion()`, or your own                                                    |
| `outDir`     | `REACT_PERF_RECORDER_DIR`, then `.agent-artifacts/perf-recorder`                         | Sessions folder, relative to the root or absolute                                                                                                            |
| `enabled`    | dev server only, not under Vitest                                                        |                                                                                                                                                              |
| `maxBytes`   | 64 MB                                                                                    | Largest request, the final recording included                                                                                                                |
| `retain`     | `{ sessions: 100, bytes: 500 MB }`                                                       | Oldest sessions go first                                                                                                                                     |
| `actions`    | `{ values: false, secretSelector: '[data-rpr-secret]' }`                                 | `values: true` records typed values; passwords and one-time codes never                                                                                      |
| `components` | `{ include: ['src/**/*.{tsx,jsx}'], wrappers: ['memo', 'forwardRef', 'createContext'] }` | Adds `displayName` to `const X = memo(…)` and contexts. `wrapperPattern` is only for names an app leaves empty: `^(Anonymous\|ForwardRef\|Memo)$` by default |
| `panel`      | `{ corner: 'bottom-left', highlight: true, shortcuts }`                                  | `false` — engine only                                                                                                                                        |
| `engine`     | `{ bigCommit: 150, timelineLimit: 5000, maxDurationMs: 600000, timers: true }`           | `timers: false` leaves `setTimeout`, `setInterval` and `requestAnimationFrame` unwrapped, and timer causes out                                               |

Plugin options:

- `zustand({ devtools })` — `devtools: false` does not listen to the devtools middleware, so a store update reads
  `<store>.setState` with the keys it changed instead of the action's name.
- `redux({ functions, include, exclude })` — follows every store redux makes, RTK's `configureStore` and a library's
  included; `functions` (`configureStore`, `createStore`, `legacy_createStore`) name the app's stores after their
  declarations. A cause is the action that changed the store, with the slices it changed.
- `proxyMemoize({ functions, module, include, exclude })` — `functions` defaults to `['memoize', 'memoizeWithArgs']`.
- `reactQuery()` — finds the `QueryClientProvider` on the page by itself, also one that mounts late.
- `emotion()` — reads the `<style data-emotion>` tags at start and stop: the classes emotion inserted in between,
  grouped by label, or by their declarations with the numbers taken out and named after the component whose element
  has one, with the properties whose values differ. Emotion never removes a class, so a value put into `css` grows
  the stylesheet for as long as the page is open.
