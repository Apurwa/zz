# cc — Claude Command Center

Orchestrate multiple Claude Code agent sessions across projects. One command to boot, one command to restore.

## Install

```bash
npm install -g cc-cli
```

Requires: Node.js >= 18, tmux, [Claude Code CLI](https://claude.ai/code)

> **Note:** `cc` shares its name with the C compiler. If you encounter conflicts, alias it: `alias cc="$(npm root -g)/cc-cli/bin/cc.js"`

## Quick Start

```bash
cd ~/Projects/my-app
cc up                          # boots workspace, auto-adds current project
```

Next session:

```bash
cc up                          # restores everything — sessions, layout, focus
```

## Commands

| Command | Description |
|---|---|
| `cc up` | Boot or restore workspace |
| `cc down` | Graceful shutdown |
| `cc add <path...> [--workers N]` | Register project(s) |
| `cc remove <project>` | Unregister a project |
| `cc worker <project>` | Add a worker pane |
| `cc open <project>` | Jump to project window |
| `cc status` | Print workspace summary |
| `cc kill` | Hard teardown |
| `cc doctor` | Health check |

## How It Works

`cc` creates a tmux session with:
- **Dashboard** — live TUI showing all projects, sessions, git status
- **Per-project windows** — orchestrator pane (65%) + worker panes (35%)
- **Portscout** — port visibility (optional)
- **Shell** — free shell pane

State is auto-saved every 30 seconds and on events (pane created, session started, etc.). On `cc up`, sessions are restored via `claude --resume`.

## Configuration

Edit `~/.cc/config.json`:

```json
{
  "default_workers": 2,
  "auto_save_interval": 30,
  "portscout": true
}
```

## License

MIT
