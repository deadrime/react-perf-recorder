#!/usr/bin/env bash
exec node "$(dirname "${BASH_SOURCE[0]}")/../../evals/scaffold.mjs" auth-connection,query-index,effect-filter . --app=large --recorded=wait-issues
