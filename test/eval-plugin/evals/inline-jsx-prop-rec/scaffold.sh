#!/usr/bin/env bash
exec node "$(dirname "${BASH_SOURCE[0]}")/../scaffold.mjs" inline-jsx-prop . --recorded=type
