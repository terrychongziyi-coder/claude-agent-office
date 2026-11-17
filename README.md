<img src="public/brand/agent-office-logo-horizontal.svg" alt="agent-office" height="48">

# Agent Office

A local-only web app for running and driving several Claude Code sessions from one browser tab.
Each worker in the 3D office is a Claude Code session working in a project folder. You send it instructions, read its output as it streams, and answer its permission prompts and questions.

agent-office starts each session itself with the `claude` CLI in headless mode (`claude -p` with stream-json input and output). The sessions use your normal Claude Code login and settings. agent-office never reads your credentials and does not call the Anthropic API.

---

## Requirements

- **Node.js 20+**
- **Claude Code CLI** (`claude`) installed and logged in

---

## Quick start

```sh
npm install
npm start
```

The server prints the UI address, with a random token generated on first start and kept in `config.json`:

```
agent-office started
  UI: http://127.0.0.1:4000/?token=<TOKEN>
```

Open it, click **Manage workers**, add a worker with a project folder, then select it and send an instruction.

---

## Workers

Each worker has:

| Field | Meaning |
|---|---|
| Name, role, outfit, hair, accessory, desk | How it appears in the office (8 desks) |
| Project folder | Absolute path; Claude works inside it |
| Model | Default (your Claude Code setting), Fable 5.2, Opus 5.5, Sonnet 5.5, Haiku 5.5, the 1M-context versions of Fable, Opus and Sonnet, Opus plan (Opus plans, Sonnet does the work) or Best |
| Effort | Default (your Claude Code setting), Low, Medium, High, Extra high or Max (`claude --effort`) |
| Permission mode | **Auto** (default: asks only for risky actions), Manual (asks before every action), Plan (read-only, proposes a plan), Accept edits (edits without asking). Bypass permissions is not offered. |

- Claude starts in the worker's folder when you send its first instruction, and keeps running between instructions.
- Each worker has one conversation per folder. Moving a worker to another folder (in Manage workers or with `#project` in chat) parks the current conversation; moving back resumes it. After a server restart, the next instruction resumes the folder's conversation (`claude --resume`).
- Changing the model, mode, name or role restarts Claude on the next instruction and keeps the conversation.
- A busy worker cannot be moved to another folder; wait or press **Stop** first.
- **Stop** interrupts the current task. Removing a worker stops its Claude process.
- Permission prompts and Claude's questions appear in the panel. Nothing is approved automatically by agent-office; in Auto mode, Claude Code itself decides which actions are safe enough to run without asking.

Workers are stored in `config.json`. Session output is kept in memory (last 200 entries per worker) and is cleared when the server restarts.

---

## Group chat

The **Group chat** panel shows one timeline: your messages, every worker's replies, and session errors. Tool activity and permission prompts stay in each worker's own panel; click a name or a "needs you" badge to open it.

Start a message with who it is for:

```
@David fix the login bug
@David @Amy pair on the checkout flow
David, run the tests
@David #billing-api fix the invoice total      (moves David to the billing-api project first)
@David @Amy /model haiku                       (switches model; no message needed)
@David #web /model sonnet build the header     (project, model, then the message)
```

`/model` takes `fable`, `opus`, `sonnet`, `haiku`, `fable[1m]`, `opus[1m]`, `sonnet[1m]`, `opusplan`, `best`, `default` or a full model id. `/effort` takes `low`, `medium`, `high`, `xhigh`, `max` or `default` (e.g. `@David /effort max`). Both also work at the start of a message in a worker's own panel, are saved like the **Model** and **Effort** fields in Manage workers, and keep the conversation: Claude restarts with the new setting on the next instruction. A busy worker's settings cannot be changed (wait or press **Stop**).

- The message goes word for word to each named worker; nobody else sees it.
- Each worker is told its own name, role and teammates when Claude starts, so it knows "David" means itself.
- Names are one word (letters, digits, `_`, `-`) and unique, ignoring case.
- `#project` only counts right after the names, so `#42` later in a message is plain text. An unknown project name is an error, not a silent no-op.
- If any named worker has no project folder, is waiting for your answer, or is busy and would have to move, nothing is sent.
- If two busy workers end up in the same folder, the chat warns you; their edits can collide.

