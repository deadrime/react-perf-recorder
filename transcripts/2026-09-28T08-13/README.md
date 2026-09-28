# Transcripts

44 runs of 22 cases, 2026-09-28, Claude Code 2.1.283, with the plugin only: each file is one run's prompt, answer, the diff it left and its steps, long tool answers cut. Written by `test/eval-plugin/transcripts.mjs` from the run's sandboxes; the benchmark's numbers are in `docs/benchmarks.md`.

| Run | Plugin | Recording after | Failed checks | Cost | Time | Turns |
| --- | --- | --- | --- | --: | --: | --: |
| [connect-filter-rec](connect-filter-rec.with.1.md) | with | fixed | — | $0.24 | 116 s | 3 |
| [connect-filter-rec](connect-filter-rec.with.2.md) | with | fixed | — | $0.31 | 155 s | 6 |
| [cost-over-count-rec](cost-over-count-rec.with.1.md) | with | fixed | — | $0.28 | 118 s | 3 |
| [cost-over-count-rec](cost-over-count-rec.with.2.md) | with | fixed | — | $0.31 | 149 s | 2 |
| [decoys-rec](decoys-rec.with.1.md) | with | fixed | — | $0.33 | 166 s | 2 |
| [decoys-rec](decoys-rec.with.2.md) | with | fixed | — | $0.26 | 120 s | 15 |
| [draft-context-rec](draft-context-rec.with.1.md) | with | fixed | — | $0.44 | 196 s | 2 |
| [draft-context-rec](draft-context-rec.with.2.md) | with | fixed | — | $0.57 | 219 s | 31 |
| [effect-derived-state-rec](effect-derived-state-rec.with.1.md) | with | fixed | — | $0.32 | 117 s | 18 |
| [effect-derived-state-rec](effect-derived-state-rec.with.2.md) | with | fixed | — | $0.30 | 156 s | 2 |
| [exact-value-rec](exact-value-rec.with.1.md) | with | fixed | — | $0.46 | 232 s | 1 |
| [exact-value-rec](exact-value-rec.with.2.md) | with | fixed | — | $0.26 | 122 s | 2 |
| [expensive-render-rec](expensive-render-rec.with.1.md) | with | fixed | — | $0.34 | 134 s | 21 |
| [expensive-render-rec](expensive-render-rec.with.2.md) | with | fixed | — | $0.23 | 82 s | 17 |
| [fallback-array-rec](fallback-array-rec.with.1.md) | with | fixed | — | $0.22 | 81 s | 15 |
| [fallback-array-rec](fallback-array-rec.with.2.md) | with | fixed | — | $0.21 | 95 s | 2 |
| [field-state-rec](field-state-rec.with.1.md) | with | fixed | — | $0.64 | 336 s | 2 |
| [field-state-rec](field-state-rec.with.2.md) | with | fixed | fixed | $0.83 | 420 s | 2 |
| [form-watch](form-watch.with.1.md) | with | fixed | — | $0.50 | 211 s | 29 |
| [form-watch](form-watch.with.2.md) | with | fixed | — | $0.61 | 193 s | 32 |
| [form-watch-rec](form-watch-rec.with.1.md) | with | fixed | — | $0.41 | 146 s | 19 |
| [form-watch-rec](form-watch-rec.with.2.md) | with | fixed | — | $0.45 | 273 s | 2 |
| [hook-reads-all-rec](hook-reads-all-rec.with.1.md) | with | fixed | — | $0.24 | 114 s | 5 |
| [hook-reads-all-rec](hook-reads-all-rec.with.2.md) | with | fixed | — | $0.23 | 78 s | 16 |
| [inline-context-rec](inline-context-rec.with.1.md) | with | fixed | — | $0.30 | 116 s | 15 |
| [inline-context-rec](inline-context-rec.with.2.md) | with | fixed | — | $0.23 | 75 s | 15 |
| [memo-cache-slot-rec](memo-cache-slot-rec.with.1.md) | with | fixed | — | $0.47 | 235 s | 3 |
| [memo-cache-slot-rec](memo-cache-slot-rec.with.2.md) | with | fixed | — | $0.46 | 205 s | 29 |
| [nested-component-rec](nested-component-rec.with.1.md) | with | fixed | — | $0.28 | 103 s | 2 |
| [nested-component-rec](nested-component-rec.with.2.md) | with | fixed | — | $0.22 | 79 s | 2 |
| [new-array-selector-rec](new-array-selector-rec.with.1.md) | with | fixed | — | $0.29 | 149 s | 5 |
| [new-array-selector-rec](new-array-selector-rec.with.2.md) | with | fixed | — | $0.29 | 140 s | 5 |
| [no-bug-rec](no-bug-rec.with.1.md) | with | fixed | — | $0.58 | 222 s | 29 |
| [no-bug-rec](no-bug-rec.with.2.md) | with | fixed | — | $0.54 | 266 s | 25 |
| [prefs-on-tick-rec](prefs-on-tick-rec.with.1.md) | with | fixed | — | $0.26 | 86 s | 18 |
| [prefs-on-tick-rec](prefs-on-tick-rec.with.2.md) | with | fixed | — | $0.36 | 116 s | 23 |
| [query-rest-rec](query-rest-rec.with.1.md) | with | fixed | — | $0.20 | 96 s | 5 |
| [query-rest-rec](query-rest-rec.with.2.md) | with | fixed | — | $0.32 | 117 s | 22 |
| [router-in-layout-rec](router-in-layout-rec.with.1.md) | with | fixed | — | $0.31 | 104 s | 20 |
| [router-in-layout-rec](router-in-layout-rec.with.2.md) | with | fixed | — | $0.31 | 98 s | 19 |
| [two-bugs-rec](two-bugs-rec.with.1.md) | with | fixed | — | $0.34 | 117 s | 21 |
| [two-bugs-rec](two-bugs-rec.with.2.md) | with | fixed | — | $0.33 | 159 s | 9 |
| [whole-object-rec](whole-object-rec.with.1.md) | with | fixed | — | $0.34 | 201 s | 2 |
| [whole-object-rec](whole-object-rec.with.2.md) | with | fixed | — | $0.21 | 66 s | 14 |
