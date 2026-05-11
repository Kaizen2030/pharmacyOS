function escapeCSVCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export function buildCSV(headers, rows) {
  return [headers, ...(rows || [])]
    .map(row => (row || []).map(escapeCSVCell).join(','))
    .join('\n')
}

export function downloadCSV(headers, rows, filename, options = {}) {
  const csv = buildCSV(headers, rows)

  if (options.download === false) {
    return csv
  }

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
  return csv
}
