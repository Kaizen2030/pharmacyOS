import supabase from '../supabase'

function extractMissingColumn(error) {
  const message = String(error?.message || '')
  const patterns = [
    /Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i,
    /column ['"]([a-zA-Z0-9_]+)['"] does not exist/i,
    /column ([a-zA-Z0-9_]+) does not exist/i,
    /schema cache[^.]*column ['"]([a-zA-Z0-9_]+)['"]/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) return match[1]
  }

  return ''
}

export function resolveStaffIdentity({
  activePosStaff,
  authenticatedStaff,
  pharmacyId,
  fallbackUserId,
  fallbackName,
  fallbackEmail,
  fallbackRole,
  defaultCashierId = 'AD',
}) {
  const operatorName = activePosStaff?.name || authenticatedStaff?.name || fallbackName || 'Unknown'
  const operatorRole = activePosStaff?.role || authenticatedStaff?.role || fallbackRole || ''
  const operatorId =
    activePosStaff?.auth_user_id ||
    activePosStaff?.id ||
    authenticatedStaff?.auth_user_id ||
    authenticatedStaff?.id ||
    fallbackUserId ||
    defaultCashierId
  const authenticatedUserId = authenticatedStaff?.auth_user_id || authenticatedStaff?.id || fallbackUserId || null
  const authenticatedUserEmail = authenticatedStaff?.email || fallbackEmail || null
  const branchPharmacyId = activePosStaff?.branchPharmacyId || authenticatedStaff?.branchPharmacyId || pharmacyId || null
  const verifiedBy = activePosStaff?.verifiedBy || authenticatedStaff?.verifiedBy || 'password'

  return {
    operatorName,
    operatorRole,
    operatorId,
    authenticatedUserId,
    authenticatedUserEmail,
    branchPharmacyId,
    verifiedBy,
  }
}

export function buildLedgerAuditFields(options) {
  const identity = resolveStaffIdentity(options)

  return {
    cashier_id: identity.operatorId,
    cashier_name: identity.operatorName,
    cashier_role: identity.operatorRole || null,
    authenticated_user_id: identity.authenticatedUserId,
    authenticated_user_email: identity.authenticatedUserEmail,
    verified_by: identity.verifiedBy,
    operator_branch_pharmacy_id: identity.branchPharmacyId,
  }
}

export async function insertRowsWithSchemaFallback(table, rows, selectClause = '') {
  let payloadRows = (rows || []).map(row => ({ ...row }))
  const strippedColumns = new Set()

  while (true) {
    let query = supabase.from(table).insert(payloadRows)
    if (selectClause) {
      query = query.select(selectClause)
    }

    const result = await query
    if (!result.error) return result

    const missingColumn = extractMissingColumn(result.error)
    if (!missingColumn || strippedColumns.has(missingColumn)) {
      return result
    }

    payloadRows = payloadRows.map(row => {
      const nextRow = { ...row }
      delete nextRow[missingColumn]
      return nextRow
    })

    strippedColumns.add(missingColumn)
  }
}
