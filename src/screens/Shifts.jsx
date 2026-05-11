import { useEffect, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'
import { notifySuccess } from '../notifications'
import { buildLedgerAuditFields, insertRowsWithSchemaFallback, resolveStaffIdentity } from '../utils/audit'
import { findStaffByPin } from '../utils/pin'

function formatCurrency(amount) {
  return `KES ${Number(amount || 0).toLocaleString()}`
}

function formatShiftDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function ShiftSummaryModal({ summaryData, onClose, onPrint, printing }) {
  if (!summaryData) return null

  const varianceStyle = summaryData.variance < 0
    ? styles.varianceNegative
    : summaryData.variance > 0
      ? styles.variancePositive
      : styles.varianceNeutral

  return (
    <div style={styles.overlay}>
      <div style={{ ...styles.modal, width: '520px' }}>
        <h3 style={styles.modalTitle}>Shift Summary</h3>
        <p style={styles.modalText}>
          Shift closure was saved successfully. Review the reconciliation summary below before finishing.
        </p>

        <div style={styles.summaryBox}>
          <div style={styles.summaryRow}><span>Shift Date</span><strong>{summaryData.shiftDate}</strong></div>
          <div style={styles.summaryRow}><span>Cashier Name</span><strong>{summaryData.cashierName}</strong></div>
          <div style={styles.summaryRow}><span>Opening Float</span><strong>{formatCurrency(summaryData.openingFloat)}</strong></div>
          <div style={styles.summaryRow}><span>Total Cash Sales</span><strong>{formatCurrency(summaryData.totalCashSales)}</strong></div>
          <div style={styles.summaryRow}><span>Total M-Pesa Sales</span><strong>{formatCurrency(summaryData.totalMpesaSales)}</strong></div>
          <div style={styles.summaryRow}><span>Total Credit Sales</span><strong>{formatCurrency(summaryData.totalCreditSales)}</strong></div>
          <div style={styles.summaryRow}><span>Total SHA / Insurance</span><strong>{formatCurrency(summaryData.totalShaInsurance)}</strong></div>
          <div style={styles.summaryRow}><span>Grand Total</span><strong>{formatCurrency(summaryData.grandTotal)}</strong></div>
          <div style={styles.summaryRow}><span>Expected Closing Float</span><strong>{formatCurrency(summaryData.expectedClosingFloat)}</strong></div>
          <div style={styles.summaryRow}><span>Actual Closing Float</span><strong>{formatCurrency(summaryData.actualClosingFloat)}</strong></div>
          <div style={{ ...styles.summaryRow, marginBottom: 0 }}>
            <span>Variance</span>
            <strong style={varianceStyle}>{formatCurrency(summaryData.variance)}</strong>
          </div>
        </div>

        <div style={styles.modalFooter}>
          <button style={styles.btnSecondary} onClick={onClose} disabled={printing}>
            Close
          </button>
          <button style={styles.btnPrimary} onClick={onPrint} disabled={printing}>
            {printing ? 'Printing...' : 'Print Summary'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Shifts() {
  const {
    pharmacyId,
    userId,
    currentUserName,
    userRole,
    authenticatedStaff,
    activePosStaff,
    setActivePosStaff,
  } = usePharmacy()
  const [loading, setLoading] = useState(true)
  const [screenError, setScreenError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showStaffSwitchModal, setShowStaffSwitchModal] = useState(false)
  const [shiftSummaryData, setShiftSummaryData] = useState(null)
  const [openingFloat, setOpeningFloat] = useState('0')
  const [closingFloat, setClosingFloat] = useState('0')
  const [staffPin, setStaffPin] = useState('')
  const [staffPinLoading, setStaffPinLoading] = useState(false)
  const [printingSummary, setPrintingSummary] = useState(false)
  const [activeShift, setActiveShift] = useState(null)
  const [shiftHistory, setShiftHistory] = useState([])
  const [shiftStats, setShiftStats] = useState({})
  const [totals, setTotals] = useState({ cash: 0, mpesa: 0, credit: 0, other: 0, total: 0, transactions: 0 })
  const { operatorName, operatorRole } = resolveStaffIdentity({
    activePosStaff,
    authenticatedStaff,
    pharmacyId,
    fallbackUserId: userId,
    fallbackName: currentUserName,
    fallbackRole: userRole,
    defaultCashierId: null,
  })

  useEffect(() => {
    if (pharmacyId) {
      fetchShiftData()
    } else {
      setLoading(false)
      setScreenError('No pharmacy selected. Please sign in again.')
    }
  }, [pharmacyId])

  async function fetchShiftData() {
    if (!pharmacyId) {
      setLoading(false)
      setScreenError('No pharmacy selected. Please sign in again.')
      return
    }

    setLoading(true)
    setScreenError('')

    const [{ data: active, error: activeError }, { data: history, error: historyError }] = await Promise.all([
      supabase
        .from('shifts')
        .select('*')
        .eq('pharmacy_id', pharmacyId)
        .eq('status', 'Open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('shifts')
        .select('*')
        .eq('pharmacy_id', pharmacyId)
        .order('opened_at', { ascending: false })
        .limit(10),
    ])

    if (activeError) console.error('Failed to load active shift:', activeError)
    if (historyError) console.error('Failed to load shift history:', historyError)

    if (activeError || historyError) {
      setScreenError(
        activeError?.message ||
        historyError?.message ||
        'Unable to load shifts. Check your Supabase table and permissions.'
      )
    }

    setActiveShift(active || null)
    setShiftHistory(history || [])

    if (history?.length) {
      await fetchShiftHistoryStats(history.map(shift => shift.id))
    } else {
      setShiftStats({})
    }

    if (active?.id) {
      await fetchShiftTotals(active.id)
    } else {
      setTotals({ cash: 0, mpesa: 0, credit: 0, other: 0, total: 0, transactions: 0 })
    }

    setLoading(false)
  }

  function summarizeShiftSales(data) {
    return (data || []).reduce((accumulator, sale) => {
      const amount = parseFloat(sale.total_kes) || 0
      const method = (sale.payment_method || '').toLowerCase()

      if (method.includes('m-pesa')) accumulator.mpesa += amount
      else if (method.includes('cash')) accumulator.cash += amount
      else if (method.includes('credit')) accumulator.credit += amount
      else accumulator.other += amount

      accumulator.total += amount
      accumulator.transactions += 1
      return accumulator
    }, { cash: 0, mpesa: 0, credit: 0, other: 0, total: 0, transactions: 0 })
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

    setTotals(summarizeShiftSales(data))
  }

  async function fetchShiftHistoryStats(shiftIds) {
    const validShiftIds = (shiftIds || []).filter(Boolean)
    if (validShiftIds.length === 0) {
      setShiftStats({})
      return
    }

    const { data, error } = await supabase
      .from('sales_ledger')
      .select('shift_id, payment_method, total_kes')
      .eq('pharmacy_id', pharmacyId)
      .in('shift_id', validShiftIds)

    if (error) {
      console.error('Failed to load shift history stats:', error)
      return
    }

    const groupedStats = (data || []).reduce((summary, sale) => {
      const shiftId = sale.shift_id
      if (!summary[shiftId]) {
        summary[shiftId] = { cash: 0, mpesa: 0, credit: 0, other: 0, total: 0, transactions: 0 }
      }

      const amount = parseFloat(sale.total_kes) || 0
      const method = (sale.payment_method || '').toLowerCase()

      if (method.includes('m-pesa')) summary[shiftId].mpesa += amount
      else if (method.includes('cash')) summary[shiftId].cash += amount
      else if (method.includes('credit')) summary[shiftId].credit += amount
      else summary[shiftId].other += amount

      summary[shiftId].total += amount
      summary[shiftId].transactions += 1
      return summary
    }, {})

    setShiftStats(groupedStats)
  }

  async function insertShiftRecord(payload) {
    return insertRowsWithSchemaFallback('shifts', [payload])
  }

  async function switchStaffWithPin() {
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
    setShowStaffSwitchModal(false)
    setStaffPin('')
  }

  function resetStaffSession() {
    if (!authenticatedStaff) return
    setActivePosStaff(authenticatedStaff)
  }

  async function openShift() {
    if (!pharmacyId) return alert('No pharmacy selected. Please sign in again.')
    if (activeShift) return alert('Close the current shift before opening another one.')
    const parsedFloat = parseFloat(openingFloat)
    if (Number.isNaN(parsedFloat) || parsedFloat < 0) return alert('Enter a valid opening float amount.')

    setSubmitting(true)
    setScreenError('')

    const { error } = await insertShiftRecord({
      pharmacy_id: pharmacyId,
      opening_float: parsedFloat,
      opened_at: new Date().toISOString(),
      status: 'Open',
      ...buildLedgerAuditFields({
        activePosStaff,
        authenticatedStaff,
        pharmacyId,
        fallbackUserId: userId,
        fallbackName: currentUserName,
        fallbackRole: userRole,
        defaultCashierId: null,
      }),
    })

    if (error) {
      console.error('Unable to open shift:', error)
      setSubmitting(false)
      setScreenError(error.message || 'Unable to open shift.')
      alert('Unable to open shift: ' + error.message)
      return
    }

    setShowOpenModal(false)
    setOpeningFloat('0')
    await fetchShiftData()
    setSubmitting(false)
  }

  async function closeShift() {
    if (!pharmacyId) return alert('No pharmacy selected. Please sign in again.')
    if (!activeShift) return alert('No active shift found.')
    const parsedFloat = parseFloat(closingFloat)
    if (Number.isNaN(parsedFloat) || parsedFloat < 0) return alert('Enter a valid closing float amount.')

    setSubmitting(true)
    setScreenError('')
    const closedAt = new Date().toISOString()
    const openingFloatAmount = parseFloat(activeShift.opening_float || 0)
    const expectedClosingFloat = openingFloatAmount + totals.cash
    const summaryData = {
      type: 'shift-summary',
      shiftId: activeShift.id,
      shiftDate: formatShiftDate(activeShift.opened_at),
      cashierName: activeShift.cashier_name || operatorName || 'Staff',
      openingFloat: openingFloatAmount,
      totalCashSales: totals.cash,
      totalMpesaSales: totals.mpesa,
      totalCreditSales: totals.credit,
      totalShaInsurance: totals.other,
      grandTotal: totals.total,
      expectedClosingFloat,
      actualClosingFloat: parsedFloat,
      variance: parsedFloat - expectedClosingFloat,
      closedAt,
    }

    const { error } = await supabase
      .from('shifts')
      .update({
        closed_at: closedAt,
        closing_float: parsedFloat,
        total_cash: totals.cash,
        total_mpesa: totals.mpesa,
        total_credit: totals.credit,
        status: 'Closed',
      })
      .eq('id', activeShift.id)

    if (error) {
      console.error('Unable to close shift:', error)
      setSubmitting(false)
      setScreenError(error.message || 'Unable to close shift.')
      alert('Unable to close shift: ' + error.message)
      return
    }

    setShowCloseModal(false)
    setClosingFloat('0')
    setShiftSummaryData(summaryData)
    setActiveShift(null)
    setShiftHistory(current => ([
      {
        ...activeShift,
        closed_at: closedAt,
        closing_float: parsedFloat,
        total_cash: totals.cash,
        total_mpesa: totals.mpesa,
        total_credit: totals.credit,
        status: 'Closed',
      },
      ...current.filter(shift => shift.id !== activeShift.id),
    ]).slice(0, 10))
    setShiftStats(current => ({
      ...current,
      [activeShift.id]: {
        cash: totals.cash,
        mpesa: totals.mpesa,
        credit: totals.credit,
        other: totals.other,
        total: totals.total,
        transactions: totals.transactions,
      },
    }))
    setTotals({ cash: 0, mpesa: 0, credit: 0, other: 0, total: 0, transactions: 0 })
    setSubmitting(false)
  }

  async function handleShiftSummaryPrint() {
    if (!shiftSummaryData) return

    setPrintingSummary(true)

    try {
      if (window.electron?.invoke) {
        await window.electron.invoke('print-receipt', shiftSummaryData)
      } else {
        window.print()
      }
    } catch (error) {
      console.error('Shift summary printing failed:', error)
      window.print()
    } finally {
      setPrintingSummary(false)
    }
  }

  async function handleShiftSummaryClose() {
    setShiftSummaryData(null)
    notifySuccess('Shift closed successfully.', { title: 'Shift closed' })
    await fetchShiftData()
  }

  if (loading) return <div style={styles.loading}>Loading shifts...</div>

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <h2 style={styles.title}>Shifts</h2>
          <p style={styles.subtitle}>Open and close cashier shifts with totals for reconciliation.</p>
        </div>
        <div style={styles.actions}>
          <button style={styles.btnSecondary} onClick={() => setShowStaffSwitchModal(true)} disabled={submitting}>
            Switch Staff PIN
          </button>
          {!activeShift ? (
            <button
              style={styles.btnPrimary}
              onClick={() => {
                setOpeningFloat('0')
                setShowOpenModal(true)
              }}
              disabled={submitting}
            >
              {submitting ? 'Opening...' : 'Open Shift'}
            </button>
          ) : (
            <button
              style={styles.btnDanger}
              onClick={() => {
                setClosingFloat(String(activeShift.opening_float || 0))
                setShowCloseModal(true)
              }}
              disabled={submitting}
            >
              {submitting ? 'Closing...' : 'Close Shift'}
            </button>
          )}
        </div>
      </div>

      {screenError && <div style={styles.errorBanner}>{screenError}</div>}

      {activeShift ? (
        <div style={styles.banner}>
          <div style={styles.bannerTitle}>Active Shift</div>
          <div style={styles.bannerGrid}>
            <div>
              <div style={styles.label}>Opened By</div>
              <div style={styles.value}>{activeShift.cashier_name || 'Staff'}</div>
            </div>
            <div>
              <div style={styles.label}>Role</div>
              <div style={styles.value}>{activeShift.cashier_role || userRole || '-'}</div>
            </div>
            <div>
              <div style={styles.label}>Opened At</div>
              <div style={styles.value}>{new Date(activeShift.opened_at).toLocaleString('en-GB')}</div>
            </div>
            <div>
              <div style={styles.label}>Opening Float</div>
              <div style={styles.value}>KES {parseFloat(activeShift.opening_float || 0).toLocaleString()}</div>
            </div>
            <div>
              <div style={styles.label}>Running Total</div>
              <div style={styles.value}>KES {totals.total.toLocaleString()}</div>
            </div>
            <div>
              <div style={styles.label}>Transactions</div>
              <div style={styles.value}>{totals.transactions}</div>
            </div>
          </div>
          <div style={styles.totalsRow}>
            <span>Cash KES {totals.cash.toLocaleString()}</span>
            <span>M-Pesa KES {totals.mpesa.toLocaleString()}</span>
            <span>Credit KES {totals.credit.toLocaleString()}</span>
            <span>Other KES {totals.other.toLocaleString()}</span>
          </div>
        </div>
      ) : (
        <div style={styles.emptyBanner}>No shift is currently open.</div>
      )}

      <div style={styles.card}>
        <div style={styles.cardTitle}>Recent Shifts</div>
        {shiftHistory.length === 0 ? (
          <div style={styles.emptyBanner}>No shifts recorded yet.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Cashier</th>
                <th style={styles.th}>Role</th>
                <th style={styles.th}>Opened</th>
                <th style={styles.th}>Closed</th>
                <th style={styles.th}>Opening Float</th>
                <th style={styles.th}>Closing Float</th>
                <th style={styles.th}>Transactions</th>
                <th style={styles.th}>Sales Total</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shiftHistory.map(shift => {
                const stats = shiftStats[shift.id] || { total: 0, transactions: 0 }

                return (
                  <tr key={shift.id}>
                    <td style={styles.td}>{shift.cashier_name || '-'}</td>
                    <td style={styles.td}>{shift.cashier_role || '-'}</td>
                    <td style={styles.td}>{new Date(shift.opened_at).toLocaleString('en-GB')}</td>
                    <td style={styles.td}>{shift.closed_at ? new Date(shift.closed_at).toLocaleString('en-GB') : '-'}</td>
                    <td style={styles.td}>KES {parseFloat(shift.opening_float || 0).toLocaleString()}</td>
                    <td style={styles.td}>KES {parseFloat(shift.closing_float || 0).toLocaleString()}</td>
                    <td style={styles.td}>{stats.transactions}</td>
                    <td style={styles.td}>KES {stats.total.toLocaleString()}</td>
                    <td style={styles.td}>
                      <span style={shift.status === 'Open' ? styles.pillOpen : styles.pillClosed}>
                        {shift.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showOpenModal && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Open Shift</h3>
            <p style={styles.modalText}>
              Start a new cashier shift for <strong>{operatorName}</strong>.
            </p>
            <div style={styles.summaryBox}>
              <div style={styles.summaryRow}><span>Staff Name</span><strong>{operatorName}</strong></div>
              <div style={styles.summaryRow}><span>Role / Profession</span><strong>{operatorRole || '-'}</strong></div>
              <div style={styles.summaryRow}><span>Verification</span><strong>{activePosStaff?.verifiedBy === 'pin' ? 'PIN' : 'Signed-in account'}</strong></div>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Opening Float (KES)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                style={styles.input}
                value={openingFloat}
                onChange={event => setOpeningFloat(event.target.value)}
                placeholder="0"
              />
            </div>
            <div style={styles.modalFooter}>
              <button
                style={styles.btnSecondary}
                onClick={() => {
                  if (submitting) return
                  setShowOpenModal(false)
                  setOpeningFloat('0')
                }}
              >
                Cancel
              </button>
              <button style={styles.btnPrimary} onClick={openShift} disabled={submitting}>
                {submitting ? 'Opening...' : 'Open Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseModal && activeShift && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Close Shift</h3>
            <p style={styles.modalText}>
              Review the current totals, then enter the closing float to complete the shift.
            </p>

            <div style={styles.summaryBox}>
              <div style={styles.summaryRow}><span>Cash</span><strong>KES {totals.cash.toLocaleString()}</strong></div>
              <div style={styles.summaryRow}><span>M-Pesa</span><strong>KES {totals.mpesa.toLocaleString()}</strong></div>
              <div style={styles.summaryRow}><span>Credit</span><strong>KES {totals.credit.toLocaleString()}</strong></div>
              <div style={styles.summaryRow}><span>Other</span><strong>KES {totals.other.toLocaleString()}</strong></div>
              <div style={styles.summaryRow}><span>Total Sales</span><strong>KES {totals.total.toLocaleString()}</strong></div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Closing Float (KES)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                style={styles.input}
                value={closingFloat}
                onChange={event => setClosingFloat(event.target.value)}
                placeholder="0"
              />
            </div>
            <div style={styles.modalFooter}>
              <button
                style={styles.btnSecondary}
                onClick={() => {
                  if (submitting) return
                  setShowCloseModal(false)
                  setClosingFloat('0')
                }}
              >
                Cancel
              </button>
              <button style={styles.btnDanger} onClick={closeShift} disabled={submitting}>
                {submitting ? 'Closing...' : 'Close Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showStaffSwitchModal && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Switch Shift Staff</h3>
            <p style={styles.modalText}>
              Enter the 4-digit PIN of the staff member who is taking over the till before opening the shift.
            </p>
            <div style={styles.formGroup}>
              <label style={styles.label}>Staff PIN</label>
              <input
                type="password"
                maxLength={4}
                style={styles.input}
                value={staffPin}
                onChange={event => setStaffPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Enter 4-digit PIN"
              />
            </div>
            <div style={styles.modalFooter}>
              {authenticatedStaff && activePosStaff?.id !== authenticatedStaff.id && (
                <button style={styles.btnSecondary} onClick={resetStaffSession} disabled={staffPinLoading}>
                  Use My Account
                </button>
              )}
              <button
                style={styles.btnSecondary}
                onClick={() => {
                  if (staffPinLoading) return
                  setShowStaffSwitchModal(false)
                  setStaffPin('')
                }}
              >
                Cancel
              </button>
              <button style={styles.btnPrimary} onClick={switchStaffWithPin} disabled={staffPinLoading}>
                {staffPinLoading ? 'Verifying...' : 'Switch Staff'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ShiftSummaryModal
        summaryData={shiftSummaryData}
        onClose={handleShiftSummaryClose}
        onPrint={handleShiftSummaryPrint}
        printing={printingSummary}
      />
    </div>
  )
}

const styles = {
  page: { padding: '18px 22px', flex: 1, overflowY: 'auto' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111', margin: 0 },
  subtitle: { fontSize: '12px', color: '#888', margin: '4px 0 0' },
  actions: { display: 'flex', gap: '8px' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  btnSecondary: { background: '#fff', color: '#333', border: '1px solid #ddd', padding: '8px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  btnDanger: { background: '#E24B4A', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  errorBanner: { background: '#FEF2F2', border: '1px solid #F8D7DA', borderRadius: '10px', padding: '12px 14px', color: '#B91C1C', fontSize: '13px', marginBottom: '14px' },
  banner: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '16px', marginBottom: '14px' },
  bannerTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '12px' },
  bannerGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' },
  label: { fontSize: '11px', color: '#666', marginBottom: '4px' },
  value: { fontSize: '13px', color: '#111', fontWeight: '600' },
  totalsRow: { display: 'flex', gap: '12px', flexWrap: 'wrap', color: '#0F6E56', fontSize: '12px', fontWeight: '600' },
  emptyBanner: { background: '#FFF7E6', border: '1px solid #F3D08A', borderRadius: '10px', padding: '14px', color: '#9A6700', fontSize: '13px', marginBottom: '14px' },
  card: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '16px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '12px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '10px', padding: '24px', width: '460px', maxWidth: 'calc(100vw - 32px)' },
  modalTitle: { fontSize: '16px', fontWeight: '600', color: '#111', marginBottom: '10px' },
  modalText: { fontSize: '13px', color: '#555', lineHeight: '1.5', marginBottom: '14px' },
  formGroup: { marginBottom: '14px' },
  input: { width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' },
  summaryBox: { background: '#f7f8f7', border: '1px solid #e8ebe8', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13px', color: '#222', marginBottom: '8px' },
  variancePositive: { color: '#0F6E56' },
  varianceNegative: { color: '#B91C1C' },
  varianceNeutral: { color: '#4B5563' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '8px 10px', color: '#888', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e8ebe8' },
  td: { padding: '10px', borderBottom: '1px solid #f0f2f0', color: '#222' },
  pillOpen: { background: '#E1F5EE', color: '#0F6E56', padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '600' },
  pillClosed: { background: '#F3F4F6', color: '#4B5563', padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '600' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' },
}
