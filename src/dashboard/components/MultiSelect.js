import React, { useState } from 'react'
import { Text, Box, useInput } from 'ink'

export default function MultiSelect({ items, onSubmit }) {
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState(new Set())

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((c) => (c > 0 ? c - 1 : items.length - 1))
    }
    if (key.downArrow) {
      setCursor((c) => (c < items.length - 1 ? c + 1 : 0))
    }
    if (input === ' ') {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(cursor)) next.delete(cursor)
        else next.add(cursor)
        return next
      })
    }
    if (input === 'a') {
      // Select all
      setSelected(new Set(items.map((_, i) => i)))
    }
    if (key.return) {
      onSubmit([...selected].sort((a, b) => a - b))
    }
  })

  return React.createElement(Box, { flexDirection: 'column' },
    ...items.map((item, i) => {
      const isSelected = selected.has(i)
      const isCursor = i === cursor
      const prefix = isSelected ? '[x]' : '[ ]'
      const pointer = isCursor ? '>' : ' '

      return React.createElement(Text, { key: i },
        React.createElement(Text, { color: isCursor ? 'cyan' : undefined }, `  ${pointer} ${prefix} `),
        React.createElement(Text, { bold: isCursor }, item.label),
        item.hint ? React.createElement(Text, { dimColor: true }, `  ${item.hint}`) : null,
      )
    }),
    React.createElement(Text, null, ''),
    React.createElement(Text, { dimColor: true }, `  Up/Down navigate  Space toggle  a select all  Enter confirm  (${selected.size} selected)`),
    React.createElement(Text, { dimColor: true }, '  Ctrl+C to cancel'),
  )
}
