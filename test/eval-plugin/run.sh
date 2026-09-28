#!/usr/bin/env bash
# The perf-recorder agent against the fixture's seeded bugs, with claude plugin eval: each run gets the app with one
# bug as its workspace, served by a dev server of its own (the case's scaffold starts it), and has to fix it.
#   test/eval-plugin/run.sh --case whole-object --runs 1 --ablation none --max-cost-usd 5
#   test/eval-plugin/run.sh --cases decoys-rec,fallback-array-rec --runs 2
#   test/eval-plugin/run.sh --eval-dir evals-large --cases orbit-store-whole-rec --runs 1    Orbit, the large app
# Needs a built dist/ and playwright's Chromium. Extra arguments go to claude plugin eval.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# claude plugin eval takes one --case glob, without braces; --cases a,b,c runs a copy of the plugin whose evals/ holds
# only those. It sits beside this one, so the manifest's ../../dist still reaches the build; the manifest and the cases
# are copied, since eval takes neither through a link, and each copied scaffold calls the real scaffold.mjs.
plugin="$repo/test/eval-plugin"
args=()
cases=""
evals=evals
while [ $# -gt 0 ]; do
  case "$1" in
    --cases) cases="$2"; shift 2 ;;
    --cases=*) cases="${1#--cases=}"; shift ;;
    --eval-dir) evals="$2"; shift 2 ;;
    --eval-dir=*) evals="${1#--eval-dir=}"; shift ;;
    *) args+=("$1"); shift ;;
  esac
done
if [ -n "$cases" ]; then
  plugin="$(mktemp -d "$repo/test/.eval-plugin-XXXXXX")"
  # No eval dir goes in as a link: eval refuses one that points outside the plugin.
  for entry in "$repo/test/eval-plugin"/*; do
    case "$(basename "$entry")" in evals | evals-*) ;; *) ln -s "$entry" "$plugin/" ;; esac
  done
  cp -R "$repo/test/eval-plugin/.claude-plugin" "$plugin/"
  mkdir "$plugin/$evals"
  IFS=, read -ra names <<<"$cases"
  for name in "${names[@]}"; do
    [ -f "$repo/test/eval-plugin/$evals/$name/case.yaml" ] || { echo "no case $name in test/eval-plugin/$evals" >&2; rm -rf "$plugin"; exit 1; }
    cp -R "$repo/test/eval-plugin/$evals/$name" "$plugin/$evals/"
    # The copy's scaffold still reaches scaffold.mjs from where the case really is.
    sed -i "s#\"\$(dirname \"\${BASH_SOURCE\[0\]}\")/#\"$repo/test/eval-plugin/$evals/$name/#" "$plugin/$evals/$name/scaffold.sh"
  done
fi
sessions="$(mktemp -d)"
# An eval run moves HOME and passes only EVAL_* variables on: the MCP server gets these through the plugin's manifest.
export EVAL_RPR_DIR="$sessions"
export EVAL_PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
# A case's scaffold gets neither: it reads them from here, so its dev server records where the MCP server reads.
mkdir -p "$repo/.agent-artifacts"
printf '{"sessions":"%s","browsers":"%s"}\n' "$sessions" "$EVAL_PLAYWRIGHT_BROWSERS_PATH" >"$repo/.agent-artifacts/eval-run.json"

stop_servers() {
  for pid in $(ls "$sessions/servers" 2>/dev/null); do kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; done
  [ "$plugin" = "$repo/test/eval-plugin" ] || rm -rf "$plugin"
}
trap stop_servers EXIT

cd "$repo"
# The skill's references sit outside the workspace, where a run may not read unless let: an installed skill can.
claude plugin eval "$plugin" \
  --scaffold --trust-plugin --allow-real-servers \
  --allow-tools Edit Write "mcp__plugin_react-perf-recorder_react-perf-recorder__*" \
  "Read(/$plugin/skills/**)" "Read(/$repo/claude/skills/**)" \
  --eval-dir "$evals" --model claude-sonnet-5 --no-publish ${args[@]+"${args[@]}"}
echo "recordings and dev server logs: $sessions"
