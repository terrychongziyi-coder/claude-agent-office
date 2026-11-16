#!/bin/sh
# SessionStart hook — called by Claude Code on the host.
# Reads $TMUX_PANE from the environment and POSTs it to the backend.
#
# Claude Code passes session context as JSON on stdin.
# The hook config must set type: "command" so this script runs in the
# Claude Code process environment where $TMUX_PANE is inherited from the shell.

set -e

# Read stdin into a variable (Claude Code passes the event JSON here).
INPUT=$(cat)

# JSON may be compact or pretty-printed, so allow spaces around the colon.
field() { sed -n "s/.*\"$1\" *: *\"\([^\"]*\)\".*/\1/p" | head -1; }

SESSION_ID=$(printf '%s' "$INPUT" | field session_id)
CWD=$(printf '%s' "$INPUT" | field cwd)

# If session_id is empty, nothing to register.
[ -z "$SESSION_ID" ] && exit 0

# $TMUX_PANE is set by tmux in the shell that started Claude Code.
# It looks like %0, %1, etc.
PANE="${TMUX_PANE:-}"

# Locate config to read the token.
CONFIG_PATH="${CONFIG_PATH:-$HOME/.claude-agent-office/config.json}"
if [ ! -f "$CONFIG_PATH" ]; then
  # Fallback: look next to this script.
  DIR=$(dirname "$0")
  CONFIG_PATH="$DIR/../config.json"
fi

TOKEN=$(field token < "$CONFIG_PATH" 2>/dev/null)
[ -z "$TOKEN" ] && exit 0

PORT="${AO_PORT:-4000}"
URL="http://127.0.0.1:${PORT}/api/pane"

# POST pane registration. Fire-and-forget; don't block Claude Code startup.
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "x-ao-token: $TOKEN" \
  -d "{\"session_id\":\"$SESSION_ID\",\"pane\":\"$PANE\",\"cwd\":\"$CWD\"}" \
  --max-time 3 >/dev/null 2>&1 || true

exit 0
