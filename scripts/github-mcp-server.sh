#!/usr/bin/env bash
# Resolves GitHub token (env var or gh CLI) and starts the GitHub MCP server via Docker.
# Used by .mcp.json to avoid shell metacharacters in MCP arguments.

set -euo pipefail

token="${GITHUB_PERSONAL_ACCESS_TOKEN:-}"
if [ -z "$token" ]; then
  token="$(gh auth token)"
fi

exec docker run -i --rm \
  -e GITHUB_PERSONAL_ACCESS_TOKEN="$token" \
  ghcr.io/github/github-mcp-server stdio \
  --toolsets=default,actions,notifications
