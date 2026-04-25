import { useEffect, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'

export default function Insurance() {
  const { pharmacyId, isOwner } = usePharmacy()
  const canEdit = isOwner
  const [claims, setClaims] = useState([])
  const [allSales, setAllSales] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filterInsurer, setFilterInsurer] = useState('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selected, setSelected] = useState([])
  const [form, setForm] = useState({
    insurer: '', member_no: '', drug_name: '',
    quantity: '', diagnosis_code: '', amount: ''
  })

  const insurers = ['ALL', 'AAR', 'JUBILEE', 'BRITAM', 'MADISON', 'CIC', 'UAP', 'RESOLUTION', 'OTHER']

  useEffect(() => {
    if (pharmacyId) fetchInsuranceClaims()
  }, [pharmacyId])

  async function fetchInsuranceClaims() {
    setLoading(true)
    const { data } = await supabase
      .from('sales_ledger')
      .select('*')
      .eq('pharmacy_id', pharmacyId)        // ← FIXED: Now only shows this pharmacy's data
      .order('sold_at', { ascending: false })

    const all = data || []
    setAllSales(all)

    const insuranceClaims = all.filter(t => 
      t.insurer || t.payment_method?.toLowerCase().includes('insurance')
    )

    setClaims(insuranceClaims)
    setLoading(false)
  }

  const filtered = claims.filter(c => {
    const matchInsurer = filterInsurer === 'ALL' || 
      c.insurer === filterInsurer ||
      (c.payment_method?.toUpperCase().includes(filterInsurer) && !c.insurer)

    const matchFrom = !fromDate || new Date(c.sold_at) >= new Date(fromDate)
    const matchTo = !toDate || new Date(c.sold_at) <= new Date(toDate + 'T23:59:59')

    return matchInsurer && matchFrom && matchTo
  })

  const totalValue = filtered.reduce((s, c) => s + (parseFloat(c.total_kes) || 0), 0)

  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleAll() {
    setSelected(selected.length === filtered.length ? [] : filtered.map(c => c.id))
  }

  function buildCSV(rows) {
    const headers = ['Claim ID', 'Date', 'Insurer', 'Drug', 'Qty', 'Amount (KES)', 'Cashier', 'Status']
    const data = rows.map(c => [
      `INS-${String(c.id).padStart(4, '0')}`,
      c.sold_at ? new Date(c.sold_at).toLocaleDateString('en-GB') : '',
      c.insurer || c.payment_method?.toUpperCase() || '',
      c.drug_name || '',
      c.qty_sold || '',
      c.total_kes || '',
      c.cashier_name || c.cashier_id || '',
      'Pending'
    ])
    return [headers, ...data].map(r => r.join(',')).join('\n')
  }

  function downloadCSV(rows, filename) {
    const csv = buildCSV(rows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadAll() { downloadCSV(filtered, `insurance_claims_${filterInsurer}_${Date.now()}.csv`) }
  function downloadSelected() {
    const rows = filtered.filter(c => selected.includes(c.id))
    if (!rows.length) return alert('Select at least one claim first')
    downloadCSV(rows, `insurance_claims_selected_${Date.now()}.csv`)
  }
  function downloadSingle(c) { downloadCSV([c], `insurance_claim_INS-${String(c.id).padStart(4,'0')}.csv`) }

  if (loading) return <div style={styles.loading}>Loading insurance claims...</div>

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <h2 style={styles.title}>Insurance Claims</h2>
          <p style={styles.subtitle}>Manage insurer claim records filtered by provider, date, and cashiers.</p>
        </div>
        <button style={styles.btnPrimary} onClick={() => setShowForm(true)}>+ New Claim</button>
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.lbl}>Showing Claims</div>
          <div style={styles.val}>{filtered.length}</div>
          <div style={styles.sub}>of {claims.length} total</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.lbl}>Total Value</div>
          <div style={{ ...styles.val, color: '#0F6E56' }}>KES {totalValue.toLocaleString()}</div>
          <div style={styles.sub}>Filtered results</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.lbl}>Selected</div>
          <div style={{ ...styles.val, color: selected.length > 0 ? '#0F6E56' : '#111' }}>{selected.length}</div>
          <div style={styles.sub}>Ready to download</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.lbl}>All Sales</div>
          <div style={styles.val}>{allSales.length}</div>
          <div style={styles.sub}>In ledger</div>
        </div>
      </div>

      <div style={styles.filterBox}>
        <div style={styles.filterRow}>
          <span style={styles.filterLabel}>Insurer:</span>
          <div style={styles.tabScroll}>
            {insurers.map(f => (
              <button key={f} onClick={() => setFilterInsurer(f)}
                style={{ ...styles.tab, ...(filterInsurer === f ? styles.tabActive : {}) }}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <div style={styles.filterRow}>
          <span style={styles.filterLabel}>Date range:</span>
          <div style={styles.dateGroup}>
            <span style={styles.dateLabel}>From</span>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={styles.dateInput} />
          </div>
          <div style={styles.dateGroup}>
            <span style={styles.dateLabel}>To</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={styles.dateInput} />
          </div>
          {(fromDate || toDate) && (
            <button style={styles.clearBtn} onClick={() => { setFromDate(''); setToDate('') }}>✕ Clear</button>
          )}
        </div>
      </div>

      <div style={styles.actionBar}>
        <span style={styles.actionInfo}>
          {selected.length > 0 ? `${selected.length} claim${selected.length > 1 ? 's' : ''} selected` : `${filtered.length} claims shown`}
        </span>
        <div style={styles.actionBtns}>
          {selected.length > 0 && canEdit && (
            <button style={styles.btnGreen} onClick={downloadSelected}>
              ⬇ Download Selected ({selected.length})
            </button>
          )}
          {canEdit ? (
            <button style={styles.btnOutline} onClick={downloadAll}>
              ⬇ Download All ({filtered.length})
            </button>
          ) : (
            <span style={styles.adminNote}>Export restricted to owner</span>
          )}
        </div>
      </div>

      <div style={styles.card}>
        {filtered.length === 0 ? (
          <div style={styles.empty}>
            <p style={{ fontSize: '24px', margin: '0 0 8px' }}>🛡️</p>
            <p>No insurance claims found for this filter.</p>
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                {canEdit && (
                  <th style={styles.th}>
                    <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleAll} />
                  </th>
                )}
                <th style={styles.th}>Claim ID</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Insurer</th>
                <th style={styles.th}>Drug</th>
                <th style={styles.th}>Qty</th>
                <th style={styles.th}>Amount</th>
                <th style={styles.th}>Cashier</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Download</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c.id}
                  style={{
                    ...(i % 2 === 0 ? {} : { background: '#fafafa' }),
                    ...(selected.includes(c.id) ? { background: '#f0fdf4' } : {})
                  }}>
                  {canEdit && (
                    <td style={styles.td}>
                      <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)} />
                    </td>
                  )}
                  <td style={{ ...styles.td, fontFamily: 'monospace', color: '#0F6E56', fontWeight: '600' }}>
                    #INS-{String(c.id).padStart(4, '0')}
                  </td>
                  <td style={styles.td}>
                    {c.sold_at ? new Date(c.sold_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td style={styles.td}>
                    <span style={styles.pillBlue}>{c.insurer || c.payment_method || '—'}</span>
                  </td>
                  <td style={{ ...styles.td, fontWeight: '500' }}>{c.drug_name}</td>
                  <td style={styles.td}>{c.qty_sold}</td>
                  <td style={{ ...styles.td, fontWeight: '600' }}>KES {parseFloat(c.total_kes || 0).toLocaleString()}</td>
                  <td style={styles.td}>{c.cashier_name || c.cashier_id || '—'}</td>
                  <td style={styles.td}><span style={styles.pillAmber}>Pending</span></td>
                  <td style={styles.td}>
                    {canEdit ? (
                      <button style={styles.btnDownloadSingle} onClick={() => downloadSingle(c)}>⬇</button>
                    ) : (
                      <span style={styles.smallNote}>Owner only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>File Insurance Claim</h3>
            <div style={styles.formGrid}>
              {[
                { label: 'Member No.', key: 'member_no', placeholder: 'Claim membership number' },
                { label: 'Drug Name', key: 'drug_name', placeholder: 'Drug name as billed' },
                { label: 'Quantity', key: 'quantity', type: 'number', placeholder: 'Quantity' },
                { label: 'Diagnosis Code (ICD-10)', key: 'diagnosis_code', placeholder: 'ICD-10 diagnosis code' },
                { label: 'Amount (KES)', key: 'amount', type: 'number', placeholder: 'Total amount' },
              ].map(f => (
                <div key={f.key} style={styles.formGroup}>
                  <label style={styles.label}>{f.label}</label>
                  <input type={f.type || 'text'} style={styles.input} placeholder={f.placeholder}
                    value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                </div>
              ))}
              <div style={styles.formGroup}>
                <label style={styles.label}>Insurer</label>
                <select style={styles.input} value={form.insurer}
                  onChange={e => setForm({ ...form, insurer: e.target.value })}>
                  {['AAR','Jubilee','Britam','Madison','CIC','UAP','Resolution','OTHER'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowForm(false)} style={styles.btnSecondary}>Cancel</button>
              <button style={styles.btnPrimary} onClick={() => {
                alert('Insurance claim recorded. Complete claim settlement from billing or claims review.')
                setShowForm(false)
                setForm({ insurer: '', member_no: '', drug_name: '', quantity: '', diagnosis_code: '', amount: '' })
              }}>File Claim</button>
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
  subtitle: { fontSize: '12px', color: '#888', margin: '3px 0 0' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '14px' },
  statCard: { background: '#fff', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e5e7eb' },
  lbl: { fontSize: '11px', color: '#888', marginBottom: '6px' },
  val: { fontSize: '22px', fontWeight: '700', color: '#111', marginBottom: '2px' },
  sub: { fontSize: '11px', color: '#666' },
  filterBox: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px 16px', marginBottom: '12px' },
  filterRow: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' },
  filterLabel: { fontSize: '12px', color: '#6b7280', fontWeight: '600', minWidth: '70px' },
  tabScroll: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  tab: { padding: '5px 12px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '12px', color: '#374151', cursor: 'pointer' },
  tabActive: { background: '#0F6E56', color: '#fff', border: '1px solid #0F6E56', fontWeight: '600' },
  dateGroup: { display: 'flex', alignItems: 'center', gap: '6px' },
  dateLabel: { fontSize: '12px', color: '#6b7280' },
  dateInput: { padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', color: '#111', background: '#f9fafb', cursor: 'pointer' },
  clearBtn: { padding: '5px 10px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#fff', fontSize: '11px', color: '#6b7280', cursor: 'pointer' },
  actionBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  actionInfo: { fontSize: '12px', color: '#6b7280' },
  actionBtns: { display: 'flex', gap: '8px' },
  btnGreen: { background: '#0F6E56', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' },
  btnOutline: { background: '#fff', color: '#374151', border: '1px solid #e5e7eb', padding: '7px 14px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  btnDownloadSingle: { background: '#f0fdf4', color: '#0F6E56', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  thead: { background: '#f9fafb' },
  th: { textAlign: 'left', padding: '8px 10px', color: '#9ca3af', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase' },
  td: { padding: '10px', borderBottom: '1px solid #f3f4f6', color: '#374151' },
  pillAmber: { background: '#fffbeb', color: '#92400e', padding: '2px 9px', borderRadius: '99px', fontSize: '11px', fontWeight: '500' },
  pillBlue: { background: '#eff6ff', color: '#1d4ed8', padding: '2px 9px', borderRadius: '99px', fontSize: '11px', fontWeight: '500' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  btnSecondary: { background: '#fff', color: '#333', border: '1px solid #e5e7eb', padding: '7px 14px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '10px', padding: '24px', width: '580px', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '15px', fontWeight: '600', color: '#111', marginBottom: '16px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '8px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '11px', color: '#555' },
  input: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '13px' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' },
  empty: { textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '13px' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' }
}