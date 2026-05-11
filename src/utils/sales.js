export function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function clampDiscount(rawDiscount, subtotal) {
  const parsed = parseFloat(rawDiscount) || 0
  return Math.min(Math.max(parsed, 0), subtotal)
}

export function allocateDiscounts(items, discountAmount) {
  if (!items || items.length === 0) return []

  const subtotal = items.reduce((sum, item) => sum + item.total, 0)

  if (discountAmount <= 0 || subtotal <= 0) {
    return items.map(item => ({
      ...item,
      discount_allocated: 0,
      total_after_discount: roundMoney(item.total),
    }))
  }

  let remainingDiscount = discountAmount

  return items.map((item, index) => {
    const isLastItem = index === items.length - 1
    const itemDiscount = isLastItem
      ? remainingDiscount
      : roundMoney((item.total / subtotal) * discountAmount)

    remainingDiscount = roundMoney(remainingDiscount - itemDiscount)

    return {
      ...item,
      discount_allocated: itemDiscount,
      total_after_discount: roundMoney(item.total - itemDiscount),
    }
  })
}

export async function updateInventoryAfterSale(items, drugs, supabase) {
  const grouped = items.reduce((accumulator, item) => {
    accumulator[item.inventory_id] = (accumulator[item.inventory_id] || 0) + item.qty
    return accumulator
  }, {})

  const updates = Object.entries(grouped).map(async ([inventoryId, soldQty]) => {
    const drug = drugs.find(entry => entry.id === inventoryId)
    if (!drug) return

    const nextQty = Math.max((parseInt(drug.quantity, 10) || 0) - soldQty, 0)
    const { error } = await supabase
      .from('inventory')
      .update({ quantity: nextQty })
      .eq('id', inventoryId)

    if (error) {
      console.error('Inventory update failed:', error)
    }
  })

  await Promise.all(updates)
}

export function buildOptimisticInventory(items, drugs) {
  const soldByDrug = items.reduce((summary, item) => {
    summary[item.inventory_id] = (summary[item.inventory_id] || 0) + item.qty
    return summary
  }, {})

  return drugs.map(drug => {
    const soldQty = soldByDrug[drug.id]
    if (!soldQty) return drug

    return {
      ...drug,
      quantity: Math.max((parseInt(drug.quantity, 10) || 0) - soldQty, 0),
    }
  })
}

export function buildOptimisticSalesRows(saleData, fallbackSaleId) {
  return saleData.map((sale, index) => ({
    id: `${fallbackSaleId}-${index}`,
    ...sale,
  }))
}

export function applyOptimisticShiftTotals(totalAmount, paymentMethod, shiftTotals) {
  const nextTotals = { ...shiftTotals }
  const normalizedMethod = (paymentMethod || '').toLowerCase()

  if (normalizedMethod.includes('m-pesa')) nextTotals.mpesa += totalAmount
  else if (normalizedMethod.includes('cash')) nextTotals.cash += totalAmount
  else if (normalizedMethod.includes('credit')) nextTotals.credit += totalAmount
  else nextTotals.other += totalAmount

  return nextTotals
}

export async function submitEtimsSales(saleData, etimsConfig, supabase) {
  if (!etimsConfig.isConfigured) return

  await Promise.all(
    saleData.map(async sale => {
      try {
        await supabase.functions.invoke('etims-submit', {
          body: {
            sale,
            kraPin: etimsConfig.kra_pin,
            branchId: etimsConfig.branch_id,
            deviceSerial: etimsConfig.device_serial,
          },
        })
      } catch (error) {
        console.error('eTIMS submit failed:', error)
      }
    })
  )
}
