import { localDb } from './db'
import supabase from './supabase'
import { isOnline } from './connectivity'
import { insertRowsWithSchemaFallback } from './utils/audit'

async function updateInventoryForSyncedSale(sale) {
  if (!sale?.drug_id || !sale?.qty_sold) return

  const { data, error } = await supabase
    .from('inventory')
    .select('id, quantity')
    .eq('id', sale.drug_id)
    .maybeSingle()

  if (error || !data) {
    console.error('Pending inventory sync lookup failed:', error)
    return
  }

  const nextQty = Math.max((parseInt(data.quantity, 10) || 0) - (parseInt(sale.qty_sold, 10) || 0), 0)
  const { error: updateError } = await supabase
    .from('inventory')
    .update({ quantity: nextQty })
    .eq('id', sale.drug_id)

  if (updateError) {
    console.error('Pending inventory sync update failed:', updateError)
  }
}

async function loadPendingSales() {
  try {
    if (!localDb.isOpen()) {
      await localDb.open()
    }

    return await localDb.pending_sales
      .where('synced')
      .equals(0)
      .toArray()
  } catch (error) {
    if (error?.name === 'DatabaseClosedError') {
      try {
        await localDb.open()
        return await localDb.pending_sales
          .where('synced')
          .equals(0)
          .toArray()
      } catch (reopenError) {
        console.error('Failed to reopen local database for pending sales sync:', reopenError)
        return []
      }
    }

    console.error('Unable to read pending sales from local IndexedDB:', error)
    return []
  }
}

export async function syncPendingSales() {
  const online = await isOnline()
  if (!online) return 0

  const pending = await loadPendingSales()

  for (const sale of pending) {
    const { error } = await insertRowsWithSchemaFallback('sales_ledger', [sale.data])

    if (!error) {
      await updateInventoryForSyncedSale(sale.data)
      await localDb.pending_sales.update(sale.id, { synced: 1 })
    }
  }

  return pending.length
}
