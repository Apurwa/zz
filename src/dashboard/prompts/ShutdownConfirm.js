import React, { useState } from 'react'
import { Text, Box } from 'ink'
import TextInput from 'ink-text-input'

export default function ShutdownConfirm({ onConfirm, onCancel }) {
  const [value, setValue] = useState('')

  const handleSubmit = (input) => {
    if (input.toLowerCase() === 'y') {
      onConfirm()
    } else {
      onCancel()
    }
  }

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Box, null,
      React.createElement(Text, null, '  Shutdown? (y/N): '),
      React.createElement(TextInput, { value, onChange: setValue, onSubmit: handleSubmit }),
    ),
    React.createElement(Text, { dimColor: true }, '  (Ctrl+C to cancel)'),
  )
}
