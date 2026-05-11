import { useEffect, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'
import { localDb } from '../db'
import { isOnline } from '../connectivity'
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from '../notifications'
import { syncPendingSales } from '../sync'
import { buildLedgerAuditFields, insertRowsWithSchemaFallback, resolveStaffIdentity } from '../utils/audit'
import { allocateDiscounts, clampDiscount, roundMoney, updateInventoryAfterSale, buildOptimisticInventory, buildOptimisticSalesRows, applyOptimisticShiftTotals, submitEtimsSales } from '../utils/sales'
import { processSaleAction, printReceiptAction, searchPatientsAction, selectPatientAction, addToCartAction, switchStaffWithPinAction, holdCurrentSaleAction, loadHeldSaleAction, getCartSubtotal, getDiscountAmount, getCartTotal } from '../utils/salesActions'
import SalesPanel from '../components/sales/SalesPanel'

export default function Sales() {
  const {
    pharmacyId,
    userId,
    pharmacyName,
    pharmacyLicense,
    currentUserName,
    authenticatedStaff,
    activePosStaff,
    setActivePosStaff,
  } = usePharmacy()

  const displayPharmacyName = pharmacyName || 'My Pharmacy'

  const [drugs, setDrugs] = useState([])
  const [salesLog, setSalesLog] = useState([])
  const [patient, setPatient] = useState('')
  const [patientResults, setPatientResults] = useState([])
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [soldBy, setSoldBy] = useState('')
  const [selectedDrug, setSelectedDrug] = useState(null)
  const [drugSearch, setDrugSearch] = useState('')
  const [qty, setQty] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState('M-Pesa')
  const [specificInsurer, setSpecificInsurer] = useState('')
  const [cartDiscount, setCartDiscount] = useState('0')
  const [cartItems, setCartItems] = useState([])
  const [heldSales, setHeldSales] = useState([])
  const [receipt, setReceipt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanValue, setScanValue] = useState('')
  const [activeShift, setActiveShift] = useState(null)
  const [shiftTotals, setShiftTotals] = useState({ cash: 0, mpesa: 0, credit: 0, other: 0 })
  const [etimsConfig, setEtimsConfig] = useState({ isConfigured: false, kra_pin: '', branch_id: '', device_serial: '' })
  const [processingSale, setProcessingSale] = useState(false)
  const [showStaffSwitchModal, setShowStaffSwitchModal] = useState(false)
  const [staffPin, setStaffPin] = useState('')
  const [staffPinLoading, setStaffPinLoading] = useState(false)

  const insurers = ['AAR', 'JUBILEE', 'BRITAM', 'MADISON', 'CIC', 'UAP', 'RESOLUTION', 'OTHER']
  const { operatorName, operatorRole } = resolveStaffIdentity({
    activePosStaff,
    authenticatedStaff,
    pharmacyId,
    fallbackUserId: userId,
    fallbackName: currentUserName,
  })

  useEffect(() => {
    if (!pharmacyId) return

    fetchDrugs()
    fetchTodaySales()
    fetchActiveShift()
    fetchEtimsConfig()
  }, [pharmacyId])

  useEffect(() => {
    setSoldBy(operatorName)
  }, [operatorName])

  useEffect(() => {
    if (!pharmacyId) {
      setHeldSales([])
      return
    }

    try {
      const saved = window.localStorage.getItem(`pharmacyos-held-sales-${pharmacyId}`)
      setHeldSales(saved ? JSON.parse(saved) : [])
    } catch (error) {
      console.error('Failed to load held sales:', error)
      setHeldSales([])
    }
  }, [pharmacyId])

  useEffect(() => {
    if (!pharmacyId) return

    try {
      window.localStorage.setItem(`pharmacyos-held-sales-${pharmacyId}`, JSON.stringify(heldSales))
    } catch (error) {
      console.error('Failed to save held sales:', error)
    }
  }, [heldSales, pharmacyId])

  async function fetchDrugs() {
    if (!pharmacyId) return

    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .order('drug_name')

    if (error) {
      console.error('Failed to load drugs:', error)
      notifyError('Unable to load inventory. Please refresh the page.', { title: 'Inventory unavailable' })
      return
    }

    setDrugs(data || [])
  }

  async function fetchTodaySales() {
    if (!pharmacyId) return

    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('sales_ledger')
      // Limit recent sales history to the latest 100 rows.
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .gte('sold_at', today)
      .order('sold_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Failed to load sales log:', error)
      notifyError('Unable to load sales log. Please refresh the page.', { title: 'Sales log unavailable' })
      setLoading(false)
      return
    }

    setSalesLog(data || [])
    setLoading(false)
  }

  async function fetchActiveShift() {
    if (!pharmacyId) return

    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .eq('status', 'Open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Failed to load active shift:', error)
      return
    }

    setActiveShift(data || null)
    if (data?.id) {
      fetchShiftTotals(data.id)
    } else {
      setShiftTotals({ cash: 0, mpesa: 0, credit: 0, other: 0 })
    }
  }

  async function fetchShiftTotals(shiftId) {
    const { data, error } = await supabase
      .from('sales_ledger')
      .select('payment_method, total_kes')
      .eq('shift_id', shiftId)

    if (error) {
      console.error('Failed to load shift totals:', error)
      return
    }

    const totals = (data || []).reduce((summary, sale) => {
      const amount = parseFloat(sale.total_kes) || 0
      const method = (sale.payment_method || '').toLowerCase()

      if (method.includes('m-pesa')) summary.mpesa += amount
      else if (method.includes('cash')) summary.cash += amount
      else if (method.includes('credit')) summary.credit += amount
      else summary.other += amount

      return summary
    }, { cash: 0, mpesa: 0, credit: 0, other: 0 })

    setShiftTotals(totals)
  }

  async function fetchEtimsConfig() {
    if (!pharmacyId) return

    const { data, error } = await supabase
      .from('pharmacies')
      .select('kra_pin, system_settings')
      .eq('id', pharmacyId)
      .single()

    if (error) {
      console.error('Failed to load eTIMS config:', error)
      return
    }

    const config = data?.system_settings?.etimsConfig || {}
    setEtimsConfig({
      isConfigured: Boolean(data?.kra_pin && config.branch_id && config.device_serial),
      kra_pin: data?.kra_pin || '',
      branch_id: config.branch_id || '',
      device_serial: config.device_serial || '',
    })
  }

  async function searchPatients(query) {
    setPatient(query)

    if (selectedPatient && query !== selectedPatient.full_name) {
      setSelectedPatient(null)
    }

    const data = await searchPatientsAction(query, pharmacyId)
    setPatientResults(data)
  }

  function selectPatient(selected) {
    selectPatientAction(selected, setSelectedPatient, setPatient, setPatientResults)
  }

  function addToCart() {
    addToCartAction({
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
    })
  }

  function updateCartItemQty(itemId, newQty) {
    setCartItems(prev => prev.map(item => item.id === itemId ? {
      ...item,
      qty: newQty,
      total: roundMoney(item.unit_price * newQty),
    } : item))
  }

  async function switchStaffWithPin() {
    await switchStaffWithPinAction({
      pharmacyId,
      staffPin,
      setStaffPinLoading,
      setActivePosStaff,
      setSoldBy,
      setShowStaffSwitchModal,
      setStaffPin,
      authenticatedStaff,
      currentUserName,
    })
  }

  function resetStaffSession() {
    if (!authenticatedStaff) return
    setActivePosStaff(authenticatedStaff)
    setSoldBy(authenticatedStaff.name || currentUserName || 'Unknown')
  }

  function resetCurrentSale(options = {}) {
    setPatient('')
    setPatientResults([])
    setSelectedPatient(null)
    setQty(1)
    setSpecificInsurer('')
    setSelectedDrug(null)
    setCartItems([])
    setCartDiscount('0')
    if (!options.keepReceipt) {
      setReceipt(null)
    }
  }

  function holdCurrentSale() {
    holdCurrentSaleAction({
      cartItems,
      patient,
      soldBy,
      paymentMethod,
      specificInsurer,
      cartDiscount,
      selectedPatient,
      setHeldSales,
      resetCurrentSale,
    })
  }

  function loadHeldSale(heldSale) {
    loadHeldSaleAction({
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
    })
  }

  function handleScanLookup(rawCode) {
    const code = rawCode.trim().toLowerCase()
    if (!code) return

    const matchedDrug = drugs.find(drug =>
      (drug.barcode || '').trim().toLowerCase() === code ||
      (drug.drug_code || '').trim().toLowerCase() === code
    )

    if (!matchedDrug) {
      notifyWarning('Drug not found for barcode: ' + rawCode.trim(), { title: 'Scan not matched' })
      return
    }

    setSelectedDrug(matchedDrug)
    setScanning(false)
    setScanValue('')
  }

  async function processSale() {
    await processSaleAction({
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
    })
  }

  async function printReceipt() {
    await printReceiptAction(receipt)
  }

  if (loading) return <div style={styles.loading}>Loading sales...</div>

  return (
    <SalesPanel
      activeShift={activeShift}
      shiftTotals={shiftTotals}
      patient={patient}
      patientResults={patientResults}
      selectedPatient={selectedPatient}
      searchPatients={searchPatients}
      selectPatient={selectPatient}
      operatorName={operatorName}
      operatorRole={operatorRole}
      activePosStaff={activePosStaff}
      authenticatedStaff={authenticatedStaff}
      setShowStaffSwitchModal={setShowStaffSwitchModal}
      resetStaffSession={resetStaffSession}
      drugs={drugs}
      selectedDrug={selectedDrug}
      drugSearch={drugSearch}
      scanning={scanning}
      scanValue={scanValue}
      setDrugSearch={setDrugSearch}
      setSelectedDrug={setSelectedDrug}
      onScanSubmit={event => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        handleScanLookup(scanValue)
      }}
      scanningToggle={() => setScanning(value => !value)}
      setScanValue={setScanValue}
      qty={qty}
      setQty={setQty}
      paymentMethod={paymentMethod}
      specificInsurer={specificInsurer}
      cartDiscount={cartDiscount}
      setCartDiscount={setCartDiscount}
      setPaymentMethod={setPaymentMethod}
      insurers={insurers}
      cartItems={cartItems}
      addToCart={addToCart}
      holdCurrentSale={holdCurrentSale}
      resetCurrentSale={resetCurrentSale}
      processSale={processSale}
      printReceipt={printReceipt}
      removeCartItem={itemId => setCartItems(prev => prev.filter(item => item.id !== itemId))}
      updateCartItemQty={updateCartItemQty}
      heldSales={heldSales}
      loadHeldSale={loadHeldSale}
      removeHeldSale={heldSaleId => setHeldSales(prev => prev.filter(item => item.id !== heldSaleId))}
      receipt={receipt}
      salesLog={salesLog}
      processingSale={processingSale}
      showStaffSwitchModal={showStaffSwitchModal}
      staffPin={staffPin}
      staffPinLoading={staffPinLoading}
      setStaffPin={setStaffPin}
      switchStaffWithPin={switchStaffWithPin}
      getCartSubtotal={() => getCartSubtotal(cartItems)}
      getDiscountAmount={() => getDiscountAmount(cartItems, cartDiscount)}
      getCartTotal={() => getCartTotal(cartItems, cartDiscount)}
    />
  )
}

const styles = {
  loading: { padding: '40px', textAlign: 'center', color: '#666' },
}
