// Run once: npm run backfill-pins
// Reads web_users rows with legacy plain PINs, hashes them into pin_hash, and clears pin.

const { createClient } = require('@supabase/supabase-js')
const { createHash } = require('crypto')
const { config } = require('dotenv')

config()

const PIN_SALT = 'pharmacyos_salt_v1'

function normalizePin(pin) {
  return String(pin || '').replace(/\D/g, '').slice(0, 4)
}

function hashPin(pin) {
  return createHash('sha256').update(normalizePin(pin) + PIN_SALT).digest('hex')
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function run() {
  const { data: rows, error } = await supabase
    .from('web_users')
    .select('id, email, pin, pin_hash')
    .not('pin', 'is', null)

  if (error) {
    console.error('Fetch error:', error.message)
    process.exit(1)
  }

  const toMigrate = (rows || []).filter(row => row.pin && !row.pin_hash)
  console.log(`Found ${rows?.length || 0} rows with pin set, ${toMigrate.length} need migration.`)

  if (toMigrate.length === 0) {
    console.log('Nothing to do.')
    return
  }

  let migrated = 0
  let skipped = 0
  let failed = 0

  for (const row of toMigrate) {
    const normalizedPin = normalizePin(row.pin)

    if (normalizedPin.length !== 4) {
      console.error(`  SKIPPED id=${row.id}${row.email ? ` email=${row.email}` : ''}: PIN is not a valid 4-digit value`)
      skipped += 1
      continue
    }

    const { error: updateError } = await supabase
      .from('web_users')
      .update({ pin_hash: hashPin(normalizedPin), pin: null })
      .eq('id', row.id)

    if (updateError) {
      console.error(`  FAILED id=${row.id}${row.email ? ` email=${row.email}` : ''}: ${updateError.message}`)
      failed += 1
      continue
    }

    console.log(`  Migrated id=${row.id}${row.email ? ` email=${row.email}` : ''}`)
    migrated += 1
  }

  console.log(`\nDone. Migrated: ${migrated}, Skipped: ${skipped}, Failed: ${failed}`)
}

run().catch(error => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
