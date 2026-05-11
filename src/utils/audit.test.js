import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLedgerAuditFields, resolveStaffIdentity } from './audit'
import { allocateDiscounts, roundMoney } from './sales'

describe('resolveStaffIdentity', () => {
  const pinStaff = {
    id: 'web-uuid-001',
    auth_user_id: 'auth-uuid-001',
    name: 'Julius Wanjau',
    role: 'Pharmacist',
    branchPharmacyId: 'branch-uuid-001',
    verifiedBy: 'pin',
  }

  const authStaff = {
    id: 'web-uuid-002',
    auth_user_id: 'auth-uuid-002',
    name: 'Admin User',
    role: 'Administrator',
    email: 'admin@remedacare.co.ke',
    branchPharmacyId: 'branch-uuid-002',
    verifiedBy: 'password',
  }

  it('prefers activePosStaff auth_user_id over everything else for operatorId', () => {
    const result = resolveStaffIdentity({
      activePosStaff: pinStaff,
      authenticatedStaff: authStaff,
      pharmacyId: 'pharm-001',
      fallbackUserId: 'fallback-uuid',
    })

    expect(result.operatorId).toBe('auth-uuid-001')
  })

  it('falls back to activePosStaff.id when auth_user_id is null', () => {
    const staffNoAuth = { ...pinStaff, auth_user_id: null }
    const result = resolveStaffIdentity({
      activePosStaff: staffNoAuth,
      authenticatedStaff: authStaff,
      pharmacyId: 'pharm-001',
    })

    expect(result.operatorId).toBe('web-uuid-001')
  })

  it('falls back to authenticatedStaff auth_user_id when no activePosStaff', () => {
    const result = resolveStaffIdentity({
      activePosStaff: null,
      authenticatedStaff: authStaff,
      pharmacyId: 'pharm-001',
    })

    expect(result.operatorId).toBe('auth-uuid-002')
  })

  it('falls back to fallbackUserId when both staff are null', () => {
    const result = resolveStaffIdentity({
      activePosStaff: null,
      authenticatedStaff: null,
      pharmacyId: 'pharm-001',
      fallbackUserId: 'fallback-uuid',
    })

    expect(result.operatorId).toBe('fallback-uuid')
  })

  it('uses defaultCashierId as final fallback', () => {
    const result = resolveStaffIdentity({
      activePosStaff: null,
      authenticatedStaff: null,
      pharmacyId: 'pharm-001',
    })

    expect(result.operatorId).toBe('AD')
  })

  it('prefers activePosStaff name over authenticatedStaff name', () => {
    const result = resolveStaffIdentity({
      activePosStaff: pinStaff,
      authenticatedStaff: authStaff,
    })

    expect(result.operatorName).toBe('Julius Wanjau')
  })

  it('falls back to fallbackName when both staff are null', () => {
    const result = resolveStaffIdentity({
      activePosStaff: null,
      authenticatedStaff: null,
      fallbackName: 'Walk-in Staff',
    })

    expect(result.operatorName).toBe('Walk-in Staff')
  })

  it('defaults operatorName to Unknown when nothing is provided', () => {
    const result = resolveStaffIdentity({})
    expect(result.operatorName).toBe('Unknown')
  })

  it('authenticatedUserId always reflects authenticatedStaff, not activePosStaff', () => {
    const result = resolveStaffIdentity({
      activePosStaff: pinStaff,
      authenticatedStaff: authStaff,
    })

    expect(result.authenticatedUserId).toBe('auth-uuid-002')
  })

  it('verifiedBy reflects activePosStaff when present', () => {
    const result = resolveStaffIdentity({
      activePosStaff: pinStaff,
      authenticatedStaff: authStaff,
    })

    expect(result.verifiedBy).toBe('pin')
  })

  it('verifiedBy defaults to password when neither staff has it', () => {
    const result = resolveStaffIdentity({
      activePosStaff: null,
      authenticatedStaff: null,
    })

    expect(result.verifiedBy).toBe('password')
  })

  it('branchPharmacyId falls back to pharmacyId when staff have none', () => {
    const result = resolveStaffIdentity({
      activePosStaff: { ...pinStaff, branchPharmacyId: null },
      authenticatedStaff: { ...authStaff, branchPharmacyId: null },
      pharmacyId: 'pharm-fallback',
    })

    expect(result.branchPharmacyId).toBe('pharm-fallback')
  })
})

describe('buildLedgerAuditFields', () => {
  it('maps identity to correct ledger column names', () => {
    const fields = buildLedgerAuditFields({
      activePosStaff: {
        id: 'web-001',
        auth_user_id: 'auth-001',
        name: 'Julius Wanjau',
        role: 'Pharmacist',
        branchPharmacyId: 'branch-001',
        verifiedBy: 'pin',
      },
      authenticatedStaff: {
        id: 'web-002',
        auth_user_id: 'auth-002',
        name: 'Admin',
        email: 'admin@test.com',
        role: 'Administrator',
        branchPharmacyId: 'branch-001',
        verifiedBy: 'password',
      },
      pharmacyId: 'pharm-001',
    })

    expect(fields.cashier_id).toBe('auth-001')
    expect(fields.cashier_name).toBe('Julius Wanjau')
    expect(fields.cashier_role).toBe('Pharmacist')
    expect(fields.authenticated_user_id).toBe('auth-002')
    expect(fields.authenticated_user_email).toBe('admin@test.com')
    expect(fields.verified_by).toBe('pin')
    expect(fields.operator_branch_pharmacy_id).toBe('branch-001')
  })

  it('sets cashier_role to null when role is empty string', () => {
    const fields = buildLedgerAuditFields({
      activePosStaff: { id: 'x', auth_user_id: null, name: 'Test', role: '', branchPharmacyId: null, verifiedBy: 'pin' },
      authenticatedStaff: null,
    })

    expect(fields.cashier_role).toBeNull()
  })
})

