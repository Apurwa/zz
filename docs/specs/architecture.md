# Architecture Overview

> System design for zz (Claude Command Center).

See also: [[configuration]](./configuration.md) | [[session-persistence]](./session-persistence.md) | [[commands]](./commands.md) | [[dashboard]](./dashboard.md) | [[port-visibility]](./port-visibility.md) | [[security]](./security.md)

---

## What Is zz

zz is a local CLI tool that orchestrates multiple Claude Code agent sessions across projects using tmux. It provides a live dashboard, automatic state persistence, and session resumption so that closing your terminal doesn't lose your Claude conversations.

---

## System Requirements

| Dependency | Required | Purpose |
|---|---|---|
| Node.js >= 18 | Yes | Runtime |
| tmux | Yes | Terminal multiplexer -- workspace management |
| git | Yes | Project detection and status |
| Claude Code CLI | Yes | Agent sessions |
| lsof | No (macOS built-in) | [[Port discovery]](./port-visibility.md) |
| pgrep / ps | No (macOS built-in) | [[Session detection]](./session-persistence.md#session-id-capture) |

---

## Module Map

```
bin/cc.js                      Entry point (shebang)
  |
  v
src/index.js                   Command dispatcher
  |
  +-- src/commands/
  |     up.js                  Boot/restore workspace      -> [[commands#up]]
  |     down.js                Graceful shutdown            -> [[commands#down]]
  |     add.js                 Register projects            -> [[commands#add]]
  |     remove.js              Unregister project           -> [[commands#remove]]
  |     worker.js              Add worker pane              -> [[commands#worker]]
  |     open.js                Jump to window               -> [[commands#open]]
  |     status.js              Workspace summary            -> [[commands#status]]
  |     kill.js                Hard teardown                -> [[commands#kill]]
  |     doctor.js              Health check                 -> [[commands#doctor]]
  |
  +-- src/dashboard/
  |     index.js               TUI main loop                -> [[dashboard]]
  |     render.js              Output rendering             -> [[dashboard#display-layout]]
  |     input.js               Keyboard handlers            -> [[dashboard#keyboard-shortcuts]]
  |
  +-- src/watcher/
  |     index.js               State detection loop         -> [[session-persistence#watcher-loop]]
  |     detect.js              Pane diffing, session capture -> [[session-persistence#session-id-capture]]
  |     save.js                Atomic state write            -> [[session-persistence#atomic-writes]]
  |
  +-- src/ports/
  |     lsof.js                TCP port parsing             -> [[port-visibility#port-discovery]]
  |     categorize.js          Dev/infra/system buckets     -> [[port-visibility#categorization]]
  |     process.js             Command, cwd, uptime         -> [[port-visibility#process-enrichment]]
  |
  +-- src/config.js            Config and projects CRUD     -> [[configuration]]
  +-- src/state.js             State, locks, validation     -> [[session-persistence#lock-management]]
  +-- src/paths.js             Path constants and helpers   -> [[configuration#path-utilities]]
  +-- src/tmux.js              tmux command wrapper
  +-- src/selection.js         Range/list parser
  +-- src/help.js              Help and version strings
```

---

## Runtime Architecture

When `zz up` runs, it creates a tmux session with this structure:

```
tmux session: "cc"
  |
  +-- Window: dashboard
  |     Pane 0: Dashboard TUI (Node.js)      <- [[dashboard]]
  |     Pane 1: Watcher (Node.js, 1-row)     <- [[session-persistence#watcher-loop]]
  |
  +-- Window: <project-alias>                 (one per project)
  |     Pane 0: Orchestrator (65%)            <- claude --resume <id>
  |     Pane 1: Worker-1 (35%, stacked)       <- claude --resume <id>
  |     Pane N: Worker-N                      <- claude --resume <id>
  |
  +-- Window: ports (optional)                <- [[port-visibility]]
  |
  +-- Window: shell                           <- free terminal
```

### Process Hierarchy

```
Terminal
  -> tmux attach -t cc
       -> Dashboard pane: node dashboard/index.js
       -> Watcher pane:   node watcher/index.js
       -> Project panes:  zsh -> claude [--resume <id>]
```

---

## Data Flow

### State Persistence (continuous)

```
tmux panes  --(2s tick)--> Watcher --(diff)--> state.json
                             |
                       captureSessionId()
                        /           \
                  process tree    .jsonl files
```

See [[session-persistence]](./session-persistence.md) for full details.

### Dashboard Rendering (continuous)

```
git commands ----+
                 +--(parallel)--> render() --(2s)--> screen
port info ------+
watcher health -+
```

See [[dashboard]](./dashboard.md) for full details.

### Workspace Lifecycle

```
zz up
  |-> scaffold()           Create ~/.cc/ if needed
  |-> acquireLock()        PID-based lock
  |-> create tmux session  Dashboard + watcher + project windows
  |-> resume sessions      claude --resume from state.json
  |-> attach
  |
  |   ... user works ...
  |
  |   Watcher saves state every 2s (events) / 30s (heartbeat)
  |
zz down
  |-> trigger final save   Via watcher or direct fallback
  |-> SIGTERM Claude       Graceful stop of all sessions
  |-> kill tmux session
  |-> releaseLock()
```

---

## File Layout

### Source

```
src/
  index.js          37 lines    Command dispatcher
  config.js         83 lines    Config/projects CRUD
  state.js          90 lines    State, locks
  paths.js          68 lines    Path constants
  tmux.js           77 lines    tmux wrapper
  selection.js      33 lines    Range parser
  help.js           35 lines    Help text
  commands/         ~620 lines  9 CLI commands
  dashboard/        ~760 lines  TUI (render + input)
  watcher/          ~350 lines  State detection + save
  ports/            ~200 lines  Port discovery
```

**Total:** ~2,350 lines of source code.

### Tests

```
test/
  selection.test.js
  config.test.js
  state.test.js
  paths.test.js
  tmux.test.js
  integration.test.js
  commands/add.test.js
  dashboard/render.test.js
  ports/lsof.test.js
  watcher/detect.test.js
  watcher/save.test.js
```

Run with: `node --test 'test/*.test.js' 'test/**/*.test.js'`

### Configuration Files

```
~/.cc/
  config.json       User preferences         -> [[configuration#configjson]]
  projects.json     Registered projects      -> [[configuration#projectsjson]]
  state.json        Runtime session state    -> [[session-persistence#statejson-schema]]
  cc.lock           PID lock                 -> [[security#lock-safety]]
  watcher.pid       Watcher PID              -> [[session-persistence#watcher-loop]]
  save-trigger      Ephemeral trigger        -> [[session-persistence#save-triggers]]
```

---

## Dependencies

### Runtime (npm)

| Package | Version | Purpose |
|---|---|---|
| `chalk` | ^5.4.1 | Terminal colors |
| `cli-table3` | ^0.6.5 | Table rendering |

### System (required)

| Binary | Used by |
|---|---|
| `tmux` | Workspace management |
| `git` | Project detection, branch/sync info |
| `claude` | Agent sessions |

### System (optional, macOS built-in)

| Binary | Used by |
|---|---|
| `lsof` | [[Port discovery]](./port-visibility.md), [[process cwd]](./port-visibility.md#process-enrichment) |
| `pgrep` | [[Session detection]](./session-persistence.md#session-id-capture) |
| `ps` | [[Process args and uptime]](./port-visibility.md#process-enrichment) |

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| tmux over custom terminal | Battle-tested multiplexer, users already know it, supports detach/reattach natively |
| JSON files over database | Zero dependencies, human-readable, easy debugging |
| Atomic writes (tmp + rename) | Crash-safe without needing WAL or journaling |
| PID-based locking | Simple, handles crashes via liveness check |
| Process tree walking for session IDs | Claude doesn't expose session IDs via IPC; process args and `.jsonl` files are the only sources |
| 5-second cache TTL | Balances freshness vs. subprocess spawning cost at 2-second render intervals |
| Lazy command loading | CLI stays fast -- only the invoked command is imported |
| No network calls | Fully local tool, no telemetry, no updates, no auth |

---

## Spec Index

| Spec | Description |
|---|---|
| [[architecture]](./architecture.md) | This document -- system overview |
| [[configuration]](./configuration.md) | config.json, projects.json, scaffold flow |
| [[session-persistence]](./session-persistence.md) | state.json, watcher, detection, restore |
| [[commands]](./commands.md) | All 9 CLI commands |
| [[dashboard]](./dashboard.md) | TUI rendering, input, data collection |
| [[port-visibility]](./port-visibility.md) | Port discovery, categorization, enrichment |
| [[security]](./security.md) | Permissions, validation, atomic writes, locks |
