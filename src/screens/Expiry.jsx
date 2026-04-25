import { useEffect, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'

export default function Expiry() {
  const { pharmacyId, setExpiryBadge } = usePharmacy()   // ← Updated: use setExpiryBadge from context
  const [drugs, setDrugs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('30')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [disposing, setDisposing] = useState(null)

  useEffect(() => { 
    if (pharmacyId) fetchExpiryData() 
  }, [pharmacyId])

  async function fetchExpiryData() {
    setLoading(true)
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .order('expiry_date')

    const loadedDrugs = data || []
    setDrugs(loadedDrugs)

    // Update sidebar badge dynamically (items expiring in 30 days or already expired)
    if (setExpiryBadge) {
      const urgentCount = loadedDrugs.filter(d => {
        const days = getDaysLeft(d.expiry_date)
        return days <= 30   // Change to <=7 if you want only critical
      }).length
      setExpiryBadge(urgentCount)
    }

    setLoading(false)
  }

  function getDaysLeft(expiryDate) {
    if (!expiryDate) return 999
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const exp = new Date(expiryDate)
    return Math.ceil((exp - today) / (1000 * 60 * 60 * 24))
  }

  function getUrgency(days) {
    if (days < 0)   return { label: 'Expired',  color: '#b91c1c', bg: '#fef2f2' }
    if (days <= 7)  return { label: 'Critical', color: '#b91c1c', bg: '#fef2f2' }
    if (days <= 30) return { label: 'Urgent',   color: '#92400e', bg: '#fffbeb' }
    if (days <= 90) return { label: 'Monitor',  color: '#065f46', bg: '#ecfdf5' }
    return           { label: 'OK',             color: '#6b7280', bg: '#f9fafb' }
  }

  const allWithDays = drugs.map(d => ({ ...d, daysLeft: getDaysLeft(d.expiry_date) }))
  const expired  = allWithDays.filter(d => d.daysLeft < 0)
  const within7  = allWithDays.filter(d => d.daysLeft >= 0 && d.daysLeft <= 7)
  const within30 = allWithDays.filter(d => d.daysLeft >= 0 && d.daysLeft <= 30)
  const within90 = allWithDays.filter(d => d.daysLeft >= 0 && d.daysLeft <= 90)

  // Figure out what to display based on filter
  let displayed = []
  let tableTitle = ''

  if (filter === 'daterange') {
    const from = fromDate ? new Date(fromDate) : null
    const to   = toDate   ? new Date(toDate)   : null
    displayed = allWithDays.filter(d => {
      const exp = new Date(d.expiry_date)
      if (from && to) return exp >= from && exp <= to
      if (from) return exp >= from
      if (to) return exp <= to
      return true
    })
    tableTitle = fromDate && toDate
      ? `Expiring ${fromDate} → ${toDate}`
      : fromDate ? `Expiring from ${fromDate}` : toDate ? `Expiring before ${toDate}` : 'All Drugs'
  } else if (filter === 'expired') {
    displayed = expired
    tableTitle = 'Already Expired'
  } else if (filter === 'all') {
    displayed = allWithDays
    tableTitle = 'All Drugs'
  } else {
    const days = parseInt(filter)
    displayed = allWithDays.filter(d => d.daysLeft >= 0 && d.daysLeft <= days)
    tableTitle = `Expiring within ${days} days`
  }

  async function disposeDrug(drug) {
    setDisposing(drug.id)
    if (window.confirm(`Dispose "${drug.drug_name}"? This sets quantity to 0.`)) {
      await supabase.from('inventory').update({ quantity: 0 }).eq('id', drug.id)
      await fetchExpiryData()   // This will also refresh the badge
    }
    setDisposing(null)
  }

  async function deleteDrug(drug) {
    if (window.confirm(`Permanently DELETE "${drug.drug_name}"? This cannot be undone.`)) {
      await supabase.from('inventory').delete().eq('id', drug.id)
      await fetchExpiryData()
    }
  }

  if (loading) return <div style={styles.loading}>Loading expiry alerts...</div>

  return (
    <div style={styles.page}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Expiry Alerts</h2>
          <p style={styles.subtitle}>Live from your inventory · updates automatically</p>
        </div>
        <span style={styles.liveBadge}>🔄 Auto-monitored daily</span>
      </div>

      {/* Summary Cards */}
      <div style={styles.statsGrid}>
        {[
          { key: 'expired', label: 'Already Expired',    count: expired.length,  warn: true },
          { key: '7',       label: 'Expiring in 7 days', count: within7.length,  warn: true },
          { key: '30',      label: 'Expiring in 30 days',count: within30.length, warn: false },
          { key: '90',      label: 'Expiring in 90 days',count: within90.length, warn: false },
        ].map(card => (
          <div
            key={card.key}
            onClick={() => setFilter(card.key)}
            style={{ ...styles.statCard, ...(filter === card.key ? styles.statCardActive : {}) }}
          >
            <p style={styles.statLabel}>{card.label}</p>
            <p style={{ ...styles.statValue, color: card.count > 0 && card.warn ? '#b91c1c' : '#111827' }}>
              {card.count}
            </p>
            <p style={styles.statNote}>
              {card.count > 0
                ? card.warn ? '⚠ Action needed' : 'Monitor'
                : '✓ All clear'}
            </p>
          </div>
        ))}
      </div>

      {/* Expired warning banner */}
      {expired.length > 0 && (
        <div style={styles.warnBanner}>
          ⚠️ <strong>{expired.length} drug{expired.length > 1 ? 's' : ''} already expired:</strong>{' '}
          {expired.map(d => d.drug_name).join(', ')} — Remove from shelf immediately.
        </div>
      )}

      {/* Filter Section */}
      <div style={styles.filterSection}>
        <div style={styles.filterRow}>
          <span style={styles.filterLabel}>Quick filter:</span>
          {[
            { key: 'expired', label: `Expired (${expired.length})` },
            { key: '7',       label: '1 Week' },
            { key: '30',      label: '1 Month' },
            { key: '90',      label: '3 Months' },
            { key: '180',     label: '6 Months' },
            { key: '365',     label: '1 Year' },
            { key: 'all',     label: `All (${allWithDays.length})` },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{ ...styles.tab, ...(filter === f.key ? styles.tabActive : {}) }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={styles.dateRangeRow}>
          <span style={styles.filterLabel}>Date range:</span>
          <div style={styles.dateInputGroup}>
            <span style={styles.dateInputLabel}>From</span>
            <input
              type="date"
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setFilter('daterange') }}
              style={styles.dateInput}
            />
          </div>
          <div style={styles.dateInputGroup}>
            <span style={styles.dateInputLabel}>To</span>
            <input
              type="date"
              value={toDate}
              onChange={e => { setToDate(e.target.value); setFilter('daterange') }}
              style={styles.dateInput}
            />
          </div>
          {(fromDate || toDate) && (
            <button
              style={styles.clearBtn}
              onClick={() => { setFromDate(''); setToDate(''); setFilter('30') }}
            >
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={styles.tableCard}>
        <div style={styles.tableHeader}>
          <span style={styles.tableTitle}>{tableTitle}</span>
          <span style={styles.tableCount}>{displayed.length} item{displayed.length !== 1 ? 's' : ''}</span>
        </div>

        {displayed.length === 0 ? (
          <div style={styles.empty}>
            <p style={{ fontSize: '28px', margin: '0 0 8px' }}>✅</p>
            <p>No drugs in this category.</p>
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                {['Drug Name', 'Category', 'Qty', 'Expiry Date', 'Days Left', 'Status', 'Actions'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((drug, i) => {
                const urgency = getUrgency(drug.daysLeft)
                return (
                  <tr key={drug.id} style={i % 2 === 0 ? {} : { background: '#fafafa' }}>
                    <td style={{ ...styles.td, fontWeight: '600', color: '#111827' }}>{drug.drug_name}</td>
                    <td style={styles.td}>{drug.category || '—'}</td>
                    <td style={{ ...styles.td, color: drug.quantity === 0 ? '#9ca3af' : '#374151' }}>
                      {drug.quantity === 0 ? 'Disposed' : drug.quantity}
                    </td>
                    <td style={styles.td}>{drug.expiry_date}</td>
                    <td style={{ ...styles.td, fontWeight: '600', color: urgency.color }}>
                      {drug.daysLeft < 0
                        ? `${Math.abs(drug.daysLeft)}d ago`
                        : `${drug.daysLeft}d`}
                    </td>
                    <td style={styles.td}>
                      <span style={{ ...styles.pill, color: urgency.color, background: urgency.bg }}>
                        {urgency.label}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actionRow}>
                        <button
                          style={{ ...styles.btn, opacity: drug.quantity === 0 ? 0.4 : 1 }}
                          onClick={() => disposeDrug(drug)}
                          disabled={disposing === drug.id || drug.quantity === 0}
                        >
                          {disposing === drug.id ? '...' : drug.quantity === 0 ? 'Done' : 'Dispose'}
                        </button>
                        <button style={styles.btnRed} onClick={() => deleteDrug(drug)}>
                          Delete
                        </button>
                      </div>
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
  page:           { padding: '22px 26px', flex: 1, overflowY: 'auto' },
  header:         { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  title:          { fontSize: '16px', fontWeight: '600', color: '#111827', margin: 0 },
  subtitle:       { fontSize: '12px', color: '#6b7280', margin: '3px 0 0' },
  liveBadge:      { fontSize: '12px', color: '#065f46', background: '#ecfdf5', padding: '5px 12px', borderRadius: '20px', border: '1px solid #d1fae5' },
  statsGrid:      { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' },
  statCard:       { background: '#fff', borderRadius: '8px', padding: '14px 16px', border: '1px solid #e5e7eb', cursor: 'pointer' },
  statCardActive: { border: '1px solid #0F6E56', background: '#f0fdf4' },
  statLabel:      { fontSize: '11px', color: '#6b7280', margin: '0 0 6px' },
  statValue:      { fontSize: '26px', fontWeight: '700', margin: '0 0 4px' },
  statNote:       { fontSize: '11px', color: '#9ca3af', margin: 0 },
  warnBanner:     { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#b91c1c', marginBottom: '14px' },
  filterSection:  { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '14px 16px', marginBottom: '14px' },
  filterRow:      { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' },
  filterLabel:    { fontSize: '12px', color: '#6b7280', fontWeight: '600', whiteSpace: 'nowrap', marginRight: '4px' },
  tab:            { padding: '5px 13px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '12px', color: '#374151', cursor: 'pointer' },
  tabActive:      { background: '#0F6E56', color: '#fff', border: '1px solid #0F6E56', fontWeight: '600' },
  dateRangeRow:   { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
  dateInputGroup: { display: 'flex', alignItems: 'center', gap: '6px' },
  dateInputLabel: { fontSize: '12px', color: '#6b7280', fontWeight: '500' },
  dateInput:      { padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', color: '#111827', background: '#f9fafb', cursor: 'pointer' },
  clearBtn:       { padding: '5px 12px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#fff', fontSize: '12px', color: '#6b7280', cursor: 'pointer' },
  tableCard:      { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' },
  tableHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f3f4f6' },
  tableTitle:     { fontSize: '13px', fontWeight: '600', color: '#111827' },
  tableCount:     { fontSize: '12px', color: '#9ca3af' },
  table:          { width: '100%', borderCollapse: 'collapse' },
  thead:          { background: '#f9fafb' },
  th:             { textAlign: 'left', padding: '9px 12px', fontSize: '11px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #f3f4f6' },
  td:             { padding: '10px 12px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f9fafb' },
  pill:           { padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '600' },
  actionRow:      { display: 'flex', gap: '6px' },
  btn:            { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' },
  btnRed:         { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' },
  empty:          { textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '13px' },
  loading:        { padding: '40px', textAlign: 'center', color: '#6b7280' },
}