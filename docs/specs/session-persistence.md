# Session Persistence

> How zz saves and restores Claude Code sessions across restarts.

**Source:** [`src/state.js`](../../src/state.js) | [`src/watcher/`](../../src/watcher/)

See also: [[architecture]](./architecture.md) | [[configuration]](./configuration.md) | [[commands -- up]](./commands.md#up) | [[security]](./security.md)

---

## Overview

zz ensures that when a user shuts down their workspace and runs `zz up` again, every Claude Code session resumes exactly where it left off. This is achieved through:

1. A **watcher process** that continuously captures session state
2. **Atomic file persistence** to `~/.cc/state.json`
3. A **restore flow** in `zz up` that replays `claude --resume <id>` into each pane

---

## state.json Schema

```json
{
  "version": 1,
  "saved_at": "2026-04-13T15:30:45.123Z",
  "save_trigger": "heartbeat",
  "tmux": {
    "session": "cc",
    "focused_window": "my-app",
    "focused_pane": 0
  },
  "projects": {
    "/Users/apurwa/Projects/my-app": {
      "window_index": 2,
      "panes": [
        {
          "role": "orchestrator",
          "claude_session_id": "ses_abc123",
          "status": "active"
        },
        {
          "role": "worker-1",
          "claude_session_id": "ses_def456",
          "status": "active"
        }
      ]
    }
  }
}
```

### Top-level Fields

| Field | Type | Description |
|---|---|---|
| `version` | `number` | Always `1`. Used for forward compatibility -- unknown versions are treated as empty state |
| `saved_at` | `string` | ISO 8601 timestamp of last save |
| `save_trigger` | `string` | What caused this save: `event`, `heartbeat`, `manual`, or `shutdown` |
| `tmux.session` | `string` | tmux session name (always `cc`) |
| `tmux.focused_window` | `string\|null` | Window name the user was last viewing |
| `tmux.focused_pane` | `number` | Pane index the user was last focused on |

### Per-project State

| Field | Type | Description |
|---|---|---|
| `window_index` | `number` | tmux window index for this project |
| `panes[].role` | `string` | `orchestrator` or `worker-N` |
| `panes[].claude_session_id` | `string\|null` | Claude session ID for resume, or `null` if none captured |
| `panes[].status` | `string` | One of: `active`, `untracked`, `ready` |

### Pane Status Values

| Status | Meaning |
|---|---|
| `active` | Claude is running and session ID is captured |
| `untracked` | Claude is running but session ID could not be determined |
| `ready` | No Claude process detected in this pane |

---

## Watcher Loop

The watcher runs as a Node.js process inside a hidden tmux pane (1-row split at the bottom of the dashboard window). It is started by [[zz up]](./commands.md#up) and runs for the lifetime of the workspace.

**Source:** [`src/watcher/index.js`](../../src/watcher/index.js)

### Startup

1. Writes its PID to `~/.cc/watcher.pid`
2. Takes an initial snapshot of all tmux panes
3. Performs an immediate heartbeat save
4. Starts two interval loops

### Two Loop Strategy

| Loop | Interval | Purpose |
|---|---|---|
| **Tick** | 2 seconds | Diffs the current pane list against the previous snapshot. Saves only if panes were added or removed, or a manual trigger file exists |
| **Heartbeat** | [[auto_save_interval]](./configuration.md#fields) (default 30s) | Unconditional save regardless of changes. Captures slow-changing data like session IDs that appear after Claude finishes booting |

### Save Triggers

| Trigger | Source | Description |
|---|---|---|
| `event` | Tick loop | A pane was added or removed since the last tick |
| `manual` | Dashboard `s` key | User pressed `s` in the [[dashboard]](./dashboard.md#keyboard-shortcuts), which writes `~/.cc/save-trigger` |
| `heartbeat` | Heartbeat loop | Periodic unconditional save |
| `shutdown` | [[zz down]](./commands.md#down) | Final save before teardown |

### Pane Diffing

**Source:** [`src/watcher/detect.js` -- `diffPanes()`](../../src/watcher/detect.js)

Each tick, the watcher calls `tmux list-panes` and compares against the previous snapshot using `windowIndex:panePid` as the identity key. Returns `{ added, removed }` arrays.

---

## Session ID Capture

**Source:** [`src/watcher/detect.js` -- `captureSessionId()`](../../src/watcher/detect.js)

The watcher needs to discover which Claude session is running in each pane. This is non-trivial because Claude is a child process of the shell in the tmux pane. Two methods are used, in order:

### Method 1: Process Args

Walk the process tree from the pane's shell PID:

```
pane shell (panePid)
  -> child processes (pgrep -P)
    -> grandchild processes (pgrep -P)
```

For each process, read its command line (`ps -o args=`). If it contains `claude`, parse for the `--resume <id>` flag. This captures sessions that were resumed from a previous state.

### Method 2: Claude Session Files

If Claude is running (detected via `pgrep -P <pid> -x claude`) but no `--resume` flag is present (i.e., a fresh `claude` invocation), look up the session ID from Claude's own files:

1. Get the tmux session creation timestamp (`#{session_created}`)
2. Hash the project path to find Claude's project directory: `~/.claude/projects/<path-hash>/`
3. List `.jsonl` files modified **after** the tmux session started
4. Read the first line of the most recently modified file
5. Extract `sessionId` from the parsed JSON

This handles the case where a user typed `claude` (not `claude --resume`) in a pane.

### Session Cache

Results are cached in a `Map<panePid, { sessionId, claudeRunning }>`. Once a session ID is captured for a PID, it is not re-resolved. The cache is keyed by PID, so if a pane's shell restarts (new PID), it will be re-scanned.

---

## Restore Flow

**Source:** [`src/commands/up.js`](../../src/commands/up.js)

When `zz up` is run and a previous `state.json` exists:

### Fresh Start (no tmux session running)

1. Read `state.json`
2. Create the tmux session and all project windows with pane layouts
3. For each pane that has a `claude_session_id`:
   - Validate the ID against `^[a-zA-Z0-9_-]+$` (see [[security -- input validation]](./security.md#input-validation))
   - Run `sendKeys(target, 'claude --resume <id>')` into the pane
4. Restore `focused_window` from the saved tmux state
5. Attach to the session

### Reconnect (tmux session exists, stale lock)

If the tmux session `cc` is still alive but the lock is stale (process that locked it is dead):

1. Force-acquire the lock
2. Iterate all projects with saved pane state
3. For each pane with a valid `claude_session_id`, send `claude --resume <id>`
4. If resume fails, send an echo warning message instead
5. Attach to the existing session

---

## Atomic Writes

**Source:** [`src/watcher/save.js`](../../src/watcher/save.js)

All state writes use a crash-safe atomic pattern:

1. Write JSON to `state.json.tmp`
2. Set permissions to `0o600`
3. `rename()` the temp file to `state.json`

POSIX `rename()` is atomic on the same filesystem, so a crash mid-write leaves either the old state or the new state -- never a corrupted file.

See [[security -- atomic writes]](./security.md#atomic-writes) for details.

---

## Lock Management

**Source:** [`src/state.js`](../../src/state.js)

A PID-based lock prevents concurrent `zz up` invocations.

| Function | Behavior |
|---|---|
| `acquireLock()` | Writes PID to `cc.lock`. If lock exists, checks if the PID is alive (`process.kill(pid, 0)`) |
| `releaseLock()` | Deletes `cc.lock` |
| `forceLock()` | Overwrites `cc.lock` unconditionally (used for stale recovery) |

### Stale Lock Detection

If `cc.lock` contains a PID that is no longer running, the lock is considered stale and is overwritten. This handles cases where the process crashed without cleanup.

---

## Data Flow Diagram

```
  Dashboard 's' key
        |
        v
  ~/.cc/save-trigger  -----> Watcher tick (2s)
                                  |
  Pane add/remove  ------------->|
                                  |
                                  v
                          buildProjectState()
                                  |
                           captureSessionId()
                            /           \
                      Method 1:       Method 2:
                     process args    .jsonl files
                            \           /
                             v         v
                          saveState()
                              |
                              v
                     state.json.tmp -> state.json
                              |
                              v
                         zz up reads
                              |
                              v
                    claude --resume <id>
```

---

## Watcher Health

The [[dashboard]](./dashboard.md) monitors the watcher process by checking if `~/.cc/watcher.pid` is alive. If the watcher dies, the dashboard respawns it in the hidden pane.