### Attaching files

Drag files onto the chat box or a worker's instruction box, or paste them (screenshots included). Each file is uploaded to `agent-office/uploads/<time>-<id>/` and its path is inserted into your message, e.g. `@David review this` followed by the path. Browsers never reveal where a dropped file lives on your Mac, so the worker reads the uploaded copy; changes it makes go to that copy, not your original. Workers can read the uploads folder without a permission prompt (`--add-dir`). Max 25 MB per file. The folder is git-ignored and never cleaned up automatically.

### Links in replies

URLs in Claude's replies open in a new tab. File and folder paths (absolute or `~/…`, also inside backticks) are clickable too: the server opens them with macOS `open`. Documents (html, pdf, images, office files, text, csv, json, …) and folders open directly; anything else, such as scripts, apps or `.command` files, is only revealed in Finder, so a link can never run a program. Paths with spaces are not detected.

### Projects

Add projects (a one-word name and an absolute folder) under **Manage workers → Projects**. They are stored in `config.json` and also show up as suggestions in a worker's folder field.

---

## Upgrading from the tmux version

Earlier versions read sessions through Claude Code hooks and typed into tmux. Neither is needed now. If you added the hooks to a settings file, remove them (preview first; `--apply` writes a backup before changing the file):

```sh
npm run unhook                    # preview for ~/.claude/settings.json
npm run unhook -- --apply
npm run unhook -- --apply --settings /path/to/project/.claude/settings.local.json
```

Only agent-office entries are removed; other hooks and settings are kept. Old workers without a project folder stay in the list; edit them and set a folder to use them again.

---

## Security model

- The server binds to `127.0.0.1` only. Set `PORT` to use a port other than 4000.
- Every `/api` route and the WebSocket require the token (`?token=` or the `x-ao-token` header).
- Browser requests must also come from the app's own origin. Any web page can reach `localhost`, and these routes run commands through Claude, so a request from another origin is rejected.
- Worker settings become `claude` arguments, so the server validates them: the folder must be an existing absolute directory, the mode must be one of the four listed, and the model name cannot look like a flag. Processes are started without a shell.

---

## Inter-agent messaging (`ao-msg`)

A worker can send another worker an instruction:

```sh
node /path/to/agent-office/tools/ao-msg.js <worker-name> "<message>" [--hop N] [--from <session-id>]
```

Workers can hand work to each other when you ask, e.g.:

```
@David add pagination to /orders. When you're done, message Amy with exactly what the frontend must change.
```

- The recipient sees `[Message from David (Backend), your teammate in agent-office]` before the text. The server sets `AO_WORKER_ID` for each worker, so `--from` is not needed.
- The handoff shows in the group chat as **David → Amy** and in the recipient's panel.
- Workers may run `ao-msg` without a permission prompt; other shell commands still follow the worker's permission mode.
- A handoff to a worker that is waiting on your permission prompt is rejected, and the sender is told why.
- **Rate:** 10 messages per 60 seconds (enforced locally in `/tmp/ao-msg-rl.json`).
- **Hops:** the server counts handoffs itself and allows 3 per chain, counted from your last message to the sender. A 4th is rejected and the worker is told to report back to you instead, so two workers cannot bounce work back and forth forever. Messaging a worker yourself starts its count again. `--hop` is no longer needed.

---

## Project structure

```
src/
  server.js    — Express + WebSocket server, all routes
  runner.js    — starts and drives one headless Claude process per worker
  chat.js      — works out which workers a group-chat message is for (tests: npm test)
  state.js     — in-memory session state, output ring buffer, WebSocket broadcast
  config.js    — config.json read/write, token generation
tools/
  ao-msg.js        — inter-agent message CLI (rate-limited, hop-guarded)
  remove-hooks.js  — removes hooks left by the tmux version from a settings file
public/
  index.html   — page markup and styles
  app.js       — Three.js office, command panel, worker editor, backend wiring
  md.js        — minimal Markdown renderer (also turns URLs and file paths into links) for Claude's replies (tables, code, lists; escapes all HTML)
```
