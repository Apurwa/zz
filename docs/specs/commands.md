# CLI Commands

> Complete reference for all zz commands.

**Source:** [`src/commands/`](../../src/commands/) | [`src/index.js`](../../src/index.js)

See also: [[architecture]](./architecture.md) | [[configuration]](./configuration.md) | [[session-persistence]](./session-persistence.md)

---

## Command Routing

**Source:** [`src/index.js`](../../src/index.js)

The entry point `bin/cc.js` calls `run(args)` which:
1. Strips the first two argv entries (node + script path)
2. Matches the first argument against the command table
3. Lazy-loads the command module via dynamic `import()`
4. Passes remaining args to the command function

Special flags: `--help` / `-h` prints help, `--version` / `-v` prints version.

---

## up

> Boot or restore the workspace.

**Source:** [`src/commands/up.js`](../../src/commands/up.js)

**Usage:** `zz up`

### Flow

```
1. Assert tmux is installed
2. Scaffold ~/.cc/ if first run
3. Acquire lock
   - If lock held by alive process + tmux session exists:
     -> handleExistingSession() -> attach
   - If lock stale: clean up, continue
4. If tmux session already exists: reattach
5. Read state.json, projects.json, config.json
6. First-run experience (if no projects)
7. Create tmux session with:
   a. Dashboard window (with hidden watcher pane)
   b. Per-project windows (orchestrator + workers)
   c. Ports window (if portscout_window enabled)
   d. Shell window
8. Resume Claude sessions from saved state
9. Restore focused window
10. Attach
```

### First-run Experience

If no projects are registered, `up` offers three paths:

| Scenario | Behavior |
|---|---|
| Current directory is a git repo | Auto-adds it with default workers |
| No git repo detected -- user picks "Scan" | Prompts for scan directory, lists found repos, multi-select via [[parseSelection]](../../src/selection.js) |
| No git repo detected -- user picks "Manual" | Prompts for a single path |

The scan directory is saved to [[config.scan_dir]](./configuration.md#fields) for reuse from the [[dashboard]](./dashboard.md#keyboard-shortcuts).

### Window Layout

Each project window is split:

```
+---------------------------+----------+
|                           | worker-1 |
|       orchestrator        |----------|
|         (65%)             | worker-2 |
|                           |----------|
|                           | worker-N |
+---------------------------+----------+
          65%                   35%
```

Workers are stacked vertically on the right, evenly divided.

### Session Resume

For each pane with a saved `claude_session_id`:
1. Validate ID with `isValidSessionId()` (see [[security]](./security.md#session-id-validation))
2. Send `claude --resume <id>` via tmux `send-keys`
3. On failure, send an echo warning instead

---

## down

> Graceful shutdown with state save.

**Source:** [`src/commands/down.js`](../../src/commands/down.js)

**Usage:** `zz down`

### Flow

```
1. Trigger final state save:
   a. Write save-trigger file
   b. Wait for watcher to process (with timeout)
   c. Fallback: direct saveState() if watcher is dead
2. Send SIGTERM to all Claude processes in all panes
3. Wait 5 seconds for clean exit
4. Kill tmux session
5. Release lock
```

### Save Trigger Mechanism

Rather than saving state directly, `down` asks the watcher to do it (the watcher has the latest pane snapshot). If the watcher doesn't respond within the timeout, `down` performs a direct save as fallback.

---

## add

> Register one or more projects.

**Source:** [`src/commands/add.js`](../../src/commands/add.js)

**Usage:** `zz add <path...> [--workers N]`

### Argument Parsing

| Argument | Description |
|---|---|
| `<path...>` | One or more project directory paths |
| `--workers N` | Override [[default_workers]](./configuration.md#fields) for these projects |

### Validation

Each path is checked:
- Must exist on disk
- Must be a git repository
- Must not already be registered (dedup by path)

### Behavior

- Alias is derived from the directory name (lowercased)
- Project is appended to [[projects.json]](./configuration.md#projectsjson)
- If the workspace is running, a new tmux window is created immediately

---

## remove

> Unregister a project.

**Source:** [`src/commands/remove.js`](../../src/commands/remove.js)

**Usage:** `zz remove <alias>`

### Flow

1. Find project by alias
2. If the workspace is running, kill the project's tmux window
3. Remove from [[projects.json]](./configuration.md#projectsjson)

---

## worker

> Add a worker pane to a project.

**Source:** [`src/commands/worker.js`](../../src/commands/worker.js)

**Usage:** `zz worker <alias>`

### Flow

1. Verify workspace is running (tmux session exists)
2. Find project by alias
3. Count existing panes in the project's window
4. Split a new vertical pane on the right side at 30% height

---

## open

> Jump to a project window.

**Source:** [`src/commands/open.js`](../../src/commands/open.js)

**Usage:** `zz open <alias>`

### Special Windows

In addition to project aliases, these built-in window names are recognized:

| Name | Description |
|---|---|
| `dashboard` | The [[dashboard TUI]](./dashboard.md) |
| `ports` | The [[port visibility]](./port-visibility.md) window (if enabled) |
| `shell` | The free shell window |

---

## status

> Print workspace summary.

**Source:** [`src/commands/status.js`](../../src/commands/status.js)

**Usage:** `zz status`

### Output

```
  Workspace: running (3 projects)
  Last saved: 2m ago (heartbeat)

  my-app      2/3 sessions active
  api-server  1/2 sessions active
  shared-lib  0/2 sessions active
```

Shows:
- Total project count and running state
- Last save time and [[trigger reason]](./session-persistence.md#save-triggers)
- Per-project: active sessions / total panes

---

## kill

> Hard teardown without saving.

**Source:** [`src/commands/kill.js`](../../src/commands/kill.js)

**Usage:** `zz kill`

### Flow

1. Check if tmux session exists
2. Kill session immediately (no state save, no SIGTERM to Claude)
3. Release lock

Use `zz down` for graceful shutdown. `kill` is for emergencies and stuck workspaces.

---

## doctor

> Health check and diagnostics.

**Source:** [`src/commands/doctor.js`](../../src/commands/doctor.js)

**Usage:** `zz doctor`

### Checks

| Check | Pass | Warn | Fail |
|---|---|---|---|
| tmux installed | Found in PATH | -- | Not found |
| claude CLI installed | Found in PATH | -- | Not found |
| portscout installed | Found in PATH | Not found (optional) | -- |
| `~/.cc/` directory | Exists, writable, `0o700` | -- | Missing or wrong perms |
| `config.json` | Valid JSON | -- | Parse error |
| `projects.json` | Valid JSON | -- | Parse error |
| `state.json` | Valid JSON, version 1 | Missing (no state yet) | Corrupted |
| Project directories | All exist | Some missing | -- |

### Output Symbols

- Green checkmark: pass
- Yellow warning: non-critical issue
- Red cross: critical failure
