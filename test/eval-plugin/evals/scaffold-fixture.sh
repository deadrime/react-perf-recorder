#!/usr/bin/env bash
# The fixture app's source in the run's workspace, as the dev server serves it, without the files that name the bugs.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cp -R "$repo/test/e2e/fixture-app/src" ./src
rm -f ./src/bugs.ts ./src/Demo.tsx
