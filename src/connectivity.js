import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase'

const HEALTHCHECK_URL = `${SUPABASE_URL}/auth/v1/health`
const CACHE_TTL_MS = 10000
const REQUEST_TIMEOUT_MS = 3500

let lastKnownStatus = typeof navigator === 'undefined' ? true : navigator.onLine
let lastCheckedAt = 0
let inFlightCheck = null

async function runReachabilityCheck() {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(HEALTHCHECK_URL, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
      },
      signal: controller.signal,
    })

    return response.ok
  } catch (error) {
    return false
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function isOnline(options = {}) {
  const { force = false } = options

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    lastKnownStatus = false
    lastCheckedAt = Date.now()
    return false
  }

  const now = Date.now()
  if (!force && lastCheckedAt && (now - lastCheckedAt) < CACHE_TTL_MS) {
    return lastKnownStatus
  }

  if (!force && inFlightCheck) {
    return inFlightCheck
  }

  inFlightCheck = runReachabilityCheck()
    .then((status) => {
      lastKnownStatus = status
      lastCheckedAt = Date.now()
      return status
    })
    .finally(() => {
      inFlightCheck = null
    })

  return inFlightCheck
}

export function getLastKnownConnectivity() {
  return lastKnownStatus
}
