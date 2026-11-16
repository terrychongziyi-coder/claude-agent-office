# Agent Office

A local-only web dashboard for monitoring and driving Claude Code sessions.
Each session appears as a worker you can inspect, talk to, and approve permissions for — all from one browser tab.

---

## Requirements

- **Node.js 20+**
- **tmux** — needed to send instructions from the UI (status, output and approvals work without it)
- **curl** — used by the pane-registration hook

---

## Quick start

```sh
npm install
npm start
```

On first boot the server generates a random token and prints:

```
agent-office started
  UI:       http://127.0.0.1:4000/?token=<TOKEN>
  Hook URL: http://127.0.0.1:4000/hook?token=<TOKEN>
  Token:    <TOKEN>
```

Open the UI URL in your browser.

---

## Hook setup (one-time)

The server prints the exact JSON block to add to your Claude Code settings on every startup. Add it to either:

- **Global**: `~/.claude/settings.json`
- **Project**: `.claude/settings.local.json`

The snippet looks like this (token and paths will differ):

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{ "type": "command", "command": "/path/to/agent-office/hooks/register-pane.sh" }]
    }],
    "PreToolUse":        [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:4000/hook?token=TOKEN", "timeout": 10000 }] }],
    "PostToolUse":       [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:4000/hook?token=TOKEN", "timeout": 10000 }] }],
    "PostToolUseFailure":[{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:4000/hook?token=TOKEN", "timeout": 10000 }] }],
    "PermissionRequest": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:4000/hook?token=TOKEN", "timeout": 120000 }] }],
    "Notification":      [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:4000/hook?token=TOKEN", "timeout": 10000 }] }],
    "Stop":              [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:4000/hook?token=TOKEN", "timeout": 10000 }] }],
    "StopFailure":       [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:4000/hook?token=TOKEN", "timeout": 10000 }] }],
    "SessionEnd":        [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:4000/hook?token=TOKEN", "timeout": 10000 }] }]
  },
  "allowedHttpHookUrls": ["http://127.0.0.1:4000"]
}
```

**Copy the snippet from the server's terminal output** — it already has the correct token and path.

Or let the installer merge it for you (preview first, then apply; it backs up the file):

```sh
npm run hooks                                   # preview, token hidden
npm run hooks -- --apply                        # writes ~/.claude/settings.json
npm run hooks -- --apply --settings /path/to/project/.claude/settings.local.json
```

The token is generated once and stored in `config.json`. Restarting the server reuses the same token, so hook configuration only needs to be done once.

---

## Starting a monitored session

```sh
tmux new-session -s work
claude                # starts Claude Code inside the tmux pane
```

The `register-pane.sh` hook fires on `SessionStart`, reads `$TMUX_PANE`, and registers it with the backend. The session appears in the dashboard within seconds.

---

## Security model

The dashboard accepts two auth checks on every request:

| Check | Where applied |
|-------|--------------|
| **Token** (`?token=` or `x-ao-token` header) | All endpoints |
| **Origin header** | Browser-facing endpoints (`/api/*`, `/ws`) |

The `/hook` endpoint skips the Origin check because HTTP hooks from Claude Code are not browser requests. Both checks are required for the browser endpoints because **any web page can reach `localhost`**, and the send endpoint types directly into your terminals.

The server binds to `127.0.0.1:4000` only, so the port is unreachable from other machines. Set `PORT` to use a different port.

---

## Worker editor

Click **⚙ Workers** in the sidebar to open the worker editor:

- **Add worker** — name, role, outfit colour, hair, accessory, desk slot, and bound session.
- **Edit** — change any of the above, or assign a detected session.
- **Remove** — removes the worker definition (does not stop the session).

Workers are stored in `config.json`. The office has 8 desks; each worker picks one in the editor's top-down plan.

---

## Inter-agent messaging (`ao-msg`)

Workers can send each other instructions without leaving Claude Code:

```sh
node /path/to/agent-office/tools/ao-msg.js <worker-name> "<message>"
```

Example — from inside a Claude Code session, tell "Bob" to review a file:

```sh
node ~/agent-office/tools/ao-msg.js Bob "please review src/auth.js for security issues"
```

**Options**

| Flag | Description |
|------|-------------|
| `--hop N` | Current hop depth (backend rejects at N ≥ 3; include when forwarding a received message) |
| `--from <session-id>` | Sends as a prefixed label in the target pane |

**Limits**

- **Rate**: 10 messages per 60 seconds (enforced locally in `/tmp/ao-msg-rl.json`).
- **Hops**: max 3 per chain (enforced by the backend). A message that arrives with hop=2 may not be forwarded again.

---

## Config file

`config.json` is created automatically. It stores:

- `token` — the per-installation auth token
- `workers` — worker definitions (name, colour, assigned session)

This file is git-ignored. Do not commit it.

---

## Project structure

```
src/
  server.js    — Express + WebSocket server, all routes
  config.js    — config.json read/write, token generation
  state.js     — in-memory session state, ring buffer, WS broadcast
  hooks.js     — Claude Code hook event handler
  tmux.js      — tmux send-keys wrapper
hooks/
  register-pane.sh  — SessionStart shell hook (reads $TMUX_PANE)
tools/
  install-hooks.js — merges the hook config into a Claude settings file
  ao-msg.js    — inter-agent message CLI (rate-limited, hop-guarded)
public/
  index.html   — page markup and styles
  app.js       — Three.js 3D office, command panel, worker editor, backend wiring
```

---

## Milestones

- **M1 ✓** — Backend, hook wiring, minimal status dashboard
- **M2 ✓** — Three.js low-poly office scene, worker avatars, CSS2D labels
- **M3 ✓** — Command history, pane-unbound feedback
- **M4 ✓** — Worker editor modal (add/edit/delete/assign), inter-agent messaging helper (`ao-msg`)