describe('discount allocation', () => {
  it('allocates zero discount correctly and leaves items unchanged', () => {
    const items = [
      { id: 1, total: 100 },
      { id: 2, total: 200 },
    ]

    const result = allocateDiscounts(items, 0)

    expect(result[0].discount_allocated).toBe(0)
    expect(result[0].total_after_discount).toBe(100)
    expect(result[1].discount_allocated).toBe(0)
    expect(result[1].total_after_discount).toBe(200)
  })

  it('proportionally splits discount across items', () => {
    const items = [
      { id: 1, total: 100 },
      { id: 2, total: 100 },
    ]

    const result = allocateDiscounts(items, 50)

    expect(result[0].discount_allocated).toBe(25)
    expect(result[1].discount_allocated).toBe(25)
    expect(result[0].total_after_discount).toBe(75)
    expect(result[1].total_after_discount).toBe(75)
  })

  it('last item absorbs remaining discount to prevent floating point drift', () => {
    const items = [
      { id: 1, total: 10 },
      { id: 2, total: 10 },
      { id: 3, total: 10 },
    ]

    const result = allocateDiscounts(items, 10)
    const totalDiscountAllocated = result.reduce((sum, item) => sum + item.discount_allocated, 0)
    const totalAfter = result.reduce((sum, item) => sum + item.total_after_discount, 0)

    expect(roundMoney(totalDiscountAllocated)).toBe(10)
    expect(roundMoney(totalAfter)).toBe(20)
  })

  it('allocates proportionally by item weight, not equally', () => {
    const items = [
      { id: 1, total: 300 },
      { id: 2, total: 100 },
    ]

    const result = allocateDiscounts(items, 100)

    expect(result[0].discount_allocated).toBe(75)
    expect(result[1].discount_allocated).toBe(25)
  })

  it('handles a single item by applying the full discount to it', () => {
    const items = [{ id: 1, total: 500 }]
    const result = allocateDiscounts(items, 100)

    expect(result[0].discount_allocated).toBe(100)
    expect(result[0].total_after_discount).toBe(400)
  })

  it('never drives total_after_discount below zero when discount equals subtotal', () => {
    const items = [{ id: 1, total: 50 }]
    const result = allocateDiscounts(items, 50)

    expect(result[0].total_after_discount).toBe(0)
  })
})

describe('insertRowsWithSchemaFallback', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('../supabase')
  })

  it('returns immediately on success', async () => {
    vi.doMock('../supabase', () => ({
      default: {
        from: () => ({
          insert: () => ({
            then: (resolve) => resolve({ data: [{ id: 1 }], error: null }),
          }),
        }),
      },
    }))

    const { insertRowsWithSchemaFallback } = await import('./audit')
    const result = await insertRowsWithSchemaFallback('sales_ledger', [{ drug_name: 'Paracetamol', qty_sold: 1 }])

    expect(result.error).toBeNull()
  })

  it('strips the offending column and retries on schema error', async () => {
    const calls = []

    vi.doMock('../supabase', () => ({
      default: {
        from: () => ({
          insert: (rows) => {
            calls.push(rows.map(row => Object.keys(row)))
            const hasNewCol = rows[0].new_column !== undefined

            return {
              then: (resolve) => resolve(
                hasNewCol
                  ? { data: null, error: { message: "Could not find the 'new_column' column" } }
                  : { data: [{ id: 1 }], error: null }
              ),
            }
          },
        }),
      },
    }))

    const { insertRowsWithSchemaFallback } = await import('./audit')
    const result = await insertRowsWithSchemaFallback('sales_ledger', [{ drug_name: 'Paracetamol', new_column: 'value' }])

    expect(result.error).toBeNull()
    expect(calls[0][0]).toContain('new_column')
    expect(calls[1][0]).not.toContain('new_column')
  })

  it('stops retrying and returns error if the same column keeps failing', async () => {
    let attempts = 0

    vi.doMock('../supabase', () => ({
      default: {
        from: () => ({
          insert: () => ({
            then: (resolve) => {
              attempts += 1
              resolve({
                data: null,
                error: { message: attempts === 1 ? "Could not find the 'bad_col' column" : "Could not find the 'bad_col' column" },
              })
            },
          }),
        }),
      },
    }))

    const { insertRowsWithSchemaFallback } = await import('./audit')
    const result = await insertRowsWithSchemaFallback('sales_ledger', [{ drug_name: 'Test', bad_col: 'x' }])

    expect(result.error).toBeDefined()
    expect(attempts).toBe(2)
  })

  it('stops retrying on unrecognised error messages', async () => {
    vi.doMock('../supabase', () => ({
      default: {
        from: () => ({
          insert: () => ({
            then: (resolve) => resolve({
              data: null,
              error: { message: 'permission denied for table sales_ledger' },
            }),
          }),
        }),
      },
    }))

    const { insertRowsWithSchemaFallback } = await import('./audit')
    const result = await insertRowsWithSchemaFallback('sales_ledger', [{ drug_name: 'Test' }])

    expect(result.error.message).toMatch(/permission denied/)
  })
})
