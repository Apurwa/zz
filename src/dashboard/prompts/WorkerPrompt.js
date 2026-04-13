import React, { useState } from 'react'
import { Text, Box } from 'ink'
import TextInput from 'ink-text-input'
import { readProjects } from '../../config.js'
import { expandTilde } from '../../paths.js'
import { sessionExists, tmux, SESSION } from '../../tmux.js'

export default function WorkerPrompt({ onDone }) {
  const projects = readProjects()
  const [value, setValue] = useState('')
  const [message, setMessage] = useState(null)

  if (projects.length === 0) {
    setTimeout(onDone, 1000)
    return React.createElement(Text, { color: 'yellow' }, '  No projects registered.')
  }

  if (projects.length === 1 && !message) {
    spawnWorker(projects[0])
    setMessage(`✓ Worker added to ${projects[0].alias}`)
    setTimeout(onDone, 500)
  }

  const handleSubmit = (input) => {
    if (!input) { onDone(); return }
    const idx = parseInt(input, 10) - 1
    if (idx >= 0 && idx < projects.length) {
      spawnWorker(projects[idx])
      setMessage(`✓ Worker added to ${projects[idx].alias}`)
      setTimeout(onDone, 500)
    } else {
      setMessage('Invalid selection')
      setValue('')
      setTimeout(() => setMessage(null), 1000)
    }
  }

  if (message) {
    return React.createElement(Text, { color: message.startsWith('✓') ? 'green' : 'red' }, `  ${message}`)
  }

  return React.createElement(Box, { flexDirection: 'column' },
    ...projects.map((p, i) =>
      React.createElement(Text, { key: i }, `  ${i + 1}. ${p.alias}`)
    ),
    React.createElement(Box, null,
      React.createElement(Text, null, '  Select project: '),
      React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleSubmit }),
    ),
    React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
  )
}

function spawnWorker(project) {
  if (!sessionExists()) return
  try {
    const fullPath = expandTilde(project.path)
    tmux('split-window', '-v', '-p', '30', '-t', `${SESSION}:${project.alias}`, '-c', fullPath)
  } catch { /* failed to spawn */ }
}
