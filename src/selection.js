export function parseSelection(input, max) {
  const trimmed = input.trim()
  if (!trimmed) return []

  if (trimmed === '*') {
    return Array.from({ length: max }, (_, i) => i + 1)
  }

  const result = new Set()
  const parts = trimmed.split(',')

  for (const part of parts) {
    const rangeParts = part.trim().split('-')

    if (rangeParts.length === 2) {
      let start = parseInt(rangeParts[0], 10)
      let end = parseInt(rangeParts[1], 10)
      if (isNaN(start) || isNaN(end)) continue
      if (start > end) [start, end] = [end, start]
      for (let i = start; i <= end; i++) {
        if (i >= 1 && i <= max) result.add(i)
      }
    } else {
      const num = parseInt(part.trim(), 10)
      if (!isNaN(num) && num >= 1 && num <= max) {
        result.add(num)
      }
    }
  }

  return [...result].sort((a, b) => a - b)
}
