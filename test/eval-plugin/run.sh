#!/usr/bin/env bash
# The perf-recorder agent against the fixture's seeded bugs, with claude plugin eval: each run gets the app with one
# bug as its workspace, served by a dev server of its own (the case's scaffold starts it), and has to fix it.
#   test/eval-plugin/run.sh --case whole-object --runs 1 --ablation none --max-cost-usd 5
# Needs a built dist/ and playwright's Chromium. Extra arguments go to claude plugin eval.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
sessions="$(mktemp -d)"
# An eval run moves HOME and passes only EVAL_* variables on: the MCP server gets these through the plugin's manifest.
export EVAL_RPR_DIR="$sessions"
export EVAL_PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
# A case's scaffold gets neither: it reads them from here, so its dev server records where the MCP server reads.
mkdir -p "$repo/.agent-artifacts"
printf '{"sessions":"%s","browsers":"%s"}\n' "$sessions" "$EVAL_PLAYWRIGHT_BROWSERS_PATH" >"$repo/.agent-artifacts/eval-run.json"

stop_servers() {
  for pid in $(ls "$sessions/servers" 2>/dev/null); do kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; done
}
trap stop_servers EXIT

cd "$repo"
claude plugin eval test/eval-plugin \
  --scaffold --trust-plugin --allow-real-servers \
  --allow-tools Edit Write "mcp__plugin_react-perf-recorder_react-perf-recorder__*" \
  --model claude-sonnet-5 --no-publish "$@"
echo "recordings and dev server logs: $sessions"
