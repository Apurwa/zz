import React from 'react'
import { Text } from 'ink'

export default function ErrorBar({ error }) {
  if (!error) return null
  return React.createElement(Text, { color: 'red' },
    `  ⚠ error: ${error} — see ~/.cc/dashboard.log`
  )
}
