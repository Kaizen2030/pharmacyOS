import { useEffect, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'

export default function Dashboard() {
  const { pharmacyId } = usePharmacy()
  const [revenue, setRevenue] = useState(0)
  const [transactions, setTransactions] = useState(0)
  const [lowStock, setLowStock] = useState(0)
  const [recentSales, setRecentSales] = useState([])
  const [weeklyData, setWeeklyData] = useState([])
  const [topDrugs, setTopDrugs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (pharmacyId) fetchDashboardData()
  }, [pharmacyId])

  async function fetchDashboardData() {
    const today = new Date().toISOString().split('T')[0]
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: sales } = await supabase
      .from('sales_ledger')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .gte('sold_at', today)

    if (sales) {
      const total = sales.reduce((sum, s) => sum + (parseFloat(s.total_kes) || 0), 0)
      setRevenue(total)
      setTransactions(sales.length)
      setRecentSales(sales.slice(-5).reverse())
    }

    const { data: weekly } = await supabase
      .from('sales_ledger')
      .select('sold_at, total_kes')
      .eq('pharmacy_id', pharmacyId)
      .gte('sold_at', sevenDaysAgo)

    if (weekly) {
      const days = {}
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        const key = d.toISOString().split('T')[0]
        days[key] = { label: d.toLocaleDateString('en-KE', { weekday: 'short' }), total: 0 }
      }
      weekly.forEach(s => {
        const key = s.sold_at?.split('T')[0]
        if (days[key]) days[key].total += parseFloat(s.total_kes) || 0
      })
      setWeeklyData(Object.values(days))
    }

    const { data: allSales } = await supabase
      .from('sales_ledger')
      .select('drug_name, total_kes')
      .eq('pharmacy_id', pharmacyId)
      .gte('sold_at', sevenDaysAgo)

    if (allSales) {
      const drugTotals = {}
      allSales.forEach(s => {
        if (!s.drug_name) return
        drugTotals[s.drug_name] = (drugTotals[s.drug_name] || 0) + (parseFloat(s.total_kes) || 0)
      })
      const sorted = Object.entries(drugTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
      setTopDrugs(sorted)
    }

    const { data: drugs } = await supabase
      .from('inventory')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .lt('quantity', 20)

    if (drugs) setLowStock(drugs.length)
    setLoading(false)
  }

  const maxWeekly = Math.max(...weeklyData.map(d => d.total), 1)
  const maxDrug = Math.max(...topDrugs.map(d => d[1]), 1)

  if (loading) return <div style={styles.loading}>Loading dashboard...</div>

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <h2 style={styles.title}>Dashboard</h2>
        <span style={styles.date}>{new Date().toDateString()}</span>
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.lbl}>Today's Revenue</div>
          <div style={styles.val}>KES {revenue.toLocaleString()}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.lbl}>Transactions Today</div>
          <div style={styles.val}>{transactions}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.lbl}>Low Stock Items</div>
          <div style={{ ...styles.val, color: '#E09B00' }}>{lowStock}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.lbl}>7-day Sales Days</div>
          <div style={styles.val}>{weeklyData.filter(d => d.total > 0).length}</div>
        </div>
      </div>

      <div style={styles.row2}>
        <div style={{ ...styles.card, flex: 2 }}>
          <div style={styles.cardTitle}>Revenue — last 7 days</div>
          <div style={styles.chartWrap}>
            {weeklyData.map((d, i) => (
              <div key={i} style={styles.barCol}>
                <div style={styles.barAmount}>
                  {d.total > 0 ? `${(d.total / 1000).toFixed(1)}k` : ''}
                </div>
                <div style={styles.barTrack}>
                  <div style={{
                    ...styles.barFill,
                    height: `${Math.round((d.total / maxWeekly) * 100)}%`
                  }} />
                </div>
                <div style={styles.barLabel}>{d.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...styles.card, flex: 1 }}>
          <div style={styles.cardTitle}>Top 5 drugs this week</div>
          {topDrugs.length === 0 ? (
            <p style={styles.empty}>No sales this week yet.</p>
          ) : (
            topDrugs.map(([name, total], i) => (
              <div key={i} style={styles.drugRow}>
                <div style={styles.drugRank}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={styles.drugName}>{name}</div>
                  <div style={styles.drugBarWrap}>
                    <div style={{
                      ...styles.drugBar,
                      width: `${Math.round((total / maxDrug) * 100)}%`
                    }} />
                  </div>
                </div>
                <div style={styles.drugAmt}>KES {total.toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>Recent sales</div>
        {recentSales.length === 0 ? (
          <p style={styles.empty}>No sales recorded today yet.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Drug</th>
                <th style={styles.th}>Qty</th>
                <th style={styles.th}>Amount (KES)</th>
                <th style={styles.th}>Payment</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.map((sale, i) => (
                <tr key={i}>
                  <td style={styles.td}>{sale.drug_name}</td>
                  <td style={styles.td}>{sale.qty_sold}</td>
                  <td style={styles.td}>{parseFloat(sale.total_kes).toLocaleString()}</td>
                  <td style={styles.td}>{sale.payment_method}</td>
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
  title: { fontSize: '15px', fontWeight: '600', color: '#111', margin: 0 },
  date: { fontSize: '12px', color: '#888' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' },
  statCard: { background: '#fff', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e8ebe8' },
  lbl: { fontSize: '11px', color: '#888', marginBottom: '6px' },
  val: { fontSize: '22px', fontWeight: '600', color: '#111' },
  row2: { display: 'flex', gap: '14px', marginBottom: '16px' },
  card: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '12px' },
  chartWrap: { display: 'flex', alignItems: 'flex-end', gap: '8px', height: '140px' },
  barCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' },
  barAmount: { fontSize: '9px', color: '#888', marginBottom: '4px', height: '14px' },
  barTrack: { flex: 1, width: '100%', background: '#f0f2f0', borderRadius: '4px', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', background: '#0F6E56', borderRadius: '4px', minHeight: '2px', transition: 'height .3s' },
  barLabel: { fontSize: '10px', color: '#888', marginTop: '6px' },
  drugRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' },
  drugRank: { width: '18px', height: '18px', borderRadius: '50%', background: '#E1F5EE', color: '#0F6E56', fontSize: '10px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  drugName: { fontSize: '12px', color: '#111', marginBottom: '3px' },
  drugBarWrap: { height: '4px', background: '#f0f2f0', borderRadius: '2px', overflow: 'hidden' },
  drugBar: { height: '100%', background: '#1D9E75', borderRadius: '2px' },
  drugAmt: { fontSize: '11px', color: '#888', flexShrink: 0 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '7px 10px', color: '#888', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e8ebe8' },
  td: { padding: '9px 10px', borderBottom: '1px solid #f0f2f0', color: '#222' },
  empty: { color: '#999', textAlign: 'center', padding: '30px', fontSize: '13px' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' },
}