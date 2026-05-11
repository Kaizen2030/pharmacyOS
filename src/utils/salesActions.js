import supabase from '../supabase'
import { localDb } from '../db'
import { isOnline } from '../connectivity'
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from '../notifications'
import { syncPendingSales } from '../sync'
import { buildLedgerAuditFields, insertRowsWithSchemaFallback } from './audit'
import { findStaffByPin } from '../utils/pin'
import {
  allocateDiscounts,
  clampDiscount,
  roundMoney,
  updateInventoryAfterSale,
  buildOptimisticInventory,
  buildOptimisticSalesRows,
  applyOptimisticShiftTotals,
  submitEtimsSales,
} from './sales'

export function calculateTotal(selectedDrug, qty) {
  if (!selectedDrug) return 0
  return (parseFloat(selectedDrug.price_kes) || 0) * qty
}

export function getCartSubtotal(items) {
  return items.reduce((sum, item) => sum + item.total, 0)
}

export function getDiscountAmount(items, cartDiscount) {
  return clampDiscount(cartDiscount, getCartSubtotal(items))
}

export function getCartTotal(items, cartDiscount) {
  return roundMoney(getCartSubtotal(items) - getDiscountAmount(items, cartDiscount))
}

export async function searchPatientsAction(query, pharmacyId) {
  if (query.trim().length < 2 || !pharmacyId) return []

  const { data, error } = await supabase
    .from('patients')
    .select('id, full_name, phone, allergies, sha_member_no')
    .eq('pharmacy_id', pharmacyId)
    .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(5)

  if (error) {
    console.error('Patient search failed:', error)
    return []
  }

  return data || []
}

export function selectPatientAction(selected, setSelectedPatient, setPatient, setPatientResults) {
  setSelectedPatient(selected)
  setPatient(selected.full_name)
  setPatientResults([])

  if (selected.allergies) {
    notifyWarning(`Allergy alert: ${selected.allergies}`, { title: 'Patient allergy' })
  }
}

export function addToCartAction({
  selectedDrug,
  qty,
  cartItems,
  paymentMethod,
  specificInsurer,
  setCartItems,
  setSelectedDrug,
  setQty,
  setScanValue,
  setScanning,
}) {
  if (!selectedDrug) return alert('Please select a drug to add to cart.')
  if (qty < 1 || Number.isNaN(qty)) return alert('Please enter a valid quantity.')
  if (paymentMethod === 'Insurance' && !specificInsurer) return alert('Please select an insurer for Insurance payments.')

  const existingQty = cartItems
    .filter(item => item.inventory_id === selectedDrug.id)
    .reduce((sum, item) => sum + item.qty, 0)

  if ((existingQty + qty) > (parseInt(selectedDrug.quantity, 10) || 0)) {
    return alert(`Only ${selectedDrug.quantity} units of ${selectedDrug.drug_name} are available.`)
  }

  const unitPrice = parseFloat(selectedDrug.price_kes) || 0
  const item = {
    id: `${selectedDrug.id}-${Date.now()}`,
    inventory_id: selectedDrug.id,
    drug_name: selectedDrug.drug_name,
    drug_code: selectedDrug.drug_code || null,
    barcode: selectedDrug.barcode || null,
    qty,
    unit_price: unitPrice,
    total: unitPrice * qty,
  }

  setCartItems(prev => [...prev, item])
  setSelectedDrug(null)
  setQty(1)
  setScanValue('')
  setScanning(false)
}

export async function switchStaffWithPinAction({
  pharmacyId,
  staffPin,
  setStaffPinLoading,
  setActivePosStaff,
  setSoldBy,
  setShowStaffSwitchModal,
  setStaffPin,
  authenticatedStaff,
  currentUserName,
}) {
  if (!pharmacyId) return alert('No pharmacy selected. Please sign in again.')
  if (!/^\d{4}$/.test(staffPin)) return alert('Enter a valid 4-digit PIN.')

  setStaffPinLoading(true)

  const { data, error } = await findStaffByPin(pharmacyId, staffPin)

  setStaffPinLoading(false)

  if (error) return alert('Unable to verify PIN: ' + error.message)
  if (!data || data.length === 0) return alert('PIN not found. Ask admin to check the staff PIN in Settings.')
  if (data.length > 1) return alert('This PIN is assigned to multiple staff. Please set unique staff PINs in Settings.')

  const staff = data[0]
  setActivePosStaff({
    id: staff.id,
    auth_user_id: staff.auth_user_id || null,
    name: staff.name || staff.email || 'Staff',
    role: staff.role || 'Cashier',
    email: staff.email || '',
    branchPharmacyId: staff.branch_pharmacy_id || pharmacyId,
    verifiedBy: 'pin',
  })
  setSoldBy(staff.name || staff.email || 'Staff')
  setShowStaffSwitchModal(false)
  setStaffPin('')
}

