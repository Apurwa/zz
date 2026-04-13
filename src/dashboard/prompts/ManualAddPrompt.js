import React, { useState } from 'react'
import { Text, Box } from 'ink'
import TextInput from 'ink-text-input'
import { addProjectFromArgs } from '../../commands/add.js'
import { readProjects } from '../../config.js'

export default function ManualAddPrompt({ onDone }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const handleSubmit = (input) => {
    if (!input) { onDone(); return }
    const before = readProjects()
    const result = addProjectFromArgs([input], {})
    if (result.failed.length > 0) {
      setError(`Failed to add: ${input}`)
    } else {
      const after = readProjects()
      const added = after.filter((p) => !before.some((b) => b.path === p.path))
      setDone(true)
      setTimeout(() => onDone(null, added), 500)
    }
  }

  if (done) return React.createElement(Text, { color: 'green' }, '  ✓ Project added')

  return React.createElement(Box, { flexDirection: 'column' },
    error && React.createElement(Text, { color: 'red' }, `  ${error}`),
    React.createElement(Box, null,
      React.createElement(Text, null, '  Project path: '),
      React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleSubmit }),
    ),
    React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
  )
}
