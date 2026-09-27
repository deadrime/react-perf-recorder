#!/usr/bin/env bash
exec node "$(dirname "${BASH_SOURCE[0]}")/../scaffold.mjs" whole-object,sort-order-inline . --recorded=wait
