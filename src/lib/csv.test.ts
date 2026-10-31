import { describe, expect, it } from 'vitest'
import { csvCell, neutralizeSpreadsheetFormula, toCsv } from './csv'

describe('spreadsheet-safe CSV', () => {
  it.each(['=1+1', '+SUM(A1:A2)', '-2+3', '@SUM(A1)', '\t=cmd', '\uFEFF+1'])('neutralizes formula-like cell %j', (value) => {
    expect(neutralizeSpreadsheetFormula(value)).toBe(`'${value}`)
  })

  it('quotes and escapes double quotes in CSV fields', () => {
    expect(csvCell('Northwind "Fictional" Office')).toBe('"Northwind ""Fictional"" Office"')
  })

  it('keeps ordinary data readable and emits escaped CSV rows', () => {
    const result = toCsv(
      [{ reference: 'DEMO-200', payee: '=not-a-formula' }],
      [{ key: 'reference', label: 'Reference' }, { key: 'payee', label: 'Payee' }],
    )
    expect(result).toBe('"Reference","Payee"\r\n"DEMO-200","\'=not-a-formula"')
  })
})
