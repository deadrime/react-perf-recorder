# Transcripts

44 runs of 22 cases, 2026-09-28, Claude Code 2.1.283, with the plugin only: each file is one run's prompt, answer, the diff it left and its steps, long tool answers cut. Written by `test/eval-plugin/transcripts.mjs` from the run's sandboxes; the benchmark's numbers are in [benchmarks.md](../../benchmarks.md).

| Run | Plugin | Recording after | Failed checks | Cost | Time | Turns |
| --- | --- | --- | --- | --: | --: | --: |
| [connect-filter-rec](connect-filter-rec.with.1.md) | with | fixed | — | $0.23 | 92 s | 16 |
| [connect-filter-rec](connect-filter-rec.with.2.md) | with | fixed | — | $0.22 | 113 s | 6 |
| [cost-over-count-rec](cost-over-count-rec.with.1.md) | with | fixed | — | $0.34 | 133 s | 21 |
| [cost-over-count-rec](cost-over-count-rec.with.2.md) | with | fixed | — | $0.46 | 175 s | 27 |
| [decoys-rec](decoys-rec.with.1.md) | with | fixed | — | $0.25 | 131 s | 2 |
| [decoys-rec](decoys-rec.with.2.md) | with | fixed | — | $0.20 | 115 s | 2 |
| [draft-context-rec](draft-context-rec.with.1.md) | with | fixed | fixed | $0.56 | 305 s | 1 |
| [draft-context-rec](draft-context-rec.with.2.md) | with | fixed | fixed | $0.76 | 323 s | 33 |
| [effect-derived-state-rec](effect-derived-state-rec.with.1.md) | with | fixed | — | $0.34 | 207 s | 2 |
| [effect-derived-state-rec](effect-derived-state-rec.with.2.md) | with | fixed | focused | $0.53 | 213 s | 30 |
| [exact-value-rec](exact-value-rec.with.1.md) | with | fixed | — | $0.26 | 107 s | 14 |
| [exact-value-rec](exact-value-rec.with.2.md) | with | fixed | — | $0.35 | 511 s | 2 |
| [expensive-render-rec](expensive-render-rec.with.1.md) | with | fixed | — | $0.27 | 104 s | 16 |
| [expensive-render-rec](expensive-render-rec.with.2.md) | with | fixed | — | $0.31 | 136 s | 18 |
| [fallback-array-rec](fallback-array-rec.with.1.md) | with | fixed | — | $0.22 | 72 s | 13 |
| [fallback-array-rec](fallback-array-rec.with.2.md) | with | fixed | — | $0.20 | 104 s | 5 |
| [field-state-rec](field-state-rec.with.1.md) | with | fixed | fixed | $0.27 | 138 s | 2 |
| [field-state-rec](field-state-rec.with.2.md) | with | fixed | — | $0.73 | 479 s | 2 |
| [form-watch](form-watch.with.1.md) | with | fixed | — | $0.65 | 279 s | 36 |
| [form-watch](form-watch.with.2.md) | with | fixed | — | $0.50 | 203 s | 25 |
| [form-watch-rec](form-watch-rec.with.1.md) | with | not fixed | fixed | $0.57 | 466 s | 2 |
| [form-watch-rec](form-watch-rec.with.2.md) | with | fixed | — | $0.52 | 233 s | 29 |
| [hook-reads-all-rec](hook-reads-all-rec.with.1.md) | with | fixed | — | $0.23 | 81 s | 17 |
| [hook-reads-all-rec](hook-reads-all-rec.with.2.md) | with | fixed | — | $0.22 | 91 s | 16 |
| [inline-context-rec](inline-context-rec.with.1.md) | with | fixed | — | $0.24 | 135 s | 5 |
| [inline-context-rec](inline-context-rec.with.2.md) | with | fixed | — | $0.21 | 71 s | 14 |
| [memo-cache-slot-rec](memo-cache-slot-rec.with.1.md) | with | fixed | fixed | $0.43 | 244 s | 7 |
| [memo-cache-slot-rec](memo-cache-slot-rec.with.2.md) | with | fixed | — | $0.51 | 193 s | 29 |
| [nested-component-rec](nested-component-rec.with.1.md) | with | fixed | — | $0.28 | 69 s | 16 |
| [nested-component-rec](nested-component-rec.with.2.md) | with | fixed | — | $0.23 | 135 s | 5 |
| [new-array-selector-rec](new-array-selector-rec.with.1.md) | with | fixed | — | $0.41 | 161 s | 29 |
| [new-array-selector-rec](new-array-selector-rec.with.2.md) | with | fixed | — | $0.28 | 121 s | 16 |
| [no-bug-rec](no-bug-rec.with.1.md) | with | fixed | — | $0.46 | 207 s | 21 |
| [no-bug-rec](no-bug-rec.with.2.md) | with | fixed | — | $0.51 | 342 s | 4 |
| [prefs-on-tick-rec](prefs-on-tick-rec.with.1.md) | with | fixed | fixed | $0.33 | 180 s | 24 |
| [prefs-on-tick-rec](prefs-on-tick-rec.with.2.md) | with | fixed | — | $0.27 | 107 s | 18 |
| [query-rest-rec](query-rest-rec.with.1.md) | with | fixed | — | $0.27 | 152 s | 5 |
| [query-rest-rec](query-rest-rec.with.2.md) | with | fixed | — | $0.23 | 135 s | 5 |
| [router-in-layout-rec](router-in-layout-rec.with.1.md) | with | fixed | — | $0.27 | 95 s | 16 |
| [router-in-layout-rec](router-in-layout-rec.with.2.md) | with | fixed | — | $0.32 | 123 s | 17 |
| [two-bugs-rec](two-bugs-rec.with.1.md) | with | fixed | — | $0.27 | 160 s | 1 |
| [two-bugs-rec](two-bugs-rec.with.2.md) | with | fixed | — | $0.29 | 120 s | 20 |
| [whole-object-rec](whole-object-rec.with.1.md) | with | fixed | — | $0.25 | 98 s | 18 |
| [whole-object-rec](whole-object-rec.with.2.md) | with | fixed | — | $0.24 | 126 s | 2 |
