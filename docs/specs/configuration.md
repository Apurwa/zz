# Configuration

> How zz stores user preferences and project registry.

**Source:** [`src/config.js`](../../src/config.js) | [`src/paths.js`](../../src/paths.js)

See also: [[architecture]](./architecture.md) | [[session-persistence]](./session-persistence.md) | [[security]](./security.md)

---

## Storage Location

All configuration lives under `~/.cc/` (the `CC_DIR` constant from `src/paths.js`).

| File | Purpose | Created by |
|---|---|---|
| `config.json` | User preferences | `scaffold()` on first run |
| `projects.json` | Registered project list | `scaffold()` on first run |
| `state.json` | Runtime session state | [[watcher]](./session-persistence.md#watcher-loop) |
| `cc.lock` | PID lock file | [[up command]](./commands.md#up) |
| `watcher.pid` | Watcher process PID | [[watcher]](./session-persistence.md#watcher-loop) |
| `save-trigger` | Ephemeral trigger file | [[dashboard]](./dashboard.md#keyboard-shortcuts) `s` key |

---

## config.json

User-facing preferences. Created with defaults on first `zz up`.

### Schema

```json
{
  "default_workers": 2,
  "auto_save_interval": 30,
  "portscout_window": false,
  "scan_dir": null
}
```

### Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `default_workers` | `number` | `2` | Number of worker panes created per project window |
| `auto_save_interval` | `number` | `30` | Seconds between [[heartbeat saves]](./session-persistence.md#save-triggers) |
| `portscout_window` | `boolean` | `false` | Whether to create a dedicated [[ports]](./port-visibility.md) tmux window |
| `scan_dir` | `string\|null` | `null` | Last directory used for the [[directory scanner]](./commands.md#first-run-experience). Stored as tilde-contracted path (e.g. `~/Projects`) |

### Operations

| Function | Behavior |
|---|---|
| `readConfig(baseDir)` | Reads and parses `config.json`. Returns `DEFAULT_CONFIG` on any error |
| `updateConfig(baseDir, updates)` | Shallow-merges `updates` into current config, writes atomically |

---

## projects.json

Array of registered projects. Each entry represents one tmux window with an orchestrator pane and N worker panes.

### Schema

```json
[
  {
    "path": "/Users/apurwa/Projects/my-app",
    "workers": 2,
    "alias": "my-app"
  }
]
```

### Fields

| Field | Type | Description |
|---|---|---|
| `path` | `string` | Absolute path to the project directory (must be a git repo) |
| `workers` | `number` | Number of worker panes for this project |
| `alias` | `string` | Lowercase directory name, used as tmux window name and CLI identifier |

### Operations

| Function | Behavior |
|---|---|
| `readProjects(baseDir)` | Returns array, or `[]` on error |
| `addProject(baseDir, project)` | Appends project. **Deduplicates by `path`** -- returns `false` if already registered |
| `removeProject(baseDir, alias)` | Removes by alias. Returns `false` if not found |
| `findProject(baseDir, aliasOrPath)` | Looks up by alias or path. Returns project object or `null` |

### Constraints

- `alias` must be unique (enforced by path dedup -- same dir = same alias)
- `path` must point to a valid git repository (validated at [[add time]](./commands.md#add))
- No maximum project count enforced

---

## Scaffold Flow

On the very first `zz up`, `scaffold()` creates the full directory structure:

```
~/.cc/                  (0o700)
  config.json           (0o600)
  projects.json         (0o600)
```

If the directory already exists, permissions are re-applied (self-healing).

See [[security -- file permissions]](./security.md#file-permissions) for the permission model.

---

## Path Utilities

`src/paths.js` provides path helpers used across the codebase:

| Function | Description |
|---|---|
| `expandTilde(p)` | `~/foo` -> `/Users/apurwa/foo` |
| `contractTilde(p)` | `/Users/apurwa/foo` -> `~/foo` |
| `isGitRepo(dir)` | Runs `git rev-parse --git-dir`, returns boolean |
| `timeSince(date)` | Formats elapsed time as `2h 30m`, `45s`, etc. |
| `configPath()` | `~/.cc/config.json` |
| `projectsPath()` | `~/.cc/projects.json` |
| `statePath()` | `~/.cc/state.json` |
| `lockPath()` | `~/.cc/cc.lock` |
| `watcherPidPath()` | `~/.cc/watcher.pid` |
| `saveTriggerPath()` | `~/.cc/save-trigger` |
