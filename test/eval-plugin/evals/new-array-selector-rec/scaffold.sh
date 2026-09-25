#!/usr/bin/env bash
exec node "$(dirname "${BASH_SOURCE[0]}")/../scaffold-fixture.mjs" new-array-selector . --recorded=wait