export function holdCurrentSaleAction({
  cartItems,
  patient,
  soldBy,
  paymentMethod,
  specificInsurer,
  cartDiscount,
  selectedPatient,
  setHeldSales,
  resetCurrentSale,
}) {
  if (cartItems.length === 0) return alert('Add at least one item before holding a sale.')

  const heldSale = {
    id: Date.now(),
    customerName: patient.trim() || 'Walk-in',
    soldBy,
    paymentMethod,
    specificInsurer,
    cartDiscount,
    selectedPatient,
    items: cartItems,
    createdAt: new Date().toISOString(),
  }

  setHeldSales(prev => [heldSale, ...prev].slice(0, 10))
  resetCurrentSale()
  notifySuccess('Sale held successfully.', { title: 'Sale held' })
}

export function loadHeldSaleAction({
  heldSale,
  setPatient,
  setSoldBy,
  currentUserName,
  setPaymentMethod,
  setSpecificInsurer,
  setCartDiscount,
  setSelectedPatient,
  setCartItems,
  setSelectedDrug,
  setQty,
  setScanValue,
  setScanning,
  setHeldSales,
}) {
  setPatient(heldSale.customerName || '')
  setSoldBy(heldSale.soldBy || currentUserName || '')
  setPaymentMethod(heldSale.paymentMethod || 'M-Pesa')
  setSpecificInsurer(heldSale.specificInsurer || '')
  setCartDiscount(heldSale.cartDiscount || '0')
  setSelectedPatient(heldSale.selectedPatient || null)
  setCartItems(heldSale.items || [])
  setSelectedDrug(null)
  setQty(1)
  setScanValue('')
  setScanning(false)
  setHeldSales(prev => prev.filter(item => item.id !== heldSale.id))
  notifyInfo('Held sale loaded back into the till.', { title: 'Sale resumed' })
}

