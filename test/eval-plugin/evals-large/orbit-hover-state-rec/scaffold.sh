#!/usr/bin/env bash
exec node "$(dirname "${BASH_SOURCE[0]}")/../../evals/scaffold.mjs" hover-state . --app=large --recorded=hover-rows
