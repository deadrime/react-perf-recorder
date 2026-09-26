#!/usr/bin/env bash
exec node "$(dirname "${BASH_SOURCE[0]}")/../scaffold.mjs" draft-context . --recorded=type
