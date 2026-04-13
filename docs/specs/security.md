# Security Model

> How zz protects user data, prevents corruption, and validates input.

**Source:** [`src/config.js`](../../src/config.js) | [`src/state.js`](../../src/state.js) | [`src/watcher/save.js`](../../src/watcher/save.js)

See also: [[architecture]](./architecture.md) | [[configuration]](./configuration.md) | [[session-persistence]](./session-persistence.md)

---

## File Permissions

All files under `~/.cc/` are restricted to the owning user.

| Resource | Permission | Meaning |
|---|---|---|
| `~/.cc/` directory | `0o700` | Owner: read/write/execute. Others: no access |
| `config.json` | `0o600` | Owner: read/write. Others: no access |
| `projects.json` | `0o600` | Owner: read/write. Others: no access |
| `state.json` | `0o600` | Owner: read/write. Others: no access |
| `cc.lock` | `0o600` | Owner: read/write. Others: no access |
| `watcher.pid` | `0o600` | Owner: read/write. Others: no access |

### Self-healing

On every `scaffold()` call (triggered by [[zz up]](./commands.md#up)):
- If `~/.cc/` exists, permissions are re-applied to `0o700`
- This handles cases where permissions were accidentally changed

### writeSecure()

All config/project writes go through `writeSecure()` in `src/config.js`, which:
1. Writes the JSON content
2. Immediately calls `chmodSync(filePath, 0o600)`

---

## Atomic Writes

State and config files use an atomic write pattern to prevent corruption from crashes or concurrent writes.

### Pattern

```
1. writeFileSync('state.json.tmp', data)
2. chmodSync('state.json.tmp', 0o600)
3. renameSync('state.json.tmp', 'state.json')
```

### Why This Is Safe

- `rename()` is atomic on POSIX filesystems (same filesystem)
- If the process crashes during step 1 or 2, only the `.tmp` file is affected
- The original `state.json` remains untouched until the rename
- Readers always see either the old complete state or the new complete state

### Where Used

| File | Writer |
|---|---|
| `state.json` | [[watcher saveState()]](./session-persistence.md#atomic-writes) and `writeState()` in `src/state.js` |
| `config.json` | `writeSecure()` in `src/config.js` |
| `projects.json` | `writeSecure()` in `src/config.js` |

---

## Input Validation

### Session ID Validation

**Source:** [`src/state.js` -- `isValidSessionId()`](../../src/state.js)

Before passing a session ID to `claude --resume <id>` (which runs in a shell via `tmux send-keys`), the ID is validated against:

```
/^[a-zA-Z0-9_-]+$/
```

This prevents shell injection through crafted session IDs in `state.json`. Only alphanumeric characters, hyphens, and underscores are allowed.

**Where enforced:**
- [[Restore flow]](./session-persistence.md#restore-flow) in `zz up` -- skips panes with invalid IDs
- [[Reconnect flow]](./session-persistence.md#reconnect) in `handleExistingSession()` -- same check

### Path Validation

Paths provided to [[zz add]](./commands.md#add) are validated:
- Must exist on disk (`existsSync`)
- Must be a git repository (`isGitRepo` runs `git rev-parse --git-dir`)

### Selection Input

The [[selection parser]](../../src/selection.js) (`parseSelection()`) handles arbitrary user input for the directory scanner:
- Out-of-bounds indices are silently skipped
- Duplicate indices are deduplicated
- Non-numeric input is ignored
- No shell execution of user input

---

## Lock Safety

**Source:** [`src/state.js`](../../src/state.js)

### PID-based Locking

The lock file `~/.cc/cc.lock` contains the PID of the process that holds the lock. This prevents concurrent `zz up` invocations from corrupting state.

### Stale Lock Detection

```javascript
function isPidAlive(pid) {
  try {
    process.kill(pid, 0)  // signal 0 = existence check
    return true
  } catch {
    return false
  }
}
```

If the lock file exists but the PID is dead, the lock is considered stale and is overwritten. This handles:
- Process crashes (SIGKILL, OOM)
- System restarts
- Force-killed terminals

### Lock Lifecycle

```
zz up    -> acquireLock()   writes PID
  ...workspace running...
zz down  -> releaseLock()   deletes lock file
```

If `zz down` is never called (crash), the next `zz up` detects the stale lock and recovers.

---

## Process Execution Safety

### Timeouts

All external process calls (`execFileSync`) use a 3-second timeout:
- `git` commands in [[dashboard data collection]](./dashboard.md)
- `pgrep` / `ps` in [[session detection]](./session-persistence.md#session-id-capture)
- `lsof` in [[port discovery]](./port-visibility.md)

This prevents the dashboard from hanging if a subprocess stalls.

### execFileSync vs exec

The codebase uses `execFileSync` (not `exec` or `execSync`) for external commands. This avoids shell interpretation of arguments, preventing injection through filenames or paths.

### No Network Access

zz makes zero network calls. All data is local:
- File reads from `~/.cc/` and `~/.claude/`
- Process queries via `pgrep`, `ps`, `lsof`
- tmux commands via `tmux` binary

---

## Threat Model

| Threat | Mitigation |
|---|---|
| Other users reading session data | `0o600` / `0o700` permissions |
| Corrupted state from crash | Atomic writes (tmp + rename) |
| Shell injection via session IDs | Regex validation before `send-keys` |
| Concurrent workspace launches | PID-based lock file |
| Stale lock blocking startup | PID liveness check |
| Hung subprocess blocking dashboard | 3-second timeouts on all exec calls |
| Path traversal via project paths | Paths validated against filesystem |
