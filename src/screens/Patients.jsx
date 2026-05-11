import { useEffect, useMemo, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'

const emptyPatient = {
  full_name: '',
  phone: '',
  dob: '',
  gender: '',
  allergies: '',
  chronic_conditions: '',
  sha_member_no: '',
  insurance_member_no: '',
  insurer: '',
}

export default function Patients() {
  const { pharmacyId } = usePharmacy()
  const [patients, setPatients] = useState([])
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [patientHistory, setPatientHistory] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingPatient, setEditingPatient] = useState(null)
  const [form, setForm] = useState(emptyPatient)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (pharmacyId) fetchPatients()
  }, [pharmacyId])

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return patients

    return patients.filter(patient =>
      patient.full_name?.toLowerCase().includes(q) ||
      patient.phone?.toLowerCase().includes(q)
    )
  }, [patients, search])

  async function fetchPatients() {
    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('pharmacy_id', pharmacyId)
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      setPatients(data || [])
    } catch (error) {
      const invalidColumn = String(error?.message || '').includes('created_at')
      if (invalidColumn) {
        const { data, error: fallbackError } = await supabase
          .from('patients')
          .select('*')
          .eq('pharmacy_id', pharmacyId)

        if (fallbackError) {
          console.error('Failed to load patients after fallback:', fallbackError)
          alert('Unable to load patients right now.')
          setPatients([])
          return
        }

        setPatients(data || [])
      } else {
        console.error('Failed to load patients:', error)
        alert('Unable to load patients right now.')
        setPatients([])
      }
    } finally {
      setLoading(false)
    }
  }

  async function fetchPatientHistory(patientId) {
    const { data, error } = await supabase
      .from('sales_ledger')
      .select('*')
      .eq('patient_id', patientId)
      .order('sold_at', { ascending: false })

    if (error) {
      console.error('Failed to load patient history:', error)
      setPatientHistory([])
      return
    }

    setPatientHistory(data || [])
  }

  function openAddPatient() {
    setEditingPatient(null)
    setForm(emptyPatient)
    setShowForm(true)
  }

  function openEditPatient(patient) {
    setEditingPatient(patient)
    setForm({
      full_name: patient.full_name || '',
      phone: patient.phone || '',
      dob: patient.dob || '',
      gender: patient.gender || '',
      allergies: patient.allergies || '',
      chronic_conditions: patient.chronic_conditions || '',
      sha_member_no: patient.sha_member_no || '',
      insurance_member_no: patient.insurance_member_no || '',
      insurer: patient.insurer || '',
    })
    setShowForm(true)
  }

  async function savePatient() {
    if (!form.full_name.trim()) return alert('Patient full name is required.')

    setSaving(true)

    const payload = {
      pharmacy_id: pharmacyId,
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      dob: form.dob || null,
      gender: form.gender || null,
      allergies: form.allergies.trim() || null,
      chronic_conditions: form.chronic_conditions.trim() || null,
      sha_member_no: form.sha_member_no.trim() || null,
      insurance_member_no: form.insurance_member_no.trim() || null,
      insurer: form.insurer.trim() || null,
    }

    let error

    if (editingPatient) {
      const { error: updateError } = await supabase
        .from('patients')
        .update(payload)
        .eq('id', editingPatient.id)
      error = updateError
    } else {
      const { error: insertError } = await supabase
        .from('patients')
        .insert([payload])
      error = insertError
    }

    setSaving(false)

    if (error) {
      alert('Unable to save patient: ' + error.message)
      return
    }

    setShowForm(false)
    setEditingPatient(null)
    setForm(emptyPatient)
    await fetchPatients()
  }

  async function deletePatient(patient) {
    if (!window.confirm(`Delete patient profile for ${patient.full_name}?`)) return

    const { error } = await supabase
      .from('patients')
      .delete()
      .eq('id', patient.id)

    if (error) {
      alert('Unable to delete patient: ' + error.message)
      return
    }

    if (selectedPatient?.id === patient.id) {
      setSelectedPatient(null)
      setPatientHistory([])
    }

    fetchPatients()
  }

  async function handleSelectPatient(patient) {
    setSelectedPatient(patient)
    await fetchPatientHistory(patient.id)
  }

  if (loading) return <div style={styles.loading}>Loading patients...</div>

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <h2 style={styles.title}>Patients</h2>
          <p style={styles.subtitle}>Search, register, and review patient purchase history.</p>
        </div>
        <button style={styles.btnPrimary} onClick={openAddPatient}>+ Add Patient</button>
      </div>

      <div style={styles.layout}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Patient Directory</div>
          <input
            style={styles.input}
            placeholder="Search by name or phone..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />

          <div style={styles.list}>
            {filteredPatients.length === 0 ? (
              <div style={styles.emptyState}>No patients found.</div>
            ) : (
              filteredPatients.map(patient => (
                <div
                  key={patient.id}
                  style={{
                    ...styles.patientRow,
                    ...(selectedPatient?.id === patient.id ? styles.patientRowActive : {}),
                  }}
                >
                  <button type="button" style={styles.patientSelect} onClick={() => handleSelectPatient(patient)}>
                    <div style={styles.patientName}>{patient.full_name}</div>
                    <div style={styles.patientMeta}>{patient.phone || 'No phone on file'}</div>
                  </button>
                  <div style={styles.rowActions}>
                    <button style={styles.btnSecondary} onClick={() => openEditPatient(patient)}>Edit</button>
                    <button style={styles.btnDelete} onClick={() => deletePatient(patient)}>Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Patient Details</div>
          {!selectedPatient ? (
            <div style={styles.emptyState}>Select a patient to view their profile and purchase history.</div>
          ) : (
            <>
              <div style={styles.detailGrid}>
                <div>
                  <div style={styles.label}>Full Name</div>
                  <div style={styles.value}>{selectedPatient.full_name}</div>
                </div>
                <div>
                  <div style={styles.label}>Phone</div>
                  <div style={styles.value}>{selectedPatient.phone || '-'}</div>
                </div>
                <div>
                  <div style={styles.label}>Date of Birth</div>
                  <div style={styles.value}>{selectedPatient.dob || '-'}</div>
                </div>
                <div>
                  <div style={styles.label}>Gender</div>
                  <div style={styles.value}>{selectedPatient.gender || '-'}</div>
                </div>
                <div>
                  <div style={styles.label}>SHA Member No.</div>
                  <div style={styles.value}>{selectedPatient.sha_member_no || '-'}</div>
                </div>
                <div>
                  <div style={styles.label}>Insurance</div>
                  <div style={styles.value}>
                    {selectedPatient.insurer || selectedPatient.insurance_member_no
                      ? `${selectedPatient.insurer || 'Member'} ${selectedPatient.insurance_member_no ? `- ${selectedPatient.insurance_member_no}` : ''}`
                      : '-'}
                  </div>
                </div>
              </div>

              <div style={styles.alertBox}>
                <strong>Allergies:</strong> {selectedPatient.allergies || 'None recorded'}
              </div>
              <div style={styles.infoBox}>
                <strong>Chronic Conditions:</strong> {selectedPatient.chronic_conditions || 'None recorded'}
              </div>

              <div style={styles.sectionTitle}>Purchase History</div>
              {patientHistory.length === 0 ? (
                <div style={styles.emptyState}>No purchases linked to this patient yet.</div>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Drug</th>
                      <th style={styles.th}>Qty</th>
                      <th style={styles.th}>Amount</th>
                      <th style={styles.th}>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientHistory.map(item => (
                      <tr key={item.id}>
                        <td style={styles.td}>{new Date(item.sold_at).toLocaleString('en-GB')}</td>
                        <td style={styles.td}>{item.drug_name}</td>
                        <td style={styles.td}>{item.qty_sold}</td>
                        <td style={styles.td}>KES {parseFloat(item.total_kes || 0).toLocaleString()}</td>
                        <td style={styles.td}>{item.payment_method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      {showForm && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>{editingPatient ? 'Edit Patient' : 'Add Patient'}</h3>

            <div style={styles.formGrid}>
              {[
                ['full_name', 'Full Name', 'text'],
                ['phone', 'Phone', 'text'],
                ['dob', 'Date of Birth', 'date'],
                ['gender', 'Gender', 'text'],
                ['sha_member_no', 'SHA Member No.', 'text'],
                ['insurance_member_no', 'Insurance Member No.', 'text'],
                ['insurer', 'Insurer', 'text'],
              ].map(([key, label, type]) => (
                <div key={key} style={styles.formGroup}>
                  <label style={styles.label}>{label}</label>
                  <input
                    style={styles.input}
                    type={type}
                    value={form[key]}
                    onChange={event => setForm({ ...form, [key]: event.target.value })}
                  />
                </div>
              ))}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Allergies</label>
              <textarea
                style={styles.textarea}
                value={form.allergies}
                onChange={event => setForm({ ...form, allergies: event.target.value })}
                placeholder="e.g. Penicillin"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Chronic Conditions</label>
              <textarea
                style={styles.textarea}
                value={form.chronic_conditions}
                onChange={event => setForm({ ...form, chronic_conditions: event.target.value })}
                placeholder="e.g. Hypertension"
              />
            </div>

            <div style={styles.modalFooter}>
              <button
                style={styles.btnSecondary}
                onClick={() => {
                  setShowForm(false)
                  setEditingPatient(null)
                  setForm(emptyPatient)
                }}
              >
                Cancel
              </button>
              <button style={styles.btnPrimary} onClick={savePatient} disabled={saving}>
                {saving ? 'Saving...' : editingPatient ? 'Update Patient' : 'Save Patient'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { padding: '18px 22px', flex: 1, overflowY: 'auto' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111', margin: 0 },
  subtitle: { fontSize: '12px', color: '#888', margin: '4px 0 0' },
  layout: { display: 'grid', gridTemplateColumns: '360px 1fr', gap: '14px' },
  card: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '16px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '12px' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' },
  list: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' },
  patientRow: { border: '1px solid #e8ebe8', borderRadius: '10px', padding: '10px 12px', display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between' },
  patientRowActive: { borderColor: '#0F6E56', background: '#F3FBF8' },
  patientSelect: { border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', flex: 1, padding: 0 },
  patientName: { fontSize: '13px', fontWeight: '600', color: '#111' },
  patientMeta: { fontSize: '11px', color: '#6b7280', marginTop: '3px' },
  rowActions: { display: 'flex', gap: '6px' },
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' },
  label: { fontSize: '11px', color: '#666', marginBottom: '4px', display: 'block' },
  value: { fontSize: '13px', color: '#111' },
  alertBox: { background: '#FEF2F2', border: '1px solid #F8D7DA', color: '#B91C1C', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px', fontSize: '12px' },
  infoBox: { background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '12px' },
  sectionTitle: { fontSize: '12px', fontWeight: '600', color: '#111', marginBottom: '10px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '8px 10px', color: '#888', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e8ebe8' },
  td: { padding: '10px', borderBottom: '1px solid #f0f2f0', color: '#222' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  btnSecondary: { background: '#fff', color: '#333', border: '1px solid #ddd', padding: '8px 14px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  btnDelete: { background: '#FFF1F2', color: '#BE123C', border: '1px solid #FDA4AF', padding: '8px 14px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  emptyState: { color: '#888', fontSize: '13px', padding: '24px 0' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '10px', padding: '24px', width: '720px', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '16px', fontWeight: '600', marginBottom: '16px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  formGroup: { marginBottom: '12px' },
  textarea: { width: '100%', minHeight: '84px', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box', resize: 'vertical' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' },
}
