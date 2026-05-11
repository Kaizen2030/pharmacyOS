import supabase from '../supabase'

const PIN_SALT = 'pharmacyos_salt_v1'

export function normalizePin(pin) {
  return String(pin || '').replace(/\D/g, '').slice(0, 4)
}

export async function hashPin(pin) {
  const normalizedPin = normalizePin(pin)
  const encoder = new TextEncoder()
  const data = encoder.encode(normalizedPin + PIN_SALT)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function findStaffByPin(pharmacyId, staffPin) {
  const hashedPin = await hashPin(staffPin)

  const { data, error } = await supabase
    .from('web_users')
    .select('id, auth_user_id, name, email, role, approved, branch_pharmacy_id, pin_hash')
    .eq('pharmacy_id', pharmacyId)
    .eq('approved', true)
    .eq('pin_hash', hashedPin)

  if (error) return { data: null, error }

  return { data: data || [], error: null }
}
