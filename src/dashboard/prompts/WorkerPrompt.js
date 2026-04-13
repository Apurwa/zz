import React, { useState } from 'react'
import { Text, Box } from 'ink'
import SelectInput from 'ink-select-input'
import { readProjects } from '../../config.js'
import { expandTilde } from '../../paths.js'
import { sessionExists, tmux, SESSION } from '../../tmux.js'

export default function WorkerPrompt({ onDone }) {
  const projects = readProjects()
  const [message, setMessage] = useState(null)

  if (projects.length === 0) {
    setTimeout(onDone, 1000)
    return React.createElement(Text, { color: 'yellow' }, '  No projects registered.')
  }

  if (projects.length === 1 && !message) {
    spawnWorker(projects[0])
    setMessage(`Worker added to ${projects[0].alias}`)
    setTimeout(onDone, 500)
  }

  if (message) {
    return React.createElement(Text, { color: message.startsWith('Worker added') ? 'green' : 'red' }, `  ${message}`)
  }

  const items = projects.map((p) => ({ label: p.alias, value: p.alias }))

  const handleSelect = (item) => {
    const project = projects.find((p) => p.alias === item.value)
    if (project) {
      spawnWorker(project)
      setMessage(`Worker added to ${project.alias}`)
      setTimeout(onDone, 500)
    }
  }

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true }, '  Add worker to:'),
    React.createElement(Text, null, ''),
    React.createElement(Box, { paddingLeft: 2 },
      React.createElement(SelectInput, { items, onSelect: handleSelect }),
    ),
    React.createElement(Text, { dimColor: true }, '  Ctrl+C to cancel'),
  )
}

function spawnWorker(project) {
  if (!sessionExists()) return
  try {
    const fullPath = expandTilde(project.path)
    tmux('split-window', '-v', '-p', '30', '-t', `${SESSION}:${project.alias}`, '-c', fullPath)
  } catch { /* failed to spawn */ }
}
