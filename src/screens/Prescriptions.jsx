import { useEffect, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'
import { buildLedgerAuditFields, insertRowsWithSchemaFallback, resolveStaffIdentity } from '../utils/audit'

function formatDispensedDate(date = new Date()) {
  return date.toLocaleDateString('en-GB')
}

function buildLabelPrintHtml(label) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Prescription Label</title>
        <style>
          @page { size: 50mm 30mm; margin: 2mm; }
          body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #111; }
          .label { width: 46mm; min-height: 26mm; margin: 0 auto; padding: 2mm; box-sizing: border-box; }
          .pharmacy { text-align: center; font-size: 10px; font-weight: 700; margin-bottom: 2mm; }
          .drug { font-size: 12px; font-weight: 700; margin-bottom: 1mm; }
          .line { font-size: 9px; line-height: 1.35; margin-bottom: 1mm; }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="pharmacy">${label.pharmacyName || 'PharmacyOS'}</div>
          <div class="drug">${label.drugName || 'Medicine'}</div>
          <div class="line"><strong>Patient:</strong> ${label.patientName || 'Walk-in'}</div>
          <div class="line"><strong>Dose:</strong> ${label.dose || '-'}</div>
          <div class="line">${label.instructions || '-'}</div>
          <div class="line"><strong>Date:</strong> ${label.dispensedDate || ''}</div>
          <div class="line">Pharmacist: __________________</div>
          <div class="line">${label.pharmacistName || ''}</div>
        </div>
      </body>
    </html>
  `
}

export default function Prescriptions() {
  const {
    pharmacyId,
    pharmacyName,
    userId,
    currentUserName,
    currentUserEmail,
    authenticatedStaff,
    activePosStaff,
  } = usePharmacy()
  const { operatorName, operatorRole } = resolveStaffIdentity({
    activePosStaff,
    authenticatedStaff,
    pharmacyId,
    fallbackUserId: userId,
    fallbackName: currentUserName,
    fallbackEmail: currentUserEmail,
  })
  const [rxList, setRxList] = useState([])
  const [staff, setStaff] = useState([])
  const [inventory, setInventory] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    prescriptionNumber: '',
    patientName: '',
    doctorId: '',
    drugName: '',
    quantity: '1',
    doctorRegNo: '',
    dose: '',
    instructions: '',
  })

  useEffect(() => {
    if (pharmacyId) {
      fetchPrescriptions()
      fetchApprovedStaff()
      fetchInventory()
    }
  }, [pharmacyId])

  async function fetchInventory() {
    const { data } = await supabase
      .from('inventory')
      .select('id, drug_name')
      .eq('pharmacy_id', pharmacyId)
      .order('drug_name')

    setInventory(data || [])
  }

  async function fetchApprovedStaff() {
    const { data } = await supabase
      .from('web_users')
      .select('id,name,role,approved')
      .eq('pharmacy_id', pharmacyId)
      .eq('approved', true)
      .in('role', ['Pharmacist', 'Administrator'])
      .order('name')
    setStaff(data || [])
  }

  async function fetchPrescriptions() {
    const { data } = await supabase
      .from('sales_ledger')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .eq('payment_method', 'Prescription')
      .order('sold_at', { ascending: false })
    setRxList(data || [])
    setLoading(false)
  }

  async function savePrescription() {
    if (!form.patientName.trim() || !form.drugName.trim() || !form.doctorId) {
      return alert('Patient name, drug, and approved prescriber are required.')
    }

    const selectedDoctor = staff.find(s => String(s.id) === String(form.doctorId))

    if (!selectedDoctor || !selectedDoctor.approved) {
      return alert('Please choose an approved prescriber from the list.')
    }

    if (!['Pharmacist', 'Administrator'].includes(selectedDoctor.role)) {
      return alert('Only approved pharmacists or administrators may be recorded as prescribers.')
    }

    const payload = {
      pharmacy_id: pharmacyId,
      drug_name: form.drugName.trim(),
      qty_sold: parseInt(form.quantity, 10) || 0,
      total_kes: 0,
      payment_method: 'Prescription',
      customer_name: form.patientName.trim(),
      sold_at: new Date().toISOString(),
      doctor_name: selectedDoctor.name || null,
      dose: form.dose.trim() || null,
      instructions: form.instructions.trim() || null,
      ...buildLedgerAuditFields({
        activePosStaff,
        authenticatedStaff,
        pharmacyId,
        fallbackUserId: userId,
        fallbackName: currentUserName,
        fallbackEmail: currentUserEmail,
        defaultCashierId: 'HR',
      }),
    }

    const { error } = await insertRowsWithSchemaFallback('sales_ledger', [payload])
    if (error) {
      return alert('Error saving prescription: ' + error.message)
    }

    setShowForm(false)
    setForm({
      prescriptionNumber: '',
      patientName: '',
      doctorId: '',
      drugName: '',
      quantity: '1',
      doctorRegNo: '',
      dose: '',
      instructions: '',
    })
    fetchPrescriptions()
  }

  async function printLabel(label) {
    if (window.electron?.invoke) {
      await window.electron.invoke('print-label', label)
      return
    }

    const printWindow = window.open('', 'prescription-label', 'width=320,height=240')
    if (!printWindow) return alert('Unable to open print window.')

    printWindow.document.open()
    printWindow.document.write(buildLabelPrintHtml(label))
    printWindow.document.close()
    printWindow.focus()
    printWindow.onload = () => {
      printWindow.print()
      printWindow.close()
    }
  }

  if (loading) return <div style={styles.loading}>Loading prescriptions...</div>

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <h2 style={styles.title}>Prescriptions</h2>
        <button style={styles.btnPrimary} onClick={() => setShowForm(true)}>+ Log Prescription</button>
      </div>

      {showForm && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Log Prescription (rx)</h3>
            <div style={styles.staffNote}>
              Dispensing under <strong>{operatorName}</strong>{operatorRole ? ` (${operatorRole})` : ''}.
            </div>
            <div style={styles.formGrid}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Prescription No.</label>
                <input
                  style={styles.input}
                  value={form.prescriptionNumber}
                  onChange={event => setForm({ ...form, prescriptionNumber: event.target.value })}
                  placeholder="e.g. RX/2026/00412"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Patient Name</label>
                <input
                  style={styles.input}
                  value={form.patientName}
                  onChange={event => setForm({ ...form, patientName: event.target.value })}
                  placeholder="e.g. Jane Wanjiku"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Prescribing Staff</label>
                <select
                  style={styles.input}
                  value={form.doctorId}
                  onChange={event => setForm({ ...form, doctorId: event.target.value })}
                >
                  <option value="">Select approved prescriber</option>
                  {staff.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.name} ({member.role})
                    </option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Drug Dispensed</label>
                <input
                  list="drug-options"
                  style={styles.input}
                  value={form.drugName}
                  onChange={event => setForm({ ...form, drugName: event.target.value })}
                  placeholder={inventory.length > 0 ? 'Choose a drug from inventory or type the name' : 'Enter drug name'}
                />
                {inventory.length > 0 && (
                  <datalist id="drug-options">
                    {inventory.map(drug => (
                      <option key={drug.id} value={drug.drug_name} />
                    ))}
                  </datalist>
                )}
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Doctor Reg. No.</label>
                <input
                  style={styles.input}
                  value={form.doctorRegNo}
                  onChange={event => setForm({ ...form, doctorRegNo: event.target.value })}
                  placeholder="e.g. KMPDC/2021/1234"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Quantity</label>
                <input
                  type="number"
                  style={styles.input}
                  value={form.quantity}
                  onChange={event => setForm({ ...form, quantity: event.target.value })}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Dose</label>
                <input
                  style={styles.input}
                  value={form.dose}
                  onChange={event => setForm({ ...form, dose: event.target.value })}
                  placeholder="e.g. 1 tablet twice daily"
                />
              </div>
              <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                <label style={styles.label}>Instructions</label>
                <input
                  style={styles.input}
                  value={form.instructions}
                  onChange={event => setForm({ ...form, instructions: event.target.value })}
                  placeholder="e.g. After meals for 5 days"
                />
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowForm(false)} style={styles.btnSecondary}>Cancel</button>
              <button onClick={savePrescription} style={styles.btnPrimary}>Save Prescription</button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.card}>
        {rxList.length === 0 ? (
          <p style={styles.emptyState}>No prescriptions recorded yet.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Rx No.</th>
                <th style={styles.th}>Patient</th>
                <th style={styles.th}>Prescriber</th>
                <th style={styles.th}>Drug</th>
                <th style={styles.th}>Qty</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Label</th>
              </tr>
            </thead>
            <tbody>
              {rxList.map(rx => {
                const label = {
                  patientName: rx.customer_name || 'Walk-in',
                  drugName: rx.drug_name || 'Medicine',
                  dose: rx.dose || '-',
                  instructions: rx.instructions || '-',
                  dispensedDate: formatDispensedDate(),
                  pharmacistName: activePosStaff?.name || operatorName || 'Pharmacist',
                  pharmacyName: pharmacyName || 'PharmacyOS',
                }

                return (
                  <tr key={rx.id}>
                    <td style={styles.td}>RX/2026/00{rx.id}</td>
                    <td style={styles.td}>{rx.customer_name || 'Walk-in'}</td>
                    <td style={styles.td}>{rx.doctor_name || '-'}</td>
                    <td style={styles.td}>{rx.drug_name}</td>
                    <td style={styles.td}>{rx.qty_sold}</td>
                    <td style={styles.td}>{new Date(rx.sold_at).toLocaleDateString('en-GB')}</td>
                    <td style={styles.td}>
                      <button style={styles.btnSecondary} onClick={() => printLabel(label)}>
                        Print Label
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: { padding: '18px 22px', flex: 1 },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111' },
  card: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '14px 16px', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '7px 10px', color: '#888', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e8ebe8' },
  td: { padding: '9px 10px', borderBottom: '1px solid #f0f2f0', color: '#222' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  btnSecondary: { background: '#fff', color: '#333', border: '1px solid #ddd', padding: '7px 14px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '10px', padding: '24px', width: '620px', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '15px', fontWeight: '600', color: '#111', marginBottom: '16px' },
  staffNote: { fontSize: '12px', color: '#0F6E56', background: '#E9F7F2', border: '1px solid #BDE5D8', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '11px', color: '#555' },
  input: { padding: '7px 10px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' },
  emptyState: { textAlign: 'center', color: '#999', padding: '40px', fontSize: '13px' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' },
}
