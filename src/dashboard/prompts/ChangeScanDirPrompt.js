import React, { useState } from 'react'
import { Text, Box } from 'ink'
import TextInput from 'ink-text-input'
import { existsSync } from 'node:fs'
import { readConfig, updateConfig } from '../../config.js'
import { expandTilde, contractTilde } from '../../paths.js'

export default function ChangeScanDirPrompt({ onDone }) {
  const config = readConfig()
  const current = config.scan_dir ? contractTilde(expandTilde(config.scan_dir)) : '(not set)'
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const handleSubmit = (input) => {
    if (!input) { onDone(); return }
    const newDir = expandTilde(input)
    if (!existsSync(newDir)) {
      setError(`Directory not found: ${input}`)
      setValue('')
      return
    }
    updateConfig(undefined, { scan_dir: contractTilde(newDir) })
    setDone(true)
    setTimeout(onDone, 500)
  }

  if (done) return React.createElement(Text, { color: 'green' }, '  ✓ Scan directory updated')

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { dimColor: true }, `  Current scan directory: ${current}`),
    error && React.createElement(Text, { color: 'red' }, `  ${error}`),
    React.createElement(Box, null,
      React.createElement(Text, null, '  New scan directory: '),
      React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleSubmit }),
    ),
    React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
  )
}
