import { useEffect, useState } from 'react'
import { usePharmacy } from '../context'
import supabase from '../supabase'

export default function Inventory() {
  const { pharmacyId, isOwner } = usePharmacy()
  const canEdit = isOwner
  const [drugs, setDrugs] = useState([])
  const [filtered, setFiltered] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingDrug, setEditingDrug] = useState(null)

  const emptyForm = {
    drug_name: '', drug_code: '', quantity: '', price_kes: '', expiry_date: '',
    supplier_name: '', category: '', low_stock_threshold: 20,
    is_controlled: false, ppb_category: ''
  }

  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    if (pharmacyId) fetchInventory()
  }, [pharmacyId])

  useEffect(() => {
    const q = search.toLowerCase().trim()
    setFiltered(drugs.filter(d =>
      d.drug_name?.toLowerCase().includes(q) ||
      d.drug_code?.toLowerCase().includes(q) ||
      d.category?.toLowerCase().includes(q) ||
      d.supplier_name?.toLowerCase().includes(q)
    ))
  }, [search, drugs])

  async function fetchInventory() {
    setLoading(true)
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .order('drug_name')

    if (error) console.error("Fetch inventory error:", error)
    if (data) { setDrugs(data); setFiltered(data) }
    setLoading(false)
  }

  function getStatus(drug) {
    const today = new Date()
    const expiry = new Date(drug.expiry_date || '2100-01-01')
    const daysToExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
    if (drug.quantity <= 0) return { label: 'Out of Stock', color: '#E24B4A', bg: '#FCEBEB' }
    if (daysToExpiry < 0) return { label: 'Expired', color: '#E24B4A', bg: '#FCEBEB' }
    if (daysToExpiry <= 30) return { label: 'Expiring Soon', color: '#E09B00', bg: '#FAEEDA' }
    if (drug.quantity <= (drug.low_stock_threshold || 20)) return { label: 'Low Stock', color: '#E09B00', bg: '#FAEEDA' }
    return { label: 'In Stock', color: '#0F6E56', bg: '#E1F5EE' }
  }

  function openAdd() {
    setEditingDrug(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(drug) {
    setEditingDrug(drug)
    setForm({
      drug_name: drug.drug_name || '',
      drug_code: drug.drug_code || '',
      quantity: drug.quantity ?? '',
      price_kes: drug.price_kes ?? '',
      expiry_date: drug.expiry_date || '',
      supplier_name: drug.supplier_name || '',
      category: drug.category || '',
      low_stock_threshold: drug.low_stock_threshold ?? 20,
      is_controlled: drug.is_controlled || false,
      ppb_category: drug.ppb_category || ''
    })
    setShowForm(true)
  }

  async function saveDrug() {
    if (!pharmacyId) return alert("Pharmacy ID not found. Please login again.")

    const payload = {
      pharmacy_id: pharmacyId,
      drug_name: form.drug_name.trim(),
      drug_code: form.drug_code.trim().toUpperCase(),
      quantity: parseInt(form.quantity) || 0,
      price_kes: parseFloat(form.price_kes) || 0,
      expiry_date: form.expiry_date || null,
      supplier_name: form.supplier_name.trim(),
      category: form.category.trim(),
      low_stock_threshold: parseInt(form.low_stock_threshold) || 20,
      is_controlled: !!form.is_controlled,
      ppb_category: form.is_controlled ? (form.ppb_category || null) : null
    }

    let error
    if (editingDrug) {
      const { error: err } = await supabase
        .from('inventory')
        .update(payload)
        .eq('id', editingDrug.id)
      error = err
    } else {
      const { error: err } = await supabase.from('inventory').insert([payload])
      error = err
    }

    if (!error) {
      alert(editingDrug ? '✅ Drug updated successfully!' : '✅ Drug added successfully!')
      setShowForm(false)
      setEditingDrug(null)
      setForm(emptyForm)
      fetchInventory()
    } else {
      alert('Error saving drug: ' + error.message)
      console.error(error)
    }
  }

  async function deleteDrug(drug) {
    const confirmed = window.confirm(
      `⚠️ Delete "${drug.drug_name}" from inventory?\n\nThis will also remove all its sales records. This cannot be undone.`
    )
    if (!confirmed) return

    // Step 1: Delete related sales_ledger records first
    const { error: ledgerError } = await supabase
      .from('sales_ledger')
      .delete()
      .eq('drug_id', drug.id)

    if (ledgerError) {
      alert('Error clearing sales records: ' + ledgerError.message)
      return
    }

    // Step 2: Now safely delete the drug
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', drug.id)

    if (!error) {
      fetchInventory()
    } else {
      alert('Error deleting drug: ' + error.message)
    }
  }

  function exportCSV() {
    const headers = ['Drug Name','Code','Category','Qty','Price (KES)','Expiry','Supplier','Controlled','PPB Category','Status']
    const rows = filtered.map(d => [
      d.drug_name, d.drug_code || '', d.category || '', d.quantity,
      d.price_kes, d.expiry_date || '', d.supplier_name || '',
      d.is_controlled ? 'Yes' : 'No', d.ppb_category || '', getStatus(d).label
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={styles.loading}>Loading inventory...</div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Inventory Management</h2>
          <p style={styles.subtitle}>
            {drugs.length} drugs total · {drugs.filter(d => d.quantity <= 20).length} low stock ·{' '}
            {drugs.filter(d => d.is_controlled === true).length} controlled substances
          </p>
        </div>
        <div style={styles.headerActions}>
          {canEdit ? (
            <>
              <button onClick={exportCSV} style={styles.btnSecondary}>Export CSV</button>
              <button onClick={openAdd} style={styles.btnPrimary}>+ Add New Drug</button>
            </>
          ) : (
            <span style={styles.adminNote}>Only the pharmacy owner can add, edit, delete, or export inventory.</span>
          )}
        </div>
      </div>

      <input
        style={styles.search}
        placeholder="Search by drug name, code, category, supplier..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>DRUG NAME</th>
              <th style={styles.th}>CODE</th>
              <th style={styles.th}>CATEGORY</th>
              <th style={styles.th}>QTY</th>
              <th style={styles.th}>PRICE (KES)</th>
              <th style={styles.th}>EXPIRY</th>
              <th style={styles.th}>SUPPLIER</th>
              <th style={styles.th}>CONTROLLED</th>
              <th style={styles.th}>PPB CATEGORY</th>
              <th style={styles.th}>STATUS</th>
              <th style={styles.th}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((drug, i) => {
              const status = getStatus(drug)
              return (
                <tr key={i} style={i % 2 === 0 ? {} : { background: '#f9fbf9' }}>
                  <td style={styles.td}>{drug.drug_name}</td>
                  <td style={styles.td}>{drug.drug_code || '—'}</td>
                  <td style={styles.td}>{drug.category || '—'}</td>
                  <td style={styles.td}>{drug.quantity}</td>
                  <td style={styles.td}>KES {parseFloat(drug.price_kes || 0).toLocaleString()}</td>
                  <td style={styles.td}>{drug.expiry_date || '—'}</td>
                  <td style={styles.td}>{drug.supplier_name || '—'}</td>
                  <td style={styles.td}>
                    {drug.is_controlled
                      ? <span style={{ color: '#E09B00', fontWeight: '600' }}>YES</span>
                      : <span style={{ color: '#888' }}>No</span>}
                  </td>
                  <td style={styles.td}>{drug.ppb_category || '—'}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.statusBadge, color: status.color, background: status.bg }}>
                      {status.label}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {canEdit ? (
                      <div style={styles.actionBtns}>
                        <button onClick={() => openEdit(drug)} style={styles.btnEdit}>Edit</button>
                        <button onClick={() => deleteDrug(drug)} style={styles.btnDelete}>Delete</button>
                      </div>
                    ) : (
                      <span style={styles.adminNote}>Owner only</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Drug Modal */}
      {showForm && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>
              {editingDrug ? `✏️ Edit Drug — ${editingDrug.drug_name}` : 'Add New Drug to Inventory'}
            </h3>

            <div style={styles.formGrid}>
              {[
                ['drug_name', 'Drug Name *', 'text'],
                ['drug_code', 'Drug Code (e.g. TRAM-50)', 'text'],
                ['category', 'Category', 'text'],
                ['quantity', 'Current Quantity', 'number'],
                ['price_kes', 'Selling Price (KES)', 'number'],
                ['expiry_date', 'Expiry Date', 'date'],
                ['supplier_name', 'Supplier Name', 'text'],
                ['low_stock_threshold', 'Low Stock Alert Level', 'number'],
              ].map(([key, label, type]) => (
                <div key={key} style={styles.formGroup}>
                  <label style={styles.label}>{label}</label>
                  <input
                    type={type}
                    style={styles.input}
                    value={form[key]}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>
                <input
                  type="checkbox"
                  checked={form.is_controlled}
                  onChange={e => setForm({ ...form, is_controlled: e.target.checked })}
                  style={{ marginRight: '8px' }}
                />
                This is a Controlled Substance (Narcotic / Psychotropic)
              </label>
            </div>

            {form.is_controlled && (
              <div style={styles.formGroup}>
                <label style={styles.label}>PPB Category (e.g. Opioid Analgesic, Psychotropic)</label>
                <input
                  type="text"
                  style={styles.input}
                  value={form.ppb_category}
                  onChange={e => setForm({ ...form, ppb_category: e.target.value })}
                  placeholder="e.g. Opioid Analgesic"
                />
              </div>
            )}

            <div style={styles.modalFooter}>
              <button onClick={() => { setShowForm(false); setEditingDrug(null) }} style={styles.btnSecondary}>
                Cancel
              </button>
              <button onClick={saveDrug} style={styles.btnPrimary}>
                {editingDrug ? 'Update Drug' : 'Save Drug'}
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
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111' },
  subtitle: { fontSize: '11px', color: '#666' },
  headerActions: { display: 'flex', gap: '8px' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  btnSecondary: { background: '#fff', color: '#333', border: '1px solid #ddd', padding: '8px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  btnEdit: { background: '#EAF4FF', color: '#1A6BB5', border: '1px solid #B8D9F7', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' },
  btnDelete: { background: '#FCEBEB', color: '#C0392B', border: '1px solid #F09595', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' },
  actionBtns: { display: 'flex', gap: '6px' },
  search: { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', marginBottom: '14px', boxSizing: 'border-box' },
  tableWrap: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '8px 10px', color: '#888', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e8ebe8', background: '#f9fbf9' },
  td: { padding: '10px', borderBottom: '1px solid #f0f2f0', color: '#222' },
  statusBadge: { padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '500' },
  adminNote: { color: '#6b7280', fontSize: '12px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '10px', padding: '24px', width: '680px', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '15px', fontWeight: '600', color: '#111', marginBottom: '16px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '11px', color: '#555' },
  input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', width: '100%', boxSizing: 'border-box' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' }
}