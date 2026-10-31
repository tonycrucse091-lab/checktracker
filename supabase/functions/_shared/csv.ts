export function neutralizeSpreadsheetFormula(value: unknown): string {
  const text = value == null ? '' : String(value)
  const firstMeaningfulCharacter = text.replace(/^[\s\uFEFF]+/u, '')[0]
  if (firstMeaningfulCharacter && ['=', '+', '-', '@'].includes(firstMeaningfulCharacter)) {
    return `'${text}`
  }
  return text
}

export function csvCell(value: unknown): string {
  return `"${neutralizeSpreadsheetFormula(value).replaceAll('"', '""')}"`
}

export function toCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: readonly { key: keyof T; label: string }[],
): string {
  const header = columns.map(({ label }) => csvCell(label)).join(',')
  const body = rows.map((row) => columns.map(({ key }) => csvCell(row[key])).join(','))
  return [header, ...body].join('\r\n')
}
