#!/usr/bin/env bash
exec node "$(dirname "${BASH_SOURCE[0]}")/../../evals/scaffold.mjs" hoc-in-render . --app=large --recorded=comment
