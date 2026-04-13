import React, { useState } from 'react'
import { Text, Box } from 'ink'
import TextInput from 'ink-text-input'
import { readProjects, removeProject } from '../../config.js'
import { sessionExists, tmux, SESSION } from '../../tmux.js'

export default function RemovePrompt({ onDone }) {
  const projects = readProjects()
  const [step, setStep] = useState('select')
  const [selected, setSelected] = useState(null)
  const [value, setValue] = useState('')
  const [message, setMessage] = useState(null)

  if (projects.length === 0) {
    setTimeout(onDone, 1000)
    return React.createElement(Text, { color: 'yellow' }, '  No projects to remove.')
  }

  if (message) {
    return React.createElement(Text, { color: message.startsWith('✓') ? 'green' : 'red' }, `  ${message}`)
  }

  if (step === 'select') {
    const handleSelect = (input) => {
      if (!input) { onDone(); return }
      const idx = parseInt(input, 10) - 1
      if (idx >= 0 && idx < projects.length) {
        setSelected(projects[idx])
        setStep('confirm')
        setValue('')
      } else {
        setMessage('Invalid selection')
        setTimeout(onDone, 1000)
      }
    }

    return React.createElement(Box, { flexDirection: 'column' },
      ...projects.map((p, i) =>
        React.createElement(Text, { key: i }, `  ${i + 1}. ${p.alias}`)
      ),
      React.createElement(Box, null,
        React.createElement(Text, null, '  Select project to remove: '),
        React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleSelect }),
      ),
      React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
    )
  }

  const handleConfirm = (input) => {
    if (input.toLowerCase() === 'y') {
      if (sessionExists()) {
        try { tmux('kill-window', '-t', `${SESSION}:${selected.alias}`) } catch { /* window may not exist */ }
      }
      removeProject(undefined, selected.alias)
      setMessage(`✓ Removed ${selected.alias}`)
      setTimeout(onDone, 500)
    } else {
      onDone()
    }
  }

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Box, null,
      React.createElement(Text, null, `  Remove ${selected.alias}? (y/N): `),
      React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleConfirm }),
    ),
    React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
  )
}
