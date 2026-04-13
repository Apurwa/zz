import React, { useState } from 'react'
import { Text, Box } from 'ink'
import SelectInput from 'ink-select-input'
import TextInput from 'ink-text-input'
import { readProjects, removeProject } from '../../config.js'
import { sessionExists, tmux, SESSION } from '../../tmux.js'

export default function RemovePrompt({ onDone }) {
  const projects = readProjects()
  const [step, setStep] = useState('select')
  const [selected, setSelected] = useState(null)
  const [confirmValue, setConfirmValue] = useState('')
  const [message, setMessage] = useState(null)

  if (projects.length === 0) {
    setTimeout(onDone, 1000)
    return React.createElement(Text, { color: 'yellow' }, '  No projects to remove.')
  }

  if (message) {
    return React.createElement(Text, { color: message.startsWith('Removed') ? 'green' : 'red' }, `  ${message}`)
  }

  if (step === 'select') {
    const items = projects.map((p) => ({ label: p.alias, value: p.alias }))

    const handleSelect = (item) => {
      const project = projects.find((p) => p.alias === item.value)
      setSelected(project)
      setStep('confirm')
    }

    return React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, { bold: true }, '  Remove project:'),
      React.createElement(Text, null, ''),
      React.createElement(Box, { paddingLeft: 2 },
        React.createElement(SelectInput, { items, onSelect: handleSelect }),
      ),
      React.createElement(Text, { dimColor: true }, '  Ctrl+C to cancel'),
    )
  }

  // Confirm step
  const handleConfirm = (input) => {
    if (input.toLowerCase() === 'y') {
      if (sessionExists()) {
        try { tmux('kill-window', '-t', `${SESSION}:${selected.alias}`) } catch {}
      }
      removeProject(undefined, selected.alias)
      setMessage(`Removed ${selected.alias}`)
      setTimeout(onDone, 500)
    } else {
      onDone()
    }
  }

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Box, null,
      React.createElement(Text, null, `  Remove ${selected.alias}? (y/N): `),
      React.createElement(TextInput, { value: confirmValue, onChange: setConfirmValue, onSubmit: handleConfirm }),
    ),
    React.createElement(Text, { dimColor: true }, '  Ctrl+C to cancel'),
  )
}
