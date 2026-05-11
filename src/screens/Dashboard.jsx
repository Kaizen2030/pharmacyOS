import { useEffect, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'

function formatCurrency(amount) {
  return `KES ${Math.round(amount || 0).toLocaleString()}`
}

function getPercentageChange(current, previous) {
  if (!previous && !current) return 0
  if (!previous) return 100
  return ((current - previous) / previous) * 100
}

function getDaysToExpiry(expiryDate) {
  if (!expiryDate) return Number.POSITIVE_INFINITY
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate)
  expiry.setHours(0, 0, 0, 0)
  return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
}

export default function Dashboard() {
  const { pharmacyId } = usePharmacy()
  const [loading, setLoading] = useState(true)
  const [screenError, setScreenError] = useState('')
  const [todayRevenue, setTodayRevenue] = useState(0)
  const [todayTransactions, setTodayTransactions] = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [expiryAlerts, setExpiryAlerts] = useState(0)
  const [outstandingCredit, setOutstandingCredit] = useState(0)
  const [monthToDateRevenue, setMonthToDateRevenue] = useState(0)
  const [lastMonthRevenue, setLastMonthRevenue] = useState(0)
  const [recentSales, setRecentSales] = useState([])
  const [weeklyData, setWeeklyData] = useState([])
  const [topDrugs, setTopDrugs] = useState([])
  const [activeShift, setActiveShift] = useState(null)

  useEffect(() => {
    if (pharmacyId) fetchDashboardData()
  }, [pharmacyId])

  async function fetchDashboardData() {
    if (!pharmacyId) return

    setLoading(true)
    setScreenError('')

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
    sevenDaysAgo.setHours(0, 0, 0, 0)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()

    const [
      todaySalesResponse,
      weeklySalesResponse,
      topDrugsResponse,
      inventoryResponse,
      activeShiftResponse,
      creditResponse,
      monthSalesResponse,
      lastMonthSalesResponse,
    ] = await Promise.all([
      // Only select the sales fields needed for today cards and recent sales preview.
      supabase
        .from('sales_ledger')
        .select('id, drug_name, qty_sold, total_kes, payment_method, sold_at, cashier_name')
        .eq('pharmacy_id', pharmacyId)
        .gte('sold_at', today)
        .order('sold_at', { ascending: false }),
      supabase
        .from('sales_ledger')
        .select('sold_at, total_kes')
        .eq('pharmacy_id', pharmacyId)
        .gte('sold_at', sevenDaysAgo.toISOString()),
      supabase
        .from('sales_ledger')
        .select('drug_name, total_kes, qty_sold')
        .eq('pharmacy_id', pharmacyId)
        .gte('sold_at', sevenDaysAgo.toISOString()),
      supabase
        .from('inventory')
        .select('id, quantity, low_stock_threshold, expiry_date')
        .eq('pharmacy_id', pharmacyId),
      supabase
        .from('shifts')
        .select('*')
        .eq('pharmacy_id', pharmacyId)
        .eq('status', 'Open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('sales_ledger')
        .select('total_kes')
        .eq('pharmacy_id', pharmacyId)
        .ilike('payment_method', '%credit%'),
      supabase
        .from('sales_ledger')
        .select('total_kes')
        .eq('pharmacy_id', pharmacyId)
        .gte('sold_at', monthStart),
      supabase
        .from('sales_ledger')
        .select('total_kes')
        .eq('pharmacy_id', pharmacyId)
        .gte('sold_at', lastMonthStart)
        .lte('sold_at', lastMonthEnd),
    ])

    const firstError = [
      todaySalesResponse.error,
      weeklySalesResponse.error,
      topDrugsResponse.error,
      inventoryResponse.error,
      activeShiftResponse.error,
      creditResponse.error,
      monthSalesResponse.error,
      lastMonthSalesResponse.error,
    ].find(Boolean)

    if (firstError) {
      console.error('Dashboard load error:', firstError)
      setScreenError(firstError.message || 'Unable to load dashboard data.')
    }

    const todaySales = todaySalesResponse.data || []
    const weeklySales = weeklySalesResponse.data || []
    const topSales = topDrugsResponse.data || []
    const inventory = inventoryResponse.data || []
    const creditSales = creditResponse.data || []
    const currentMonthSales = monthSalesResponse.data || []
    const previousMonthSales = lastMonthSalesResponse.data || []

    setTodayRevenue(todaySales.reduce((sum, sale) => sum + (parseFloat(sale.total_kes) || 0), 0))
    setTodayTransactions(todaySales.length)
    setRecentSales(todaySales.slice(0, 6))

    const dayBuckets = {}
    for (let index = 6; index >= 0; index -= 1) {
      const date = new Date(now.getTime() - index * 24 * 60 * 60 * 1000)
      const key = date.toISOString().split('T')[0]
      dayBuckets[key] = {
        label: date.toLocaleDateString('en-KE', { weekday: 'short' }),
        total: 0,
      }
    }
    weeklySales.forEach(sale => {
      const key = sale.sold_at?.split('T')[0]
      if (dayBuckets[key]) {
        dayBuckets[key].total += parseFloat(sale.total_kes) || 0
      }
    })
    setWeeklyData(Object.values(dayBuckets))

    const topDrugTotals = topSales.reduce((summary, sale) => {
      if (!sale.drug_name) return summary
      if (!summary[sale.drug_name]) {
        summary[sale.drug_name] = { total: 0, units: 0 }
      }
      summary[sale.drug_name].total += parseFloat(sale.total_kes) || 0
      summary[sale.drug_name].units += parseInt(sale.qty_sold, 10) || 0
      return summary
    }, {})

    setTopDrugs(
      Object.entries(topDrugTotals)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((first, second) => second.total - first.total)
        .slice(0, 5)
    )

    setLowStockCount(
      inventory.filter(item => item.quantity <= (item.low_stock_threshold || 20)).length
    )
    setExpiryAlerts(
      inventory.filter(item => getDaysToExpiry(item.expiry_date) <= 30).length
    )
    setOutstandingCredit(
      creditSales.reduce((sum, sale) => sum + (parseFloat(sale.total_kes) || 0), 0)
    )
    setMonthToDateRevenue(
      currentMonthSales.reduce((sum, sale) => sum + (parseFloat(sale.total_kes) || 0), 0)
    )
    setLastMonthRevenue(
      previousMonthSales.reduce((sum, sale) => sum + (parseFloat(sale.total_kes) || 0), 0)
    )
    setActiveShift(activeShiftResponse.data || null)
    setLoading(false)
  }

  const maxWeekly = Math.max(...weeklyData.map(day => day.total), 1)
  const maxDrug = Math.max(...topDrugs.map(drug => drug.total), 1)
  const monthDelta = monthToDateRevenue - lastMonthRevenue
  const monthChangePct = getPercentageChange(monthToDateRevenue, lastMonthRevenue)
  const yAxisLabels = [1, 0.5, 0].map(multiplier => Math.round(maxWeekly * multiplier))

  if (loading) return <div style={styles.loading}>Loading dashboard...</div>

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <h2 style={styles.title}>Dashboard</h2>
          <p style={styles.subtitle}>Operational snapshot for today, this week, and this month.</p>
        </div>
        <span style={styles.date}>{new Date().toDateString()}</span>
      </div>

      {screenError && <div style={styles.errorBanner}>{screenError}</div>}

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.lbl}>Active Shift</div>
          <div style={{ ...styles.val, color: activeShift ? '#0F6E56' : '#B45309' }}>
            {activeShift ? 'Open' : 'Not Open'}
          </div>
          <div style={styles.sub}>
            {activeShift
              ? `${activeShift.cashier_name || 'Staff'} since ${new Date(activeShift.opened_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
              : 'Open a shift before heavy POS activity'}
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.lbl}>Today&apos;s Revenue</div>
          <div style={styles.val}>{formatCurrency(todayRevenue)}</div>
          <div style={styles.sub}>{todayTransactions} transaction(s) today</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.lbl}>Month To Date</div>
          <div style={styles.val}>{formatCurrency(monthToDateRevenue)}</div>
          <div style={{ ...styles.sub, color: monthDelta >= 0 ? '#0F6E56' : '#B91C1C' }}>
            {monthDelta >= 0 ? '+' : '-'}
            {formatCurrency(Math.abs(monthDelta))} vs last month ({monthChangePct.toFixed(1)}%)
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.lbl}>Outstanding Credit</div>
          <div style={{ ...styles.val, color: '#B91C1C' }}>{formatCurrency(outstandingCredit)}</div>
          <div style={styles.sub}>Unpaid credit sales still outstanding</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.lbl}>Expiry Alerts</div>
          <div style={{ ...styles.val, color: expiryAlerts > 0 ? '#B45309' : '#111' }}>{expiryAlerts}</div>
          <div style={styles.sub}>Items expiring within 30 days</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.lbl}>Low Stock</div>
          <div style={{ ...styles.val, color: lowStockCount > 0 ? '#B45309' : '#111' }}>{lowStockCount}</div>
          <div style={styles.sub}>Items at or below stock threshold</div>
        </div>
      </div>

      <div style={styles.row}>
        <div style={{ ...styles.card, flex: 2 }}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Revenue - Last 7 Days</div>
              <div style={styles.cardSub}>Daily totals with KES scale</div>
            </div>
            <div style={styles.cardBadge}>{formatCurrency(maxWeekly)} peak day</div>
          </div>

          <div style={styles.chartGrid}>
            <div style={styles.axisColumn}>
              {yAxisLabels.map(label => (
                <div key={label} style={styles.axisLabel}>{formatCurrency(label)}</div>
              ))}
            </div>
            <div style={styles.chartWrap}>
              {weeklyData.map(day => (
                <div key={day.label} style={styles.barCol}>
                  <div style={styles.barAmount}>{day.total > 0 ? formatCurrency(day.total) : ''}</div>
                  <div style={styles.barTrack}>
                    <div
                      style={{
                        ...styles.barFill,
                        height: day.total > 0 ? `${Math.max(4, Math.round((day.total / maxWeekly) * 100))}%` : '0%',
                      }}
                    />
                  </div>
                  <div style={styles.barLabel}>{day.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ ...styles.card, flex: 1 }}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Top 5 Drugs This Week</div>
              <div style={styles.cardSub}>Ranked by revenue contribution</div>
            </div>
          </div>

          {topDrugs.length === 0 ? (
            <p style={styles.empty}>No sales this week yet.</p>
          ) : (
            topDrugs.map((drug, index) => (
              <div key={drug.name} style={styles.drugRow}>
                <div style={styles.drugRank}>{index + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={styles.drugName}>{drug.name}</div>
                  <div style={styles.drugMeta}>{drug.units} unit(s)</div>
                  <div style={styles.drugBarWrap}>
                    <div
                      style={{
                        ...styles.drugBar,
                        width: `${Math.round((drug.total / maxDrug) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <div style={styles.drugAmt}>{formatCurrency(drug.total)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <div style={styles.cardTitle}>Recent Sales</div>
            <div style={styles.cardSub}>Latest transactions from today&apos;s activity</div>
          </div>
        </div>

        {recentSales.length === 0 ? (
          <p style={styles.empty}>No sales recorded today yet.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Time</th>
                <th style={styles.th}>Drug</th>
                <th style={styles.th}>Qty</th>
                <th style={styles.th}>Amount (KES)</th>
                <th style={styles.th}>Payment</th>
                <th style={styles.th}>Cashier</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.map(sale => (
                <tr key={sale.id}>
                  <td style={styles.td}>{new Date(sale.sold_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={styles.td}>{sale.drug_name}</td>
                  <td style={styles.td}>{sale.qty_sold}</td>
                  <td style={styles.td}>{formatCurrency(parseFloat(sale.total_kes || 0))}</td>
                  <td style={styles.td}>{sale.payment_method}</td>
                  <td style={styles.td}>{sale.cashier_name || sale.cashier_id || '-'}</td>
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
  page: { padding: '18px 22px', flex: 1, overflowY: 'auto' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111', margin: 0 },
  subtitle: { fontSize: '12px', color: '#888', marginTop: '4px' },
  date: { fontSize: '12px', color: '#888' },
  errorBanner: { background: '#FEF2F2', border: '1px solid #F8D7DA', borderRadius: '10px', padding: '12px 14px', color: '#B91C1C', fontSize: '13px', marginBottom: '14px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' },
  statCard: { background: '#fff', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e8ebe8' },
  lbl: { fontSize: '11px', color: '#888', marginBottom: '6px' },
  val: { fontSize: '22px', fontWeight: '700', color: '#111' },
  sub: { fontSize: '11px', color: '#666', marginTop: '4px', lineHeight: '1.5' },
  row: { display: 'flex', gap: '14px', marginBottom: '16px' },
  card: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '14px 16px' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111' },
  cardSub: { fontSize: '11px', color: '#6b7280', marginTop: '3px' },
  cardBadge: { fontSize: '11px', color: '#0F6E56', background: '#E1F5EE', borderRadius: '99px', padding: '4px 10px', fontWeight: '600' },
  chartGrid: { display: 'grid', gridTemplateColumns: '70px 1fr', gap: '10px', alignItems: 'stretch' },
  axisColumn: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '180px', paddingBottom: '18px' },
  axisLabel: { fontSize: '10px', color: '#888' },
  chartWrap: { display: 'flex', alignItems: 'flex-end', gap: '10px', height: '180px' },
  barCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' },
  barAmount: { fontSize: '9px', color: '#666', marginBottom: '6px', minHeight: '26px', textAlign: 'center' },
  barTrack: { flex: 1, width: '100%', background: '#f0f2f0', borderRadius: '6px', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', background: 'linear-gradient(180deg, #1D9E75 0%, #0F6E56 100%)', borderRadius: '6px 6px 0 0', transition: 'height .3s' },
  barLabel: { fontSize: '10px', color: '#888', marginTop: '8px' },
  drugRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
  drugRank: { width: '20px', height: '20px', borderRadius: '50%', background: '#E1F5EE', color: '#0F6E56', fontSize: '10px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  drugName: { fontSize: '12px', color: '#111', marginBottom: '2px' },
  drugMeta: { fontSize: '10px', color: '#6b7280', marginBottom: '5px' },
  drugBarWrap: { height: '5px', background: '#f0f2f0', borderRadius: '99px', overflow: 'hidden' },
  drugBar: { height: '100%', background: '#1D9E75', borderRadius: '99px' },
  drugAmt: { fontSize: '11px', color: '#666', flexShrink: 0 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '8px 10px', color: '#888', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e8ebe8' },
  td: { padding: '10px', borderBottom: '1px solid #f0f2f0', color: '#222' },
  empty: { color: '#999', textAlign: 'center', padding: '30px', fontSize: '13px' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' },
}
