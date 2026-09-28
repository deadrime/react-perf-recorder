# Transcripts

44 runs of 22 cases, 2026-09-27, Claude Code 2.1.283, with the plugin only: each file is one run's prompt, answer, the diff it left and its steps, long tool answers cut. Written by `test/eval-plugin/transcripts.mjs` from the run's sandboxes; the benchmark's numbers are in [benchmarks.md](../../benchmarks.md).

| Run | Plugin | Recording after | Failed checks | Cost | Time | Turns |
| --- | --- | --- | --- | --: | --: | --: |
| [connect-filter-rec](connect-filter-rec.with.1.md) | with | fixed | — | $0.23 | 96 s | 15 |
| [connect-filter-rec](connect-filter-rec.with.2.md) | with | fixed | — | $0.24 | 89 s | 20 |
| [cost-over-count-rec](cost-over-count-rec.with.1.md) | with | fixed | — | $0.31 | 162 s | 3 |
| [cost-over-count-rec](cost-over-count-rec.with.2.md) | with | fixed | — | $0.37 | 202 s | 2 |
| [decoys-rec](decoys-rec.with.1.md) | with | fixed | — | $0.24 | 104 s | 14 |
| [decoys-rec](decoys-rec.with.2.md) | with | fixed | — | $0.38 | 201 s | 28 |
| [draft-context-rec](draft-context-rec.with.1.md) | with | fixed | — | $0.40 | 124 s | 29 |
| [draft-context-rec](draft-context-rec.with.2.md) | with | fixed | — | $0.31 | 151 s | 3 |
| [effect-derived-state-rec](effect-derived-state-rec.with.1.md) | with | fixed | — | $0.30 | 123 s | 17 |
| [effect-derived-state-rec](effect-derived-state-rec.with.2.md) | with | fixed | — | $0.31 | 176 s | 2 |
| [exact-value-rec](exact-value-rec.with.1.md) | with | fixed | — | $0.40 | 160 s | 25 |
| [exact-value-rec](exact-value-rec.with.2.md) | with | fixed | — | $0.28 | 119 s | 15 |
| [expensive-render-rec](expensive-render-rec.with.1.md) | with | fixed | — | $0.29 | 102 s | 19 |
| [expensive-render-rec](expensive-render-rec.with.2.md) | with | fixed | — | $0.41 | 172 s | 25 |
| [fallback-array-rec](fallback-array-rec.with.1.md) | with | fixed | — | $0.23 | 81 s | 16 |
| [fallback-array-rec](fallback-array-rec.with.2.md) | with | fixed | — | $0.24 | 112 s | 13 |
| [field-state-rec](field-state-rec.with.1.md) | with | fixed | fixed | $0.70 | 376 s | 2 |
| [field-state-rec](field-state-rec.with.2.md) | with | fixed | fixed | $1.73 | 602 s | 60 |
| [form-watch](form-watch.with.1.md) | with | fixed | — | $0.65 | 213 s | 32 |
| [form-watch](form-watch.with.2.md) | with | not fixed | fixed | $1.80 | 772 s | 55 |
| [form-watch-rec](form-watch-rec.with.1.md) | with | fixed | — | $0.43 | 215 s | 16 |
| [form-watch-rec](form-watch-rec.with.2.md) | with | fixed | — | $0.48 | 232 s | 17 |
| [hook-reads-all-rec](hook-reads-all-rec.with.1.md) | with | fixed | — | $0.20 | 96 s | 5 |
| [hook-reads-all-rec](hook-reads-all-rec.with.2.md) | with | fixed | — | $0.26 | 102 s | 20 |
| [inline-context-rec](inline-context-rec.with.1.md) | with | fixed | — | $0.24 | 136 s | 2 |
| [inline-context-rec](inline-context-rec.with.2.md) | with | fixed | — | $0.35 | 155 s | 20 |
| [memo-cache-slot-rec](memo-cache-slot-rec.with.1.md) | with | fixed | fixed | $0.48 | 162 s | 37 |
| [memo-cache-slot-rec](memo-cache-slot-rec.with.2.md) | with | fixed | fixed | $0.42 | 150 s | 30 |
| [nested-component-rec](nested-component-rec.with.1.md) | with | fixed | — | $0.29 | 83 s | 14 |
| [nested-component-rec](nested-component-rec.with.2.md) | with | fixed | — | $0.30 | 113 s | 14 |
| [new-array-selector-rec](new-array-selector-rec.with.1.md) | with | fixed | — | $0.32 | 130 s | 20 |
| [new-array-selector-rec](new-array-selector-rec.with.2.md) | with | fixed | — | $0.39 | 138 s | 34 |
| [no-bug-rec](no-bug-rec.with.1.md) | with | fixed | — | $0.38 | 182 s | 26 |
| [no-bug-rec](no-bug-rec.with.2.md) | with | fixed | — | $0.42 | 263 s | 20 |
| [prefs-on-tick-rec](prefs-on-tick-rec.with.1.md) | with | fixed | fixed | $0.42 | 224 s | 26 |
| [prefs-on-tick-rec](prefs-on-tick-rec.with.2.md) | with | fixed | fixed | $0.26 | 96 s | 18 |
| [query-rest-rec](query-rest-rec.with.1.md) | with | fixed | — | $0.33 | 135 s | 21 |
| [query-rest-rec](query-rest-rec.with.2.md) | with | fixed | — | $0.31 | 118 s | 22 |
| [router-in-layout-rec](router-in-layout-rec.with.1.md) | with | fixed | — | $0.35 | 166 s | 16 |
| [router-in-layout-rec](router-in-layout-rec.with.2.md) | with | fixed | — | $0.27 | 101 s | 17 |
| [two-bugs-rec](two-bugs-rec.with.1.md) | with | not fixed | fixed-time, named | $0.38 | 155 s | 24 |
| [two-bugs-rec](two-bugs-rec.with.2.md) | with | not fixed | fixed-time, named | $0.34 | 152 s | 21 |
| [whole-object-rec](whole-object-rec.with.1.md) | with | fixed | — | $0.25 | 89 s | 18 |
| [whole-object-rec](whole-object-rec.with.2.md) | with | fixed | — | $0.24 | 112 s | 3 |
