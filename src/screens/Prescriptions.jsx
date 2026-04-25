import { useEffect, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'

export default function Prescriptions() {
  const { pharmacyId, userId, currentUserName, currentUserEmail } = usePharmacy()
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
    doctorRegNo: ''
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
      cashier_id: userId || 'HR',
      cashier_name: currentUserName || currentUserEmail || 'Unknown',
      doctor_name: selectedDoctor.name || null
    }

    const { error } = await supabase.from('sales_ledger').insert([payload])
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
      doctorRegNo: ''
    })
    fetchPrescriptions()
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
            <div style={styles.formGrid}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Prescription No.</label>
                <input style={styles.input} value={form.prescriptionNumber}
                  onChange={e => setForm({ ...form, prescriptionNumber: e.target.value })}
                  placeholder="e.g. RX/2026/00412" />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Patient Name</label>
                <input style={styles.input} value={form.patientName}
                  onChange={e => setForm({ ...form, patientName: e.target.value })}
                  placeholder="e.g. Jane Wanjiku" />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Prescribing Staff</label>
                <select style={styles.input} value={form.doctorId}
                  onChange={e => setForm({ ...form, doctorId: e.target.value })}>
                  <option value="">Select approved prescriber</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role})
                    </option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Doctor Reg. No.</label>
                <input style={styles.input} placeholder="e.g. KMPDC/2021/1234" />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Drug Dispensed</label>
                <input
                  list="drug-options"
                  style={styles.input}
                  value={form.drugName}
                  onChange={e => setForm({ ...form, drugName: e.target.value })}
                  placeholder={inventory.length > 0 ? 'Choose a drug from inventory or type the name' : 'Enter drug name'}
                />
                {inventory.length > 0 && (
                  <datalist id="drug-options">
                    {inventory.map(d => (
                      <option key={d.id} value={d.drug_name} />
                    ))}
                  </datalist>
                )}
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Doctor Reg. No.</label>
                <input style={styles.input}
                  value={form.doctorRegNo}
                  onChange={e => setForm({ ...form, doctorRegNo: e.target.value })}
                  placeholder="e.g. KMPDC/2021/1234" />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Quantity</label>
                <input type="number" style={styles.input} value={form.quantity}
                  onChange={e => setForm({ ...form, quantity: e.target.value })} />
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
          <p style={{ textAlign: 'center', color: '#999', padding: '40px', fontSize: '13px' }}>
            No prescriptions recorded yet.
          </p>
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
              </tr>
            </thead>
            <tbody>
              {rxList.map(rx => (
                <tr key={rx.id}>
                  <td style={styles.td}>RX/2026/00{rx.id}</td>
                  <td style={styles.td}>{rx.customer_name || 'Walk-in'}</td>
                  <td style={styles.td}>{rx.doctor_name || '—'}</td>
                  <td style={styles.td}>{rx.drug_name}</td>
                  <td style={styles.td}>{rx.qty_sold}</td>
                  <td style={styles.td}>{new Date(rx.sold_at).toLocaleDateString('en-GB')}</td>
                </tr>
              ))}
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
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '11px', color: '#555' },
  input: { padding: '7px 10px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' }
}
