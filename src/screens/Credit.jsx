import { useEffect, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'

export default function Credit() {
  const { pharmacyId, userId, currentUserName, currentUserEmail } = usePharmacy()
  const [debts, setDebts] = useState([])           // unpaid credit sales
  const [settledThisMonth, setSettledThisMonth] = useState(0)
  const [settledCount, setSettledCount] = useState(0)
  const [filteredDebts, setFilteredDebts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState({ customer_name: '', drug_name: '', qty_sold: 1, total_kes: 0 })
  const [inventory, setInventory] = useState([])

  useEffect(() => {
    if (pharmacyId) {
      fetchDebts()
      fetchSettledThisMonth()
      fetchInventory()
    }
  }, [pharmacyId])

  // Filter for search
  useEffect(() => {
    const filtered = searchTerm.trim() === '' 
      ? debts 
      : debts.filter(d => d.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()))
    setFilteredDebts(filtered)
  }, [debts, searchTerm])

  async function fetchDebts() {
    const { data } = await supabase
      .from('sales_ledger')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .ilike('payment_method', '%credit%')
      .order('sold_at', { ascending: false })

    setDebts(data || [])
    setLoading(false)
  }

  async function fetchSettledThisMonth() {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const { data } = await supabase
      .from('sales_ledger')
      .select('total_kes')
      .eq('pharmacy_id', pharmacyId)
      .eq('payment_method', 'Paid')
      .gte('sold_at', monthStart)

    const total = (data || []).reduce((sum, s) => sum + (parseFloat(s.total_kes) || 0), 0)
    setSettledThisMonth(total)
    setSettledCount(data?.length || 0)
  }

  async function fetchInventory() {
    const { data } = await supabase
      .from('inventory')
      .select('drug_name, price_kes')
      .eq('pharmacy_id', pharmacyId)
      .order('drug_name')
    setInventory(data || [])
  }

  // Auto-calculate total when drug or qty changes
  useEffect(() => {
    if (formData.drug_name && formData.qty_sold > 0) {
      const selected = inventory.find(item => item.drug_name === formData.drug_name)
      if (selected) {
        const price = parseFloat(selected.price_kes) || 0
        setFormData(prev => ({ ...prev, total_kes: price * prev.qty_sold }))
      }
    }
  }, [formData.drug_name, formData.qty_sold, inventory])

  async function handleSaveCreditSale() {
    if (!formData.customer_name.trim() || !formData.drug_name) {
      return alert('Please enter customer name and select a drug')
    }

    const saleData = {
      drug_name: formData.drug_name,
      qty_sold: parseInt(formData.qty_sold, 10),
      total_kes: parseFloat(formData.total_kes),
      payment_method: 'Credit (Debt)',
      customer_name: formData.customer_name.trim(),
      sold_at: new Date().toISOString(),
      cashier_id: userId || 'AD',
      cashier_name: currentUserName || currentUserEmail || 'Unknown',
      pharmacy_id: pharmacyId
    }

    const { error } = await supabase.from('sales_ledger').insert([saleData])
    if (error) {
      alert('Failed: ' + error.message)
    } else {
      alert('Credit sale logged!')
      setShowForm(false)
      setFormData({ customer_name: '', drug_name: '', qty_sold: 1, total_kes: 0 })
      fetchDebts()
    }
  }

  async function markAsPaid(id) {
    if (!confirm('Mark this sale as fully paid?')) return
    const { error } = await supabase
      .from('sales_ledger')
      .update({ payment_method: 'Paid' })
      .eq('id', id)
      .eq('pharmacy_id', pharmacyId)

    if (error) alert('Failed to update')
    else {
      alert('Marked as Paid ✓')
      fetchDebts()
      fetchSettledThisMonth()   // refresh settled amount
    }
  }

  async function deleteDebt(id) {
    if (!confirm('Delete this debt record permanently?')) return
    const { error } = await supabase
      .from('sales_ledger')
      .delete()
      .eq('id', id)
      .eq('pharmacy_id', pharmacyId)

    if (error) alert('Failed to delete')
    else {
      alert('Debt deleted')
      fetchDebts()
    }
  }

  function calculateDays(soldAt) {
    const diffTime = Math.abs(new Date() - new Date(soldAt))
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const totalOutstanding = filteredDebts.reduce((sum, d) => sum + (parseFloat(d.total_kes) || 0), 0)
  const oldestDays = debts.length > 0 
    ? Math.max(...debts.map(d => calculateDays(d.sold_at))) 
    : 0

  if (loading) return <div style={styles.loading}>Loading...</div>

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <h2 style={styles.title}>Credit & Debts</h2>
        <button style={styles.btnPrimary} onClick={() => setShowForm(true)}>+ Log Credit Sale</button>
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.lbl}>Total Outstanding</div>
          <div style={{...styles.val, color:'#E24B4A'}}>KES {totalOutstanding.toLocaleString()}</div>
          <div style={styles.sub}>{filteredDebts.length} unpaid sales</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.lbl}>Settled This Month</div>
          <div style={styles.val}>KES {settledThisMonth.toLocaleString()}</div>
          <div style={styles.sub}>{settledCount} customers paid</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.lbl}>Oldest Debt</div>
          <div style={styles.val}>{oldestDays} days</div>
          <div style={styles.sub}>
            {debts.length > 0 ? debts[0].customer_name : '-'}
          </div>
        </div>
      </div>

      <div style={styles.searchContainer}>
        <input 
          type="text" 
          placeholder="Search by customer name..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
          style={styles.searchInput} 
        />
      </div>

      {/* Log Credit Sale Modal */}
      {showForm && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Log New Credit Sale</h3>
            
            <div style={styles.formGroup}>
              <label>Customer Name</label>
              <input 
                type="text" 
                value={formData.customer_name} 
                onChange={e => setFormData({...formData, customer_name: e.target.value})} 
                style={styles.input} 
                placeholder="e.g. John Kamau" 
              />
            </div>

            <div style={styles.formGroup}>
              <label>Select Drug</label>
              <select 
                value={formData.drug_name} 
                onChange={e => setFormData({...formData, drug_name: e.target.value})} 
                style={styles.input}
              >
                <option value="">-- Choose drug --</option>
                {inventory.map((item, i) => (
                  <option key={i} value={item.drug_name}>{item.drug_name}</option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label>Quantity</label>
              <input 
                type="number" 
                min="1" 
                value={formData.qty_sold} 
                onChange={e => setFormData({...formData, qty_sold: parseInt(e.target.value)||1})} 
                style={styles.input} 
              />
            </div>

            <div style={styles.formGroup}>
              <label>Amount Owed</label>
              <div style={{fontSize:'20px', fontWeight:'700', color:'#0F6E56'}}>
                KES {formData.total_kes.toLocaleString()}
              </div>
            </div>

            <button onClick={handleSaveCreditSale} style={styles.btnPrimary}>Save Credit Sale</button>
            <button onClick={() => setShowForm(false)} style={styles.btnSecondary}>Cancel</button>
          </div>
        </div>
      )}

      <div style={styles.card}>
        <div style={styles.cardTitle}>Outstanding Credit Sales ({filteredDebts.length})</div>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Customer</th>
              <th style={styles.th}>Drug</th>
              <th style={styles.th}>Qty</th>
              <th style={styles.th}>Amount Owed</th>
              <th style={styles.th}>Date</th>
              <th style={styles.th}>Days Overdue</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDebts.map(debt => {
              const days = calculateDays(debt.sold_at)
              return (
                <tr key={debt.id}>
                  <td style={styles.td}>{debt.customer_name}</td>
                  <td style={styles.td}>{debt.drug_name}</td>
                  <td style={styles.td}>{debt.qty_sold}</td>
                  <td style={styles.td}>KES {parseFloat(debt.total_kes).toLocaleString()}</td>
                  <td style={styles.td}>{new Date(debt.sold_at).toLocaleDateString('en-GB')}</td>
                  <td style={styles.td}>
                    <span style={days > 30 ? styles.pillRed : styles.pillOrange}>{days} days</span>
                  </td>
                  <td style={styles.actionsTd}>
                    <button onClick={() => markAsPaid(debt.id)} style={styles.btnPaid}>Mark Paid</button>
                    <button onClick={() => deleteDebt(debt.id)} style={styles.btnDelete}>Delete</button>
                  </td>
                </tr>
              )
            })}
            {filteredDebts.length === 0 && (
              <tr>
                <td colSpan="7" style={{textAlign:'center', padding:'60px', color:'#888'}}>
                  No credit sales found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const styles = {
  page: { padding: '18px 22px', flex: 1 },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '18px' },
  statCard: { background: '#fff', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e8ebe8' },
  lbl: { fontSize: '11px', color: '#888', marginBottom: '6px' },
  val: { fontSize: '22px', fontWeight: '600', color: '#111' },
  sub: { fontSize: '11px', color: '#666' },
  card: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '14px 16px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '12px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '7px 10px', color: '#888', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e8ebe8' },
  td: { padding: '9px 10px', borderBottom: '1px solid #f0f2f0', color: '#222' },
  actionsTd: { padding: '9px 10px', borderBottom: '1px solid #f0f2f0' },
  pillRed: { background: '#FCEBEB', color: '#A32D2D', padding: '4px 10px', borderRadius: '99px', fontSize: '11px' },
  pillOrange: { background: '#FFF4E5', color: '#E67E22', padding: '4px 10px', borderRadius: '99px', fontSize: '11px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '10px', padding: '24px', width: '420px' },
  modalTitle: { fontSize: '15px', fontWeight: '600', color: '#111', marginBottom: '16px' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', width: '100%', marginBottom: '8px' },
  btnSecondary: { background: '#fff', color: '#333', border: '1px solid #ddd', padding: '12px', borderRadius: '8px', cursor: 'pointer', width: '100%' },
  searchContainer: { marginBottom: '16px' },
  searchInput: { width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px' },
  btnPaid: { background: '#0F6E56', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', marginRight: '6px', fontSize: '12px' },
  btnDelete: { background: '#E24B4A', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' },
  input: { width: '100%', padding: '9px 12px', border: '1px solid #ccc', borderRadius: '7px', marginTop: '4px', fontSize: '13px' },
  formGroup: { marginBottom: '14px' }
}