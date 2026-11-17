# agent-office

Local web app that runs several Claude Code sessions ("workers") and drives them from one browser tab:
a 3D office, a per-worker panel, and a group chat that routes messages by name. See README.md for user-facing behaviour.

## Commands

- `npm start` — server on `127.0.0.1:4000` (`PORT` or `config.json` `port` to change). Prints the UI URL with the token.
- `npm test` — `node --test src/*.test.js`. Keep the glob: Node 25 treats a bare `src/` argument as one file and fails.
- No build step, no bundler, no TypeScript, no lint config. Plain ESM JavaScript, Node 20+.

## Layout

```
src/server.js   Express + WebSocket; every route; chat/handoff/settings orchestration
src/runner.js   one headless `claude -p` process per worker; stream-json in/out; validation; moveWorker
src/chat.js     pure logic: message addressing (@names, #project, /model, /effort) and the hop guard
src/state.js    in-memory sessions (200-entry output ring buffer), workers, projects, WebSocket broadcast
src/config.js   config.json read/write (token generated on first start)
src/upload.js   /api/upload storage: uploads/<stamp>-<id>/<sanitised name>, passed to workers via --add-dir
src/open.js     /api/open policy: documents and folders open, everything else is only revealed in Finder
public/app.js   whole UI: Three.js office, panels, group chat, worker editor (single file by design)
public/md.js    escape-first Markdown renderer for Claude's replies
tools/ao-msg.js worker-to-worker handoff CLI (rate-limited, server hop-guarded)
```

## How it works

- **Workers** live in `config.json` (`workers`, `projects`, `token`). `config.json` is git-ignored because it holds the token; never commit it or print the token.
- **Runner** spawns `claude -p --input-format stream-json --output-format stream-json --permission-prompt-tool stdio ...` with no shell, in the worker's `cwd`. Permission prompts and `AskUserQuestion` arrive as `control_request` and are answered from the UI via `/api/decision`.
- **Identity**: each process gets `--append-system-prompt` (name, role, teammates, how to use ao-msg) plus `--system-prompt-snapshot off` so renames and old conversations pick it up. It also gets env `AO_WORKER_ID` (ao-msg sends it as the sender) and `--allowedTools "Bash(node <abs>/tools/ao-msg.js *)"` so handoffs never prompt.
- **Conversations are per worker per folder.** `worker.session_id`/`resumable`/`resume_id` belong to the current `cwd`; other folders' conversations are parked in `worker.sessions[cwd]`. `moveWorker()` swaps them. These fields are server-owned: the browser never sets them.
- **Settings changes** (model, effort, mode, cwd, name, role) go through `workerChanged()`: the process is dropped and restarted on the next instruction with `--resume`. A change that needs a restart is refused while the worker is busy (`isBusy`), never applied by killing a running task.
- **Chat grammar** (`src/chat.js`): names first (`@A @B` or `A,`/`A:`), then any of `#project`, `/model x`, `/effort x` in any order, then the message. Directives only count in that position, so `#42` or `/model` mid-sentence stay text. The worker panel accepts `/model` and `/effort` only. A chat message is all-or-nothing across its targets.
- **Hop guard**: count resets to 0 when the user messages a worker; a handoff gives the recipient sender+1; a sender at `MAX_HOPS` (3) is refused. In memory only.
- **Output entry kinds** (state ring buffer, also broadcast): `text`, `tool_start`, `tool_done`, `tool_fail` (empty `tool_name` = session-level error), `notification`, `you` (has `chat_id` to dedupe multi-target chat messages), `handoff` (`from`, `to`). The UI derives both the worker log and the group chat timeline from these.

## Invariants (do not weaken)

- Bind `127.0.0.1` only. Every `/api` route and the WebSocket need the token; browser requests must come from the app's own origin.
- Anything that becomes a `claude` argument is validated (`validateWorker`, `folderError`, `NAME_RE`, `MODES`, `EFFORTS`, model regex). Spawn without a shell.
- Reply text reaches the DOM only through `esc()` or `md()`; `md()` escapes before adding markup. Never `innerHTML` raw model output.
- Worker names are one word and unique case-insensitively (server enforces; the editor mirrors it).
- `/api/open` never runs a program: only the `DOCS` allowlist and non-bundle folders are opened; everything else gets `open -R`. `execFile`, no shell.

## Lists that must stay in sync

- Models: `MODELS` in `public/app.js` and `MODEL_IDS` in `src/chat.js`.
- Effort levels: `EFFORTS` in `src/runner.js`, `EFFORT_LEVELS` in `src/chat.js`, `EFFORTS` in `public/app.js`.
- Name rule: `NAME_RE` in `src/runner.js`, `NAME` in `src/chat.js`, the regex in the editor save handler in `public/app.js`.

## Testing

- Unit tests cover pure logic only (`chat.js`, `moveWorker`, `md.js`). Put new pure logic in `src/chat.js` or a small module and test it there.
- End-to-end without spending tokens: put a stub `claude` shell script first on `PATH`, run the server with `CONFIG_PATH=/tmp/.../config.json` and a non-default port (e.g. 4111), drive it with `curl` and `tools/ao-msg.js` (set `AO_WORKER_ID`, `CONFIG_PATH`). The stub can log its argv/env and emit stream-json lines (e.g. a `can_use_tool` control_request) to simulate states.
- Port 4000 is usually the user's live instance with real Claude sessions: never kill it or point tests at its config.
- UI changes have no automated test; say so when reporting and ask the user to check in the browser.

## Style

- Minimal diffs, no new dependencies without asking (Three.js comes from unpkg via the import map; there is no frontend package install).
- Deliberate shortcuts carry a `ponytail:` comment naming the limit and the upgrade path.
- Keep README.md in step with user-visible behaviour.

## Known limits

- Busy workers are refused (not queued) for moves and settings changes.
- The ao-msg rate limit (10/min) is one file in `/tmp`, shared by all workers.
- Teammate list in the identity prompt is fixed at process start.
- `md.js`: no `[text](url)` links, images or nested lists; paths with spaces are not linked. `/api/open` is macOS only.
- `uploads/` is never cleaned up; uploads are copies, so worker edits do not reach the user's original file.
- Session output is in memory and lost on restart; conversations themselves persist via `claude --resume`.
