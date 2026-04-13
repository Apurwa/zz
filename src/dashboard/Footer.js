import React from 'react'
import { Text } from 'ink'

export default function Footer() {
  return React.createElement(React.Fragment, null,
    React.createElement(Text, { dimColor: true }, '  ─'.repeat(28)),
    React.createElement(Text, null,
      React.createElement(Text, { dimColor: true }, '  a'), ' scan  ',
      React.createElement(Text, { dimColor: true }, 'd'), ' scan-dir  ',
      React.createElement(Text, { dimColor: true }, 'w'), ' worker  ',
      React.createElement(Text, { dimColor: true }, 'r'), ' remove  ',
      React.createElement(Text, { dimColor: true }, 's'), ' save  ',
      React.createElement(Text, { dimColor: true }, 'q'), ' shutdown  ',
      React.createElement(Text, { dimColor: true }, '?'), ' help  ',
      React.createElement(Text, { dimColor: true }, 'Space'), ' commands',
    ),
  )
}
