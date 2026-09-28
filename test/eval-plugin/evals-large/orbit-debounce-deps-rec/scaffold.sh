#!/usr/bin/env bash
exec node "$(dirname "${BASH_SOURCE[0]}")/../../evals/scaffold.mjs" debounce-deps . --app=large --recorded=search
