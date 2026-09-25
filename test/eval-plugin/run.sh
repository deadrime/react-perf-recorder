#!/usr/bin/env bash
# The perf-recorder agent against the fixture's seeded bugs, with claude plugin eval.
#   test/eval-plugin/run.sh --case whole-object --runs 1 --ablation none --max-cost-usd 5
# Needs a built dist/ and playwright's Chromium. Extra arguments go to claude plugin eval.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
port=5395
sessions="$(mktemp -d)"
# An eval run moves HOME and passes only EVAL_* variables on: the MCP server gets these through the plugin's manifest.
export EVAL_RPR_DIR="$sessions"
export EVAL_PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"

cd "$repo"
FIXTURE_PORT=$port FIXTURE_OUT_DIR="$sessions" node node_modules/.bin/vite --config test/e2e/fixture-app/vite.config.ts --strictPort \
  >"$sessions/fixture.log" 2>&1 &
fixture=$!
trap 'kill $fixture 2>/dev/null' EXIT
for _ in $(seq 60); do curl -sf -o /dev/null "http://localhost:$port/app" && break; sleep 1; done

claude plugin eval test/eval-plugin \
  --scaffold --trust-plugin --allow-real-servers \
  --allow-tools Write "mcp__plugin_react-perf-recorder_react-perf-recorder__*" \
  --model claude-sonnet-5 --no-publish "$@"
