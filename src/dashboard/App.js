import React, { useState, useCallback } from 'react'
import { Text, Box } from 'ink'
import { readProjects } from '../config.js'
import { useGitInfo } from './hooks/useGitInfo.js'
import { usePortInfo } from './hooks/usePortInfo.js'
import { useWatcherState } from './hooks/useWatcherState.js'
import DashboardView from './DashboardView.js'
import HelpScreen from './HelpScreen.js'
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
  const [mode, setMode] = useState('browse')
  const [lastError, setLastError] = useState(null)
  const [projectsVersion, setProjectsVersion] = useState(0)

  const projects = readProjects()
  const { gitInfo, gitError } = useGitInfo(projects)
  const portInfo = usePortInfo()
  const { state, watcherAlive } = useWatcherState()

  const refreshProjects = useCallback(() => {
    setProjectsVersion((v) => v + 1)
  }, [])

  const handleDone = useCallback((nextMode) => {
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
        return React.createElement(ScanPrompt, { onDone: (next) => handleDone(next) })
      case 'manual-add':
        return React.createElement(ManualAddPrompt, { onDone: () => handleDone() })
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
