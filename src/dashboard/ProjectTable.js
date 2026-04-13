import React from 'react'
import { Text, Box } from 'ink'
import Table from 'ink-table'

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

  return React.createElement(Box, { paddingLeft: 2 },
    React.createElement(Table, { data })
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
