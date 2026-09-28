# Transcripts

44 runs of 22 cases, 2026-09-28, Claude Code 2.1.283, with the plugin only: each file is one run's prompt, answer, the diff it left and its steps, long tool answers cut. Written by `test/eval-plugin/transcripts.mjs` from the run's sandboxes; the benchmark's numbers are in `docs/benchmarks.md`.

| Run | Plugin | Recording after | Failed checks | Cost | Time | Turns |
| --- | --- | --- | --- | --: | --: | --: |
| [connect-filter-rec](connect-filter-rec.with.1.md) | with | fixed | — | $0.22 | 86 s | 3 |
| [connect-filter-rec](connect-filter-rec.with.2.md) | with | fixed | — | $0.27 | 132 s | 3 |
| [cost-over-count-rec](cost-over-count-rec.with.1.md) | with | fixed | — | $0.29 | 164 s | 7 |
| [cost-over-count-rec](cost-over-count-rec.with.2.md) | with | fixed | — | $0.40 | 162 s | 22 |
| [decoys-rec](decoys-rec.with.1.md) | with | fixed | — | $0.22 | 97 s | 13 |
| [decoys-rec](decoys-rec.with.2.md) | with | fixed | — | $0.30 | 132 s | 5 |
| [draft-context-rec](draft-context-rec.with.1.md) | with | fixed | — | $0.48 | 224 s | 5 |
| [draft-context-rec](draft-context-rec.with.2.md) | with | not fixed | fixed, focused | $0.63 | 259 s | 3 |
| [effect-derived-state-rec](effect-derived-state-rec.with.1.md) | with | fixed | — | $0.36 | 117 s | 19 |
| [effect-derived-state-rec](effect-derived-state-rec.with.2.md) | with | fixed | — | $0.48 | 161 s | 24 |
| [exact-value-rec](exact-value-rec.with.1.md) | with | fixed | — | $0.32 | 123 s | 16 |
| [exact-value-rec](exact-value-rec.with.2.md) | with | fixed | — | $0.37 | 153 s | 23 |
| [expensive-render-rec](expensive-render-rec.with.1.md) | with | fixed | — | $0.30 | 104 s | 20 |
| [expensive-render-rec](expensive-render-rec.with.2.md) | with | fixed | — | $0.23 | 101 s | 5 |
| [fallback-array-rec](fallback-array-rec.with.1.md) | with | fixed | — | $0.20 | 82 s | 2 |
| [fallback-array-rec](fallback-array-rec.with.2.md) | with | fixed | — | $0.25 | 111 s | 2 |
| [field-state-rec](field-state-rec.with.1.md) | with | fixed | — | $0.39 | 118 s | 21 |
| [field-state-rec](field-state-rec.with.2.md) | with | fixed | — | $0.53 | 218 s | 2 |
| [form-watch](form-watch.with.1.md) | with | fixed | — | $1.22 | 461 s | 52 |
| [form-watch](form-watch.with.2.md) | with | fixed | — | $0.40 | 193 s | 2 |
| [form-watch-rec](form-watch-rec.with.1.md) | with | not fixed | fixed | $0.70 | 430 s | 2 |
| [form-watch-rec](form-watch-rec.with.2.md) | with | not fixed | fixed | $1.00 | 506 s | 2 |
| [hook-reads-all-rec](hook-reads-all-rec.with.1.md) | with | fixed | — | $0.22 | 93 s | 2 |
| [hook-reads-all-rec](hook-reads-all-rec.with.2.md) | with | fixed | — | $0.23 | 95 s | 2 |
| [inline-context-rec](inline-context-rec.with.1.md) | with | fixed | — | $0.25 | 113 s | 17 |
| [inline-context-rec](inline-context-rec.with.2.md) | with | fixed | — | $0.24 | 89 s | 17 |
| [memo-cache-slot-rec](memo-cache-slot-rec.with.1.md) | with | fixed | — | $0.42 | 173 s | 3 |
| [memo-cache-slot-rec](memo-cache-slot-rec.with.2.md) | with | fixed | — | $0.46 | 169 s | 27 |
| [nested-component-rec](nested-component-rec.with.1.md) | with | fixed | — | $0.23 | 113 s | 2 |
| [nested-component-rec](nested-component-rec.with.2.md) | with | fixed | — | $0.23 | 79 s | 4 |
| [new-array-selector-rec](new-array-selector-rec.with.1.md) | with | fixed | — | $0.33 | 172 s | 2 |
| [new-array-selector-rec](new-array-selector-rec.with.2.md) | with | fixed | — | $0.40 | 180 s | 24 |
| [no-bug-rec](no-bug-rec.with.1.md) | with | fixed | — | $0.42 | 200 s | 23 |
| [no-bug-rec](no-bug-rec.with.2.md) | with | fixed | — | $0.41 | 217 s | 1 |
| [prefs-on-tick-rec](prefs-on-tick-rec.with.1.md) | with | fixed | — | $0.25 | 83 s | 15 |
| [prefs-on-tick-rec](prefs-on-tick-rec.with.2.md) | with | fixed | — | $0.24 | 76 s | 15 |
| [query-rest-rec](query-rest-rec.with.1.md) | with | fixed | — | $0.32 | 149 s | 2 |
| [query-rest-rec](query-rest-rec.with.2.md) | with | fixed | — | $0.27 | 94 s | 16 |
| [router-in-layout-rec](router-in-layout-rec.with.1.md) | with | fixed | — | $0.29 | 95 s | 18 |
| [router-in-layout-rec](router-in-layout-rec.with.2.md) | with | fixed | — | $0.25 | 112 s | 2 |
| [two-bugs-rec](two-bugs-rec.with.1.md) | with | fixed | — | $0.35 | 195 s | 3 |
| [two-bugs-rec](two-bugs-rec.with.2.md) | with | not fixed | fixed-time, named | $0.36 | 146 s | 22 |
| [whole-object-rec](whole-object-rec.with.1.md) | with | fixed | — | $0.23 | 90 s | 2 |
| [whole-object-rec](whole-object-rec.with.2.md) | with | fixed | — | $0.33 | 112 s | 21 |
