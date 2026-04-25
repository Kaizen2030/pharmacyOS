import { useEffect, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'

export default function Mpesa() {
  const { pharmacyId, pharmacyName } = usePharmacy()
  const [transactions, setTransactions] = useState([])
  const [allMpesa, setAllMpesa] = useState([])
  const [showSTK, setShowSTK] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [stkMsg, setStkMsg] = useState('')

  useEffect(() => {
    if (pharmacyId) fetchMpesaTransactions()
  }, [pharmacyId])

  async function fetchMpesaTransactions() {
    setLoading(true)
    const { data } = await supabase
      .from('sales_ledger')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .order('sold_at', { ascending: false })

    const all = data || []
    const mpesa = all.filter(t =>
      t.payment_method?.toLowerCase().includes('mpesa') ||
      t.payment_method?.toLowerCase().includes('m-pesa') ||
      t.mpesa_code
    )
    setAllMpesa(mpesa)
    setTransactions(mpesa)
    setLoading(false)
  }

  async function sendSTK() {
    if (!phone || !amount) return alert('Enter phone number and amount')
    if (amount < 1) return alert('Amount must be at least KES 1')
    setSending(true)
    setStkMsg('')

    const { data, error } = await supabase.functions.invoke('mpesa-stk', {
      body: { phone, amount: parseFloat(amount), reference, pharmacy_name: pharmacyName }
    })

    if (error || data?.errorCode) {
      setStkMsg('❌ Failed: ' + (data?.errorMessage || error?.message || 'Unknown error'))
    } else if (data?.ResponseCode === '0') {
      setStkMsg('✅ STK Push sent! Ask customer to check their phone.')
      setPhone('')
      setAmount('')
      setReference('')
    } else {
      setStkMsg('⚠️ Response: ' + (data?.CustomerMessage || JSON.stringify(data)))
    }

    setSending(false)
  }

  const today = new Date().toISOString().split('T')[0]
  const todayMpesa = allMpesa.filter(t => t.sold_at?.startsWith(today))
  const todayRevenue = todayMpesa.reduce((sum, t) => sum + (parseFloat(t.total_kes) || 0), 0)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekRevenue = allMpesa
    .filter(t => new Date(t.sold_at) >= weekAgo)
    .reduce((sum, t) => sum + (parseFloat(t.total_kes) || 0), 0)

  if (loading) return <div style={styles.loading}>Loading M-Pesa transactions...</div>

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <h2 style={styles.title}>M-Pesa</h2>
          <p style={styles.sub}>Live from your sales ledger</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={styles.badgeLive}>🟢 Synced live</span>
          <button style={styles.btnPrimary} onClick={() => setShowSTK(!showSTK)}>
            {showSTK ? 'Cancel' : '📲 STK Push'}
          </button>
        </div>
      </div>

      {showSTK && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Send STK Push to Customer</div>
          <div style={styles.formGrid}>
            <div>
              <div style={styles.label}>Phone Number</div>
              <input
                style={styles.input}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0712345678"
              />
            </div>
            <div>
              <div style={styles.label}>Amount (KES)</div>
              <input
                style={styles.input}
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="500"
              />
            </div>
            <div>
              <div style={styles.label}>Reference (optional)</div>
              <input
                style={styles.input}
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="e.g. Invoice #001"
              />
            </div>
          </div>
          {stkMsg && (
            <div style={{
              ...styles.msg,
              background: stkMsg.startsWith('✅') ? '#E1F5EE' : '#FCEBEB',
              color: stkMsg.startsWith('✅') ? '#0F6E56' : '#A32D2D'
            }}>
              {stkMsg}
            </div>
          )}
          <button
            style={{ ...styles.btnPrimary, marginTop: '12px', opacity: sending ? 0.6 : 1 }}
            onClick={sendSTK}
            disabled={sending}
          >
            {sending ? 'Sending...' : '📲 Send Payment Request'}
          </button>
        </div>
      )}

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.lbl}>Today's M-Pesa</div>
          <div style={styles.val}>KES {todayRevenue.toLocaleString()}</div>
          <div style={styles.sub2}>{todayMpesa.length} transactions</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.lbl}>This Week</div>
          <div style={styles.val}>KES {weekRevenue.toLocaleString()}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.lbl}>All Time M-Pesa</div>
          <div style={styles.val}>KES {allMpesa.reduce((s, t) => s + (parseFloat(t.total_kes) || 0), 0).toLocaleString()}</div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>M-Pesa Transactions</div>
        {transactions.length === 0 ? (
          <p style={styles.empty}>No M-Pesa transactions found.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Drug</th>
                <th style={styles.th}>Patient</th>
                <th style={styles.th}>Amount (KES)</th>
                <th style={styles.th}>M-Pesa Code</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr key={i}>
                  <td style={styles.td}>{new Date(t.sold_at).toLocaleDateString('en-KE')}</td>
                  <td style={styles.td}>{t.drug_name}</td>
                  <td style={styles.td}>{t.patient_name || '—'}</td>
                  <td style={styles.td}>{parseFloat(t.total_kes).toLocaleString()}</td>
                  <td style={styles.td}>{t.mpesa_code || '—'}</td>
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
  page: { padding: '18px 22px' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111', margin: 0 },
  sub: { fontSize: '12px', color: '#888', margin: '4px 0 0' },
  badgeLive: { fontSize: '11px', color: '#1D9E75', background: '#E1F5EE', padding: '4px 10px', borderRadius: '99px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' },
  statCard: { background: '#fff', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e8ebe8' },
  lbl: { fontSize: '11px', color: '#888', marginBottom: '6px' },
  val: { fontSize: '22px', fontWeight: '600', color: '#111' },
  sub2: { fontSize: '11px', color: '#888', marginTop: '4px' },
  card: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '14px 16px', marginBottom: '14px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '12px' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' },
  label: { fontSize: '11px', color: '#888', marginBottom: '4px' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
  msg: { padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginTop: '10px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '7px 10px', color: '#888', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e8ebe8' },
  td: { padding: '9px 10px', borderBottom: '1px solid #f0f2f0', color: '#222' },
  empty: { color: '#999', textAlign: 'center', padding: '30px', fontSize: '13px' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' },
}