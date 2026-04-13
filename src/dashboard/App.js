import React, { useState, useCallback, useRef } from 'react'
import { Text, Box, useInput, useApp } from 'ink'
import { readProjects, readConfig } from '../config.js'
import { createProjectWindow, sessionExists } from '../tmux.js'
import { expandTilde, saveTriggerPath } from '../paths.js'
import { writeFileSync } from 'node:fs'
import { useGitInfo } from './hooks/useGitInfo.js'
import { usePortInfo } from './hooks/usePortInfo.js'
import { useWatcherState } from './hooks/useWatcherState.js'
import DashboardView from './DashboardView.js'
import HelpScreen from './HelpScreen.js'
import SelectInput from 'ink-select-input'
import ScanPrompt from './prompts/ScanPrompt.js'
import ManualAddPrompt from './prompts/ManualAddPrompt.js'
import ChangeScanDirPrompt from './prompts/ChangeScanDirPrompt.js'
import WorkerPrompt from './prompts/WorkerPrompt.js'
import RemovePrompt from './prompts/RemovePrompt.js'
import ShutdownConfirm from './prompts/ShutdownConfirm.js'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return React.createElement(Box, { flexDirection: 'column', padding: 1 },
        React.createElement(Text, { color: 'red' }, '  zz dashboard encountered an error.'),
        React.createElement(Text, { dimColor: true }, `  ${this.state.error?.message ?? 'Unknown error'}`),
        React.createElement(Text, { dimColor: true }, '  See ~/.cc/dashboard.log for details.'),
      )
    }
    return this.props.children
  }
}

export default function App() {
  const { exit } = useApp()
  const [mode, setMode] = useState('browse')
  const [lastError, setLastError] = useState(null)
  const [projectsVersion, setProjectsVersion] = useState(0)
  const lastCtrlC = useRef(0)

  // Ctrl+C handler: cancel prompt → browse, browse → shutdown, double → force quit
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      const now = Date.now()
      // Double Ctrl+C within 1 second = force quit
      if (now - lastCtrlC.current < 1000) {
        exit()
        return
      }
      lastCtrlC.current = now

      if (mode === 'browse') {
        setMode('shutdown')
      } else if (mode === 'shutdown') {
        setMode('browse')
      } else {
        // Cancel any prompt → return to dashboard
        setMode('browse')
      }
    }
  })

  const projects = readProjects()
  const { gitInfo, gitError } = useGitInfo(projects)
  const portInfo = usePortInfo()
  const { state, watcherAlive } = useWatcherState()

  const refreshProjects = useCallback(() => {
    setProjectsVersion((v) => v + 1)
  }, [])

  const handleDone = useCallback((nextMode, addedProjects) => {
    // Create tmux windows for newly added projects (outside render cycle)
    if (addedProjects?.length > 0 && sessionExists()) {
      const config = readConfig()
      for (const added of addedProjects) {
        createProjectWindow({
          alias: added.alias,
          path: expandTilde(added.path),
          workers: added.workers ?? config.default_workers,
        })
      }
    }
    refreshProjects()
    setMode(nextMode ?? 'browse')
  }, [refreshProjects])

  const handleShutdown = useCallback(() => {
    import('../commands/down.js').then((mod) => mod.default([]))
  }, [])

  const error = lastError || gitError

  const content = (() => {
    switch (mode) {
      case 'scan':
        return React.createElement(ScanPrompt, { onDone: (next, added) => handleDone(next, added) })
      case 'manual-add':
        return React.createElement(ManualAddPrompt, { onDone: (next, added) => handleDone(next, added) })
      case 'change-scandir':
        return React.createElement(ChangeScanDirPrompt, { onDone: () => handleDone() })
      case 'worker':
        return React.createElement(WorkerPrompt, { onDone: () => handleDone() })
      case 'remove':
        return React.createElement(RemovePrompt, { onDone: () => handleDone() })
      case 'shutdown':
        return React.createElement(ShutdownConfirm, {
          onConfirm: handleShutdown,
          onCancel: () => setMode('browse'),
        })
      case 'help':
        return React.createElement(HelpScreen, { onDone: () => setMode('browse') })
      case 'palette': {
        const paletteItems = [
          { label: 'Add project', value: 'scan' },
          { label: 'Change scan directory', value: 'change-scandir' },
          { label: 'Add worker', value: 'worker' },
          { label: 'Remove project', value: 'remove' },
          { label: 'Save state', value: 'save' },
          { label: 'Shutdown', value: 'shutdown' },
          { label: 'Help', value: 'help' },
        ]
        const handlePaletteSelect = (item) => {
          if (item.value === 'save') {
            try { writeFileSync(saveTriggerPath(), '', { mode: 0o600 }) } catch {}
            setMode('browse')
          } else {
            setMode(item.value)
          }
        }
        return React.createElement(Box, { flexDirection: 'column' },
          React.createElement(Text, { bold: true }, '  Commands:'),
          React.createElement(Text, null, ''),
          React.createElement(Box, { paddingLeft: 2 },
            React.createElement(SelectInput, { items: paletteItems, onSelect: handlePaletteSelect }),
          ),
        )
      }
      default:
        return React.createElement(DashboardView, {
          projects,
          state,
          gitInfo,
          portInfo,
          watcherAlive,
          lastError: error,
          onModeChange: setMode,
        })
    }
  })()

  return React.createElement(ErrorBoundary, null, content)
}
