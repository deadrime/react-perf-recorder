#!/usr/bin/env bash
exec node "$(dirname "${BASH_SOURCE[0]}")/../scaffold.mjs" hidden-hook-state . --recorded=wait
