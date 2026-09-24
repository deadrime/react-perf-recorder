#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# ci, а не install: install переписывает package-lock.json и пачкает дерево.
npm ci --no-audit --no-fund
# .mcp.json запускает MCP-сервер из dist/cli.js, а dist/ в git не лежит.
npm run build
