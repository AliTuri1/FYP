// Client-side Excel export — no backend involved, matches this app's architecture.
// Pass an array of plain objects; each object's keys become column headers.
export async function exportToExcel(filename, rows) {
  if (!rows?.length) return
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, filename)
}
