import { useEffect, useState } from 'react'
import { usePharmacy } from '../context'
import supabase from '../supabase'

export default function Reports() {
  const { pharmacyId, isOwner } = usePharmacy()
  const canEdit = isOwner

  const [sales, setSales] = useState([])
  const [controlledDrugs, setControlledDrugs] = useState([])
  const [activeTab, setActiveTab] = useState('ppb')
  const [timeFilter, setTimeFilter] = useState('month')

  useEffect(() => {
    if (pharmacyId) {
      fetchSales()
      fetchControlledDrugs()
    }
  }, [pharmacyId, timeFilter])

  async function fetchSales() {
    let query = supabase
      .from('sales_ledger')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .order('sold_at', { ascending: false })

    const now = new Date()
    if (timeFilter === 'today') {
      const today = now.toISOString().split('T')[0]
      query = query.gte('sold_at', today)
    } else if (timeFilter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte('sold_at', weekAgo)
    } else if (timeFilter === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      query = query.gte('sold_at', monthStart)
    } else if (timeFilter === 'lastMonth') {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0] + 'T23:59:59'
      query = query.gte('sold_at', lastMonthStart).lte('sold_at', lastMonthEnd)
    }

    const { data } = await query
    setSales(data || [])
  }

  async function fetchControlledDrugs() {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .eq('is_controlled', true)
      .order('drug_name')
    setControlledDrugs(data || [])
  }

  const totalRevenue = sales.reduce((sum, s) => sum + (parseFloat(s.total_kes) || 0), 0)

  // Green bars for Sales Report
  const byDay = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => {
    const dayTotal = sales
      .filter(s => new Date(s.sold_at).toLocaleDateString('en-US', {weekday: 'short'}) === day)
      .reduce((sum, s) => sum + (parseFloat(s.total_kes) || 0), 0)
    return { day, total: dayTotal }
  })

  const maxDay = Math.max(...byDay.map(d => d.total), 1)

  // Top Drugs
  const topDrugs = Object.entries(
    sales.reduce((acc, s) => {
      acc[s.drug_name] = (acc[s.drug_name] || 0) + (parseInt(s.qty_sold) || 0)
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 8)

  const maxUnits = Math.max(...topDrugs.map(d => d[1]), 1)

  // PPB Report - Real data
  const ppbReport = controlledDrugs.map(drug => {
    const dispensed = sales
      .filter(s => s.drug_name === drug.drug_name)
      .reduce((sum, s) => sum + (parseInt(s.qty_sold) || 0), 0)

    return {
      ...drug,
      dispensed,
      openingStock: (drug.quantity || 0) + dispensed,
      closingStock: drug.quantity || 0
    }
  })

  function exportPPBCSV() {
    const headers = ['Drug Name','Drug Code','PPB Category','Opening Stock','Dispensed','Closing Stock']
    const rows = ppbReport.map(item => [
      item.drug_name,
      item.drug_code || '',
      item.ppb_category || '',
      item.openingStock,
      item.dispensed,
      item.closingStock
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `PPB_Controlled_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <h2 style={styles.title}>Reports & Analytics</h2>
        <div style={styles.filters}>
          {['today','week','month','lastMonth','year','all'].map(f => (
            <button 
              key={f} 
              onClick={() => setTimeFilter(f)}
              style={{...styles.filterBtn, ...(timeFilter === f ? styles.filterActive : {})}}
            >
              {f === 'lastMonth' ? 'Last Month' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.tabs}>
        {['sales','top','monthly','ppb'].map(t => (
          <button 
            key={t} 
            onClick={() => setActiveTab(t)}
            style={{...styles.tab, ...(activeTab === t ? styles.tabActive : {})}}
          >
            {t === 'sales' ? 'Sales Report' : 
             t === 'top' ? 'Top Drugs' : 
             t === 'monthly' ? 'Monthly Summary' : 'PPB Report'}
          </button>
        ))}
      </div>

      {/* Sales Report - Green Bars */}
      {activeTab === 'sales' && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardTitle}>Revenue this period — KES {totalRevenue.toLocaleString()}</div>
          </div>
          {byDay.map(d => (
            <div key={d.day} style={styles.barRow}>
              <div style={styles.barLabel}>{d.day}</div>
              <div style={styles.barTrack}>
                <div style={{...styles.barFill, width: `${(d.total / maxDay) * 100}%`}} />
              </div>
              <div style={styles.barVal}>KES {d.total.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {/* Top Drugs */}
      {activeTab === 'top' && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Top selling drugs (this period)</div>
          {topDrugs.length > 0 ? topDrugs.map(([name, units]) => (
            <div key={name} style={styles.barRow}>
              <div style={{...styles.barLabel, width: '140px', fontSize: '11px'}}>{name}</div>
              <div style={styles.barTrack}>
                <div style={{...styles.barFill, width: `${(units / maxUnits) * 100}%`}} />
              </div>
              <div style={styles.barVal}>{units} units</div>
            </div>
          )) : <p style={{color: '#888', textAlign: 'center', padding: '40px'}}>No sales in selected period.</p>}
        </div>
      )}

      {/* Monthly Summary */}
      {activeTab === 'monthly' && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Monthly revenue summary</div>
          <p style={{color: '#888', textAlign: 'center', padding: '40px'}}>No sales in selected period.</p>
        </div>
      )}

      {/* PPB Report - Real Controlled Drugs */}
      {activeTab === 'ppb' && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>PPB Narcotics & Controlled Substances Report</div>
              <p style={{fontSize:'12px', color:'#666'}}>Controlled drugs only • Dispensed in selected period</p>
            </div>
            {canEdit ? (
              <button onClick={exportPPBCSV} style={styles.btnPrimary}>Download PPB CSV</button>
            ) : (
              <div style={styles.adminNotice}>CSV export restricted to pharmacy owner.</div>
            )}
          </div>

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Drug</th>
                <th style={styles.th}>Code</th>
                <th style={styles.th}>Category</th>
                <th style={styles.th}>Opening Stock</th>
                <th style={styles.th}>Dispensed</th>
                <th style={styles.th}>Closing Stock</th>
              </tr>
            </thead>
            <tbody>
              {ppbReport.length > 0 ? ppbReport.map((item, i) => (
                <tr key={i}>
                  <td style={styles.td}>{item.drug_name}</td>
                  <td style={styles.td}>{item.drug_code || '—'}</td>
                  <td style={styles.td}>{item.ppb_category || '—'}</td>
                  <td style={styles.td}>{item.openingStock}</td>
                  <td style={styles.td}><strong>{item.dispensed}</strong></td>
                  <td style={styles.td}>{item.closingStock}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" style={{textAlign:'center', padding:'40px', color:'#888'}}>
                    No controlled drugs found.<br/>Add drugs in Inventory and tick "Controlled Substance"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { padding: '18px 22px', flex: 1, overflowY: 'auto', background: '#f8f9f8' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111' },
  filters: { display: 'flex', gap: '6px' },
  filterBtn: { padding: '6px 14px', border: '1px solid #ddd', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', background: '#fff' },
  filterActive: { background: '#0F6E56', color: '#fff', borderColor: '#0F6E56' },
  tabs: { display: 'flex', gap: '0', marginBottom: '14px', background: '#fff', borderRadius: '8px', border: '1px solid #e8ebe8', overflow: 'hidden' },
  tab: { flex: 1, padding: '10px', border: 'none', background: 'none', fontSize: '12px', cursor: 'pointer', color: '#555' },
  tabActive: { background: '#0F6E56', color: '#fff', fontWeight: '600' },
  card: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '16px' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111' },
  barRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' },
  barLabel: { width: '35px', fontSize: '12px', color: '#666' },
  barTrack: { flex: 1, height: '10px', background: '#f0f2f0', borderRadius: '99px', overflow: 'hidden' },
  barFill: { height: '100%', background: '#0F6E56', borderRadius: '99px' },
  barVal: { width: '70px', fontSize: '11px', color: '#666', textAlign: 'right' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' },
  th: { textAlign: 'left', padding: '10px 12px', color: '#666', fontWeight: '600', borderBottom: '1px solid #eee', background: '#f9f9f9' },
  td: { padding: '11px 12px', borderBottom: '1px solid #f4f4f4', color: '#222' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }
}