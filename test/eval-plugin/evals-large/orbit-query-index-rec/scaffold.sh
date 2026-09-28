#!/usr/bin/env bash
exec node "$(dirname "${BASH_SOURCE[0]}")/../../evals/scaffold.mjs" query-index . --app=large --recorded=wait-issues