export async function processSaleAction({
  pharmacyId,
  cartItems,
  cartDiscount,
  paymentMethod,
  specificInsurer,
  activeShift,
  patient,
  selectedPatient,
  operatorName,
  userId,
  currentUserName,
  displayPharmacyName,
  pharmacyLicense,
  etimsConfig,
  drugs,
  salesLog,
  shiftTotals,
  receipt,
  activePosStaff,
  authenticatedStaff,
  setProcessingSale,
  setReceipt,
  setDrugs,
  setSalesLog,
  setShiftTotals,
  fetchDrugs,
  fetchTodaySales,
  fetchActiveShift,
  resetCurrentSale,
}) {
  if (!pharmacyId) return alert('No pharmacy selected. Please sign in again.')
  if (cartItems.length === 0) return alert('Add at least one drug to the cart before processing the sale.')
  if (paymentMethod === 'Insurance' && !specificInsurer) return alert('Please select an insurer for Insurance payments.')
  if (!activeShift && !window.confirm('No shift is open. This sale will not be linked to a shift. Continue anyway?')) {
    return
  }

  const customerName = patient.trim() || 'Walk-in'
  const soldAt = new Date().toISOString()
  const cashierName = operatorName
  const discountAmount = getDiscountAmount(cartItems, cartDiscount)
  const subtotal = getCartSubtotal(cartItems)
  const discountedItems = allocateDiscounts(cartItems, discountAmount)

  const saleData = discountedItems.map(item => ({
    drug_id: item.inventory_id,
    drug_name: item.drug_name,
    drug_code: item.drug_code,
    qty_sold: item.qty,
    total_kes: item.total_after_discount,
    payment_method: paymentMethod,
    insurer: paymentMethod === 'Insurance' ? specificInsurer : null,
    customer_name: customerName,
    patient_id: selectedPatient?.id || null,
    sold_at: soldAt,
    pharmacy_id: pharmacyId,
    shift_id: activeShift?.id || null,
    ...buildLedgerAuditFields({
      activePosStaff,
      authenticatedStaff,
      pharmacyId,
      shiftId: activeShift?.id || null,
      fallbackUserId: userId,
      fallbackName: currentUserName,
    }),
  }))

  setProcessingSale(true)

  const optimisticSaleId = `LOCAL-${Date.now()}`
  const receiptDraft = {
    items: discountedItems.map(item => ({ ...item, total: item.total_after_discount })),
    subtotal,
    discount: discountAmount,
    total: roundMoney(subtotal - discountAmount),
    saleId: optimisticSaleId,
    time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    pharmacyName: displayPharmacyName,
    pharmacyLicense: pharmacyLicense || 'PPB/C/2026',
    customer_name: customerName,
    soldBy: cashierName,
    payment_method: paymentMethod,
    insurer: paymentMethod === 'Insurance' ? specificInsurer : null,
  }
  const previousDrugs = drugs
  const previousSalesLog = salesLog
  const previousShiftTotals = shiftTotals
  const previousReceipt = receipt
  const optimisticRows = buildOptimisticSalesRows(saleData, optimisticSaleId)

  setReceipt(receiptDraft)
  setDrugs(buildOptimisticInventory(cartItems, drugs))
  setSalesLog(prev => [...optimisticRows, ...prev])
  if (activeShift) {
    setShiftTotals(applyOptimisticShiftTotals(receiptDraft.total, paymentMethod, shiftTotals))
  }

  try {
    const online = await isOnline()
    let receiptSaleId = optimisticSaleId

    if (online) {
      const { data: insertedSales, error } = await insertRowsWithSchemaFallback('sales_ledger', saleData, 'id')

      if (error) {
        console.error('Sales insert error:', error)
        setDrugs(previousDrugs)
        setSalesLog(previousSalesLog)
        setShiftTotals(previousShiftTotals)
        setReceipt(previousReceipt)
        notifyError('Error saving sale: ' + error.message, { title: 'Sale failed' })
        return
      }

      receiptSaleId = insertedSales?.[0]?.id || receiptSaleId
      await updateInventoryAfterSale(cartItems, drugs, supabase)
      await syncPendingSales().catch(error => console.error('Pending sales sync failed:', error))
      await submitEtimsSales(saleData, etimsConfig, supabase)
      setReceipt(current => current ? { ...current, saleId: receiptSaleId } : current)
      notifySuccess('Sale recorded successfully.', { title: 'Sale complete' })
      resetCurrentSale({ keepReceipt: true })
      await Promise.all([fetchDrugs(), fetchTodaySales(), fetchActiveShift()])
    } else {
      for (const sale of saleData) {
        await localDb.pending_sales.add({
          pharmacy_id: pharmacyId,
          data: sale,
          synced: 0,
          created_at: soldAt,
        })
      }

      notifyInfo('Offline - sale saved locally. It will sync when internet returns.', {
        title: 'Saved offline',
        duration: 4200,
      })
      resetCurrentSale({ keepReceipt: true })
    }
  } finally {
    setProcessingSale(false)
  }
}

export async function printReceiptAction(receipt) {
  if (!receipt) return alert('No receipt to print.')

  try {
    if (window.electron?.invoke) {
      await window.electron.invoke('print-receipt', receipt)
      notifySuccess('Receipt sent to the thermal printer.', { title: 'Printing' })
      return
    }
  } catch (error) {
    console.error('Thermal print failed, falling back to browser print:', error)
    notifyWarning('Thermal printer failed. Falling back to browser print preview.', {
      title: 'Printer fallback',
    })
  }

  const printWin = window.open('', '_blank')
  if (!printWin) return alert('Unable to open print window.')

  printWin.document.write(`
      <div style="font-family:monospace;padding:25px;max-width:420px;margin:0 auto;line-height:1.6">
        <h2 style="text-align:center">${receipt.pharmacyName}</h2>
        <p style="text-align:center">Nairobi, Kenya | ${receipt.pharmacyLicense}</p>
        <hr style="margin:15px 0">
        <p><strong>Customer:</strong> ${receipt.customer_name}</p>
        <p><strong>Sold by:</strong> ${receipt.soldBy || 'Unknown'}</p>
        <p><strong>Payment:</strong> ${receipt.payment_method}${receipt.insurer ? ` - ${receipt.insurer}` : ''}</p>
        <hr style="margin:15px 0">
        <div style="margin-bottom:8px"><strong>Items</strong></div>
        ${receipt.items?.map(item => `<p style="margin:0 0 4px"><span>${item.drug_name} x${item.qty}</span> <span style="float:right">KES ${item.total.toLocaleString()}</span></p>`).join('')}
        <hr style="margin:15px 0">
        <h3 style="text-align:right">TOTAL: KES ${receipt.total.toLocaleString()}</h3>
        <p style="text-align:center;font-size:11px;margin-top:20px">Sale ID: #${receipt.saleId} • ${receipt.time}</p>
      </div>
    `)
  printWin.document.close()
  printWin.print()
}
