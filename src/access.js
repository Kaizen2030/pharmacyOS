export const SCREEN_RULES = {
  dashboard: { roles: ['Cashier', 'Pharmacist', 'Administrator', 'HR'], requiresApproved: false, label: 'Dashboard' },
  inventory: { roles: ['Pharmacist', 'Administrator'], label: 'Inventory' },
  sales: { roles: ['Cashier', 'Pharmacist', 'Administrator'], label: 'Sales & POS' },
  patients: { roles: ['Cashier', 'Pharmacist', 'Administrator'], label: 'Patients' },
  shifts: { roles: ['Cashier', 'Pharmacist', 'Administrator'], label: 'Shifts' },
  suppliers: { roles: ['Pharmacist', 'Administrator'], label: 'Suppliers' },
  expiry: { roles: ['Pharmacist', 'Administrator'], label: 'Expiry Alerts' },
  credit: { roles: ['Cashier', 'Pharmacist', 'Administrator'], label: 'Credit & Debts' },
  prescriptions: { roles: ['Pharmacist', 'Administrator'], label: 'Prescriptions' },
  mpesa: { roles: ['Cashier', 'Pharmacist', 'Administrator'], label: 'M-Pesa' },
  claims: { roles: ['Pharmacist', 'Administrator'], label: 'SHA Claims' },
  insurance: { roles: ['Pharmacist', 'Administrator'], label: 'Insurance Claims' },
  etims: { roles: ['Administrator'], label: 'eTIMS / KRA' },
  branches: { roles: ['Administrator'], label: 'Branches' },
  ai: { roles: ['Pharmacist', 'Administrator'], label: 'AI Drug Advisor' },
  reports: { roles: ['Administrator', 'HR'], label: 'Reports' },
  settings: { roles: ['Administrator'], label: 'Settings' },
}

export function canAccessScreen({ screenId, isOwner, userRole, userApproved }) {
  if (isOwner) return true

  const rule = SCREEN_RULES[screenId]
  if (!rule) return true

  if (rule.requiresApproved !== false && !userApproved) {
    return false
  }

  return rule.roles.includes(userRole)
}

export function getScreenRestrictionMessage({ screenId, isOwner, userRole, userApproved }) {
  if (isOwner) return ''

  const rule = SCREEN_RULES[screenId]
  if (!rule) return ''

  if (rule.requiresApproved !== false && !userApproved) {
    return 'Your account is still awaiting approval for this screen.'
  }

  if (rule.roles.includes(userRole)) {
    return ''
  }

  return `${rule.label} is available to ${formatRoleList(rule.roles)}.`
}

function formatRoleList(roles) {
  if (roles.length === 1) return `${roles[0]} staff`
  if (roles.length === 2) return `${roles[0]} and ${roles[1]} staff`

  const head = roles.slice(0, -1).join(', ')
  return `${head}, and ${roles[roles.length - 1]} staff`
}
