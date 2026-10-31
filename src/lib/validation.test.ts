import { describe, expect, it } from 'vitest'
import { allowedStatusTransitions, recordSchema, statusChangeSchema } from './validation'

describe('record validation', () => {
  it('normalizes currency and amount while retaining the administrative fields', () => {
    const parsed = recordSchema.parse({
      tracking_reference: 'DEMO-200',
      payee_label: 'Fictional Local Vendor',
      amount: '125.50',
      currency: 'usd',
      issue_date: '2026-10-20',
      expected_processing_date: '2026-10-24',
      notes: '',
    })
    expect(parsed.amount).toBe(125.5)
    expect(parsed.currency).toBe('USD')
    expect(parsed.notes).toBeNull()
  })

  it('rejects nonpositive amounts, invalid references, and date ranges that run backward', () => {
    const base = {
      tracking_reference: 'DEMO-200',
      payee_label: 'Fictional Local Vendor',
      amount: '0',
      currency: 'USD',
      issue_date: '2026-10-25',
      expected_processing_date: '2026-10-20',
      notes: '',
    }
    const result = recordSchema.safeParse(base)
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message)
      expect(messages).toContain('Amount must be greater than zero.')
      expect(messages).toContain('Expected processing date cannot be before the issue date.')
    }
    expect(recordSchema.safeParse({ ...base, tracking_reference: 'bad ref' }).success).toBe(false)
  })
})

describe('status workflow', () => {
  it('matches the controlled server transition matrix and terminal states', () => {
    expect(allowedStatusTransitions.draft).toEqual(['issued', 'cancelled'])
    expect(allowedStatusTransitions.processing).toEqual(['cleared', 'returned', 'on_hold'])
    expect(allowedStatusTransitions.on_hold).toEqual(['pending', 'processing', 'cancelled'])
    expect(allowedStatusTransitions.cleared).toEqual([])
    expect(allowedStatusTransitions.returned).toEqual([])
    expect(allowedStatusTransitions.cancelled).toEqual([])
  })

  it('validates optional reasons while limiting the allowed status values', () => {
    expect(statusChangeSchema.safeParse({ status: 'pending', reason: 'Review complete' }).success).toBe(true)
    expect(statusChangeSchema.safeParse({ status: 'not-a-status', reason: '' }).success).toBe(false)
    expect(statusChangeSchema.safeParse({ status: 'pending', reason: 'x'.repeat(1001) }).success).toBe(false)
  })
})
