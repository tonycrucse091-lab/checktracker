import { z } from 'zod'
import type { AccountStatus, CheckStatus, UserRole } from './types'

export const checkStatuses = [
  'draft',
  'issued',
  'pending',
  'processing',
  'on_hold',
  'cleared',
  'returned',
  'cancelled',
] as const satisfies readonly CheckStatus[]

export const allowedStatusTransitions: Record<CheckStatus, readonly CheckStatus[]> = {
  draft: ['issued', 'cancelled'],
  issued: ['pending', 'on_hold', 'cancelled'],
  pending: ['processing', 'on_hold', 'cancelled'],
  processing: ['cleared', 'returned', 'on_hold'],
  on_hold: ['pending', 'processing', 'cancelled'],
  cleared: [],
  returned: [],
  cancelled: [],
}

export const userRoles = ['administrator', 'staff', 'read_only'] as const satisfies readonly UserRole[]
export const accountStatuses = ['active', 'suspended', 'disabled'] as const satisfies readonly AccountStatus[]

const currencyField = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, 'Use a three-letter ISO currency code.'))

export const recordSchema = z
  .object({
    tracking_reference: z
      .string()
      .trim()
      .min(3, 'Enter a tracking reference of at least 3 characters.')
      .max(64, 'Tracking reference must be 64 characters or fewer.')
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'Use letters, numbers, dots, underscores, slashes, or hyphens.'),
    payee_label: z.string().trim().min(1, 'Enter a payee name or label.').max(200, 'Payee label is too long.'),
    amount: z
      .string()
      .trim()
      .regex(/^\d{1,12}(?:\.\d{1,2})?$/, 'Enter an amount with up to two decimal places.')
      .transform((value) => Number(value))
      .pipe(z.number().finite().positive('Amount must be greater than zero.')),
    currency: currencyField,
    issue_date: z.iso.date('Enter a valid issue date.'),
    expected_processing_date: z.iso.date('Enter a valid expected processing date.'),
    notes: z.string().trim().max(2000, 'Notes must be 2,000 characters or fewer.').transform((value) => value || null),
  })
  .refine((value) => value.expected_processing_date >= value.issue_date, {
    path: ['expected_processing_date'],
    message: 'Expected processing date cannot be before the issue date.',
  })

export type RecordFormValues = z.input<typeof recordSchema>
export type ValidRecordSubmission = z.output<typeof recordSchema>

export const emailSchema = z.string().trim().email('Enter a valid email address.').max(254)
export const passwordSchema = z.string().min(12, 'Use at least 12 characters.').max(128, 'Password is too long.')

export const statusChangeSchema = z.object({
  status: z.enum(checkStatuses),
  reason: z.string().trim().max(1000, 'Reason must be 1,000 characters or fewer.').transform((value) => value || null),
})

export const inviteSchema = z.object({
  email: emailSchema,
  display_name: z.string().trim().min(1, 'Enter a display name.').max(160),
  role: z.enum(['staff', 'read_only']),
  can_export_records: z.boolean(),
})

export const profileUpdateSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(userRoles),
  account_status: z.enum(accountStatuses),
  can_export_records: z.boolean(),
})

export const recordFilterSchema = z.object({
  search: z.string().trim().max(100).regex(/^[A-Za-z0-9._/-]*$/, 'Search by ID or tracking reference using letters, numbers, dots, underscores, slashes, or hyphens.').optional(),
  status: z.enum(checkStatuses).optional(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).optional(),
  staffUserId: z.string().uuid().optional(),
  fromDate: z.iso.date().optional(),
  toDate: z.iso.date().optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'expected_processing_date', 'issue_date', 'amount', 'status']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).max(100000).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  includeArchived: z.boolean().optional(),
})
