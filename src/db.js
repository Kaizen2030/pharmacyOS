import Dexie from 'dexie'

export const localDb = new Dexie('PharmacyOS')

localDb.version(1).stores({
  pending_sales: '++id, pharmacy_id, synced, created_at',
  pending_inventory: '++id, drug_id, pharmacy_id, synced',
})

// Version 2: force Dexie to recreate the local IndexedDB database cleanly
// if the underlying Electron/Chrome IndexedDB file becomes corrupted.
localDb.version(2).stores({
  pending_sales: '++id, pharmacy_id, synced, created_at',
  pending_inventory: '++id, drug_id, pharmacy_id, synced',
})
