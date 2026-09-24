# Options

`perfRecorder({ … })` in `vite.config.ts`:

| Option       | Default                                                                                  |                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plugins`    | `[]`                                                                                     | [Plugins](plugins.md): `zustand()`, `proxyMemoize()`, `reactQuery()`, or your own                                                                            |
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
- `proxyMemoize({ functions, module, include, exclude })` — `functions` defaults to `['memoize', 'memoizeWithArgs']`.
- `reactQuery()` — finds the `QueryClientProvider` on the page by itself, also one that mounts late.
