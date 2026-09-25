#!/usr/bin/env bash
exec node "$(dirname "${BASH_SOURCE[0]}")/../scaffold-fixture.mjs" inline-jsx-prop . --recorded=type
