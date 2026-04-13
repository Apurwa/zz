import React from 'react'
import { Text, Box } from 'ink'

const COLS = [
  { key: 'PROJECT', width: 16 },
  { key: 'BRANCH', width: 14 },
  { key: 'SYNC', width: 10 },
  { key: 'SESSIONS', width: 10 },
  { key: 'STATUS', width: 22 },
  { key: 'LAST COMMIT', width: 14 },
]

function truncPad(str, width) {
  if (str.length > width) return str.slice(0, width - 1) + '…'
  return str.padEnd(width)
}

export default function ProjectTable({ projects, state, gitInfo }) {
  if (projects.length === 0) {
    return React.createElement(Text, { dimColor: true }, '  No projects registered. Press "a" to add one.')
  }

  const data = projects.map((project) => {
    const stateEntry = state.projects?.[project.path]
    const panes = stateEntry?.panes ?? []
    const activeSessions = panes.filter((p) => p.claude_session_id).length
    const totalPanes = panes.length || (project.workers + 1)
    const git = gitInfo[project.path] ?? { branch: '?', dirty: false, ahead: null, behind: null, lastCommit: '?' }

    let sync = '--'
    if (git.ahead !== null && git.behind !== null) {
      if (git.ahead === 0 && git.behind === 0) sync = '='
      else if (git.ahead > 0 && git.behind > 0) sync = `↑${git.ahead} ↓${git.behind}`
      else if (git.ahead > 0) sync = `↑${git.ahead}`
      else sync = `↓${git.behind}`
    }

    return {
      PROJECT: project.alias,
      BRANCH: git.dirty ? `${git.branch} ✱` : git.branch,
      SYNC: sync,
      SESSIONS: `${activeSessions}/${totalPanes}`,
      STATUS: getStatusText(panes),
      'LAST COMMIT': git.lastCommit,
    }
  })

  const headerRow = COLS.map((c) => truncPad(c.key, c.width)).join('')

  return React.createElement(Box, { flexDirection: 'column', paddingLeft: 2 },
    React.createElement(Text, { color: 'blue' }, headerRow),
    ...data.map((row, i) =>
      React.createElement(Text, { key: i },
        ...COLS.map((col, j) => {
          const val = truncPad(String(row[col.key] ?? ''), col.width)
          if (col.key === 'BRANCH' && row.BRANCH.includes('✱')) {
            return React.createElement(Text, { key: j, color: 'yellow' }, val)
          }
          if (col.key === 'SYNC') {
            if (val.includes('↑') && val.includes('↓')) return React.createElement(Text, { key: j, color: 'yellow' }, val)
            if (val.includes('↑')) return React.createElement(Text, { key: j, color: 'cyan' }, val)
            if (val.includes('↓')) return React.createElement(Text, { key: j, color: 'red' }, val)
            return React.createElement(Text, { key: j, dimColor: true }, val)
          }
          if (col.key === 'STATUS') {
            if (val.includes('error')) return React.createElement(Text, { key: j, color: 'red' }, val)
            if (val.includes('expired') || val.includes('stale')) return React.createElement(Text, { key: j, color: 'yellow' }, val)
            if (val.includes('active')) return React.createElement(Text, { key: j, color: 'green' }, val)
            return React.createElement(Text, { key: j, dimColor: true }, val)
          }
          if (col.key === 'LAST COMMIT') return React.createElement(Text, { key: j, dimColor: true }, val)
          if (col.key === 'PROJECT') return React.createElement(Text, { key: j, bold: true }, val)
          return React.createElement(Text, { key: j }, val)
        })
      )
    ),
  )
}

function getStatusText(panes) {
  if (panes.length === 0) return '—'
  const active = panes.filter((p) => p.status === 'active').length
  const expired = panes.filter((p) => p.status === 'expired').length
  const stale = panes.filter((p) => p.status === 'stale').length
  const untracked = panes.filter((p) => p.status === 'untracked').length
  const errors = panes.filter((p) => p.status === 'error').length

  if (errors > 0) return '● error'
  if (expired > 0) return `● ${expired} expired`
  if (stale > 0) return '● stale'
  if (active === panes.length) return '● all active'
  if (active > 0 && untracked > 0) return `● ${active} active · ${untracked} untracked`
  if (active > 0) return `● ${active} active`
  if (untracked > 0) return `● ${untracked} untracked`
  return '● ready'
}
