#!/usr/bin/env bash
exec node "$(dirname "${BASH_SOURCE[0]}")/../../evals/scaffold.mjs" effect-filter . --app=large --recorded=wait-issues
