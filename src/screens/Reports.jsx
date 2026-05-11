import { useEffect, useMemo, useState } from 'react'
import { usePharmacy } from '../context'
import supabase from '../supabase'
import { downloadCSV } from '../utils/csv'

function formatCurrency(amount) {
  return `KES ${Math.round(amount || 0).toLocaleString()}`
}

export default function Reports() {
  const { pharmacyId, isOwner, userRole } = usePharmacy()
  const canExport = isOwner
  const canViewSlowMovers = ['Administrator', 'HR'].includes(userRole)
  const [sales, setSales] = useState([])
  const [salesHistory, setSalesHistory] = useState([])
  const [inventory, setInventory] = useState([])
  const [salesPage, setSalesPage] = useState(0)
  const [salesCount, setSalesCount] = useState(0)
  const [loadingMoreSales, setLoadingMoreSales] = useState(false)
  const [activeTab, setActiveTab] = useState('sales')
  const [timeFilter, setTimeFilter] = useState('month')
  const [loading, setLoading] = useState(true)
  const [screenError, setScreenError] = useState('')

  useEffect(() => {
    if (pharmacyId) {
      fetchReportsData()
    }
  }, [pharmacyId, timeFilter])

  const tabs = useMemo(() => {
    const baseTabs = [
      { id: 'sales', label: 'Sales Report' },
      { id: 'top', label: 'Top Drugs' },
      { id: 'profit', label: 'Profit & Margin' },
      { id: 'staff', label: 'Staff Performance' },
      { id: 'monthly', label: 'Monthly Summary' },
      { id: 'ppb', label: 'PPB Report' },
    ]

    if (canViewSlowMovers) {
      baseTabs.push({ id: 'slow', label: 'Slow Movers' })
    }

    return baseTabs
  }, [canViewSlowMovers])

  useEffect(() => {
    if (!tabs.some(tab => tab.id === activeTab)) {
      setActiveTab('sales')
    }
  }, [activeTab, tabs])

  function buildSalesQuery(timeFilterValue) {
    const now = new Date()
    let query = supabase
      .from('sales_ledger')
      .select('*', { count: 'exact' })
      .eq('pharmacy_id', pharmacyId)
      .order('sold_at', { ascending: false })

    if (timeFilterValue === 'today') {
      const today = now.toISOString().split('T')[0]
      query = query.gte('sold_at', today)
    } else if (timeFilterValue === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte('sold_at', weekAgo)
    } else if (timeFilterValue === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      query = query.gte('sold_at', monthStart)
    } else if (timeFilterValue === 'lastMonth') {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()
      query = query.gte('sold_at', lastMonthStart).lte('sold_at', lastMonthEnd)
    } else if (timeFilterValue === 'year') {
      const yearStart = new Date(now.getFullYear(), 0, 1).toISOString()
      query = query.gte('sold_at', yearStart)
    }

    return query
  }

  async function fetchSalesPage(page = 0, append = false) {
    if (!pharmacyId) return

    setLoadingMoreSales(true)
    const rangeStart = page * 500
    const rangeEnd = rangeStart + 499
    const { data, count, error } = await buildSalesQuery(timeFilter).range(rangeStart, rangeEnd)

    if (error) {
      console.error('Failed to load paginated sales rows:', error)
      setScreenError(error.message || 'Unable to load sales rows.')
      setLoadingMoreSales(false)
      return
    }

    setSales(prev => append ? [...prev, ...(data || [])] : (data || []))
    setSalesCount(count || 0)
    setSalesPage(page)
    setLoadingMoreSales(false)
  }

  async function fetchReportsData() {
    if (!pharmacyId) return

    setLoading(true)
    setScreenError('')

    const [
      { data: salesHistoryData, error: salesHistoryError },
      { data: inventoryData, error: inventoryError },
    ] = await Promise.all([
      supabase
        .from('sales_ledger')
        .select('drug_name, sold_at')
        .eq('pharmacy_id', pharmacyId)
        .not('drug_name', 'is', null),
      supabase
        .from('inventory')
        .select('*')
        .eq('pharmacy_id', pharmacyId)
        .order('drug_name'),
    ])

    if (salesHistoryError || inventoryError) {
      const message = salesHistoryError?.message || inventoryError?.message || 'Unable to load reports.'
      console.error('Reports load error:', salesHistoryError || inventoryError)
      setScreenError(message)
    }

    setSalesHistory(salesHistoryData || [])
    setInventory(inventoryData || [])

    await fetchSalesPage(0, false)
    setLoading(false)
  }

  function loadMoreSales() {
    if (loadingMoreSales) return
    if (sales.length >= salesCount) return
    fetchSalesPage(salesPage + 1, true)
  }

  const totalRevenue = useMemo(
    () => sales.reduce((sum, sale) => sum + (parseFloat(sale.total_kes) || 0), 0),
    [sales]
  )
  const averageSale = sales.length > 0 ? totalRevenue / sales.length : 0

  const byDay = useMemo(() => {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    return labels.map(day => {
      const dayTotal = sales
        .filter(sale => new Date(sale.sold_at).toLocaleDateString('en-US', { weekday: 'short' }) === day)
        .reduce((sum, sale) => sum + (parseFloat(sale.total_kes) || 0), 0)
      return { day, total: dayTotal }
    })
  }, [sales])

  const paymentBreakdown = useMemo(() => {
    return Object.entries(
      sales.reduce((summary, sale) => {
        const key = sale.payment_method || 'Unknown'
        summary[key] = (summary[key] || 0) + (parseFloat(sale.total_kes) || 0)
        return summary
      }, {})
    )
      .map(([method, total]) => ({ method, total }))
      .sort((first, second) => second.total - first.total)
  }, [sales])

  const drugPerformance = useMemo(() => {
    return Object.entries(
      sales.reduce((summary, sale) => {
        if (!sale.drug_name) return summary
        if (!summary[sale.drug_name]) summary[sale.drug_name] = { units: 0, revenue: 0 }
        summary[sale.drug_name].units += parseInt(sale.qty_sold, 10) || 0
        summary[sale.drug_name].revenue += parseFloat(sale.total_kes) || 0
        return summary
      }, {})
    )
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((first, second) => second.revenue - first.revenue)
  }, [sales])

  const topDrugs = useMemo(() => {
    return drugPerformance
      .slice()
      .sort((first, second) => second.units - first.units)
      .slice(0, 8)
  }, [drugPerformance])

  const controlledDrugs = useMemo(() => {
    return inventory.filter(drug => drug.is_controlled)
  }, [inventory])

  const profitAnalysis = useMemo(() => {
    const costMap = Object.fromEntries(
      inventory.map(drug => [
        drug.drug_name,
        {
          unitCost: parseFloat(drug.cost_price_kes) || 0,
          unitPrice: parseFloat(drug.price_kes) || 0,
        },
      ])
    )

    return drugPerformance
      .map(drug => {
        const pricing = costMap[drug.name] || { unitCost: 0, unitPrice: 0 }
        const estimatedCost = pricing.unitCost * drug.units
        const profit = drug.revenue - estimatedCost
        return {
          ...drug,
          unitCost: pricing.unitCost,
          unitPrice: pricing.unitPrice,
          estimatedCost,
          profit,
          margin: drug.revenue > 0 ? (profit / drug.revenue) * 100 : 0,
        }
      })
      .sort((first, second) => second.profit - first.profit)
  }, [drugPerformance, inventory])

  const staffPerformance = useMemo(() => {
    return Object.values(
      sales.reduce((summary, sale) => {
        const name = sale.cashier_name || sale.cashier_id || 'Unknown'
        if (!summary[name]) {
          summary[name] = {
            name,
            transactions: 0,
            units: 0,
            revenue: 0,
            lastSale: '',
          }
        }
        summary[name].transactions += 1
        summary[name].units += parseInt(sale.qty_sold, 10) || 0
        summary[name].revenue += parseFloat(sale.total_kes) || 0
        if (sale.sold_at && (!summary[name].lastSale || new Date(sale.sold_at) > new Date(summary[name].lastSale))) {
          summary[name].lastSale = sale.sold_at
        }
        return summary
      }, {})
    )
      .map(staff => ({
        ...staff,
        averageSale: staff.transactions > 0 ? staff.revenue / staff.transactions : 0,
      }))
      .sort((first, second) => second.revenue - first.revenue)
  }, [sales])

  const monthlySummary = useMemo(() => {
    const grouped = sales.reduce((summary, sale) => {
      const date = new Date(sale.sold_at)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      if (!summary[key]) {
        summary[key] = { key, label: date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }), transactions: 0, revenue: 0 }
      }
      summary[key].transactions += 1
      summary[key].revenue += parseFloat(sale.total_kes) || 0
      return summary
    }, {})

    return Object.values(grouped).sort((first, second) => first.key.localeCompare(second.key))
  }, [sales])

  const ppbReport = useMemo(() => {
    return controlledDrugs.map(drug => {
      const dispensed = sales
        .filter(sale => sale.drug_name === drug.drug_name)
        .reduce((sum, sale) => sum + (parseInt(sale.qty_sold, 10) || 0), 0)

      return {
        ...drug,
        dispensed,
        openingStock: (drug.quantity || 0) + dispensed,
        closingStock: drug.quantity || 0,
      }
    })
  }, [controlledDrugs, sales])

  const slowMovers = useMemo(() => {
    const unitsSoldByDrug = sales.reduce((summary, sale) => {
      const drugName = sale.drug_name
      if (!drugName) return summary
      summary[drugName] = (summary[drugName] || 0) + (parseInt(sale.qty_sold, 10) || 0)
      return summary
    }, {})

    const lastSaleByDrug = salesHistory.reduce((summary, sale) => {
      const drugName = sale.drug_name
      if (!drugName || !sale.sold_at) return summary
      const soldAt = sale.sold_at
      if (!summary[drugName] || new Date(soldAt) > new Date(summary[drugName])) {
        summary[drugName] = soldAt
      }
      return summary
    }, {})

    return inventory
      .map(item => {
        const lowStockThreshold = parseFloat(item.low_stock_threshold) || 20
        const unitsSold = unitsSoldByDrug[item.drug_name] || 0
        const lastSaleDate = lastSaleByDrug[item.drug_name]

        return {
          id: item.id,
          drugName: item.drug_name,
          category: item.category || '-',
          currentStock: parseInt(item.quantity, 10) || 0,
          unitsSold,
          lowStockThreshold,
          lastSaleDate: lastSaleDate ? new Date(lastSaleDate).toLocaleDateString('en-GB') : 'No sales',
          supplierName: item.supplier_name || '-',
        }
      })
      .filter(item => item.unitsSold === 0 || item.unitsSold < (item.lowStockThreshold * 0.2))
      .sort((first, second) => {
        if (first.unitsSold === 0 && second.unitsSold !== 0) return -1
        if (first.unitsSold !== 0 && second.unitsSold === 0) return 1
        if (first.unitsSold !== second.unitsSold) return first.unitsSold - second.unitsSold
        return first.drugName.localeCompare(second.drugName)
      })
  }, [inventory, sales, salesHistory])

  const maxDay = Math.max(...byDay.map(day => day.total), 1)
  const maxUnits = Math.max(...topDrugs.map(drug => drug.units), 1)
  const maxProfit = Math.max(...profitAnalysis.map(drug => Math.abs(drug.profit)), 1)
  const maxStaffRevenue = Math.max(...staffPerformance.map(staff => staff.revenue), 1)

  function exportSalesCSV() {
    downloadCSV(
      ['Date', 'Drug', 'Quantity', 'Amount (KES)', 'Payment Method', 'Cashier', 'Customer'],
      sales.map(sale => [
        sale.sold_at ? new Date(sale.sold_at).toLocaleString('en-GB') : '',
        sale.drug_name || '',
        sale.qty_sold || 0,
        sale.total_kes || 0,
        sale.payment_method || '',
        sale.cashier_name || sale.cashier_id || '',
        sale.customer_name || '',
      ]),
      `sales_report_${timeFilter}_${new Date().toISOString().split('T')[0]}.csv`
    )
  }

  function exportTopDrugsCSV() {
    downloadCSV(
      ['Drug Name', 'Units Sold', 'Revenue (KES)'],
      topDrugs.map(drug => [drug.name, drug.units, drug.revenue]),
      `top_drugs_${timeFilter}_${new Date().toISOString().split('T')[0]}.csv`
    )
  }

  function exportMonthlySummaryCSV() {
    downloadCSV(
      ['Period', 'Transactions', 'Revenue (KES)', 'Average Sale (KES)'],
      monthlySummary.map(row => [
        row.label,
        row.transactions,
        row.revenue,
        row.transactions > 0 ? (row.revenue / row.transactions).toFixed(2) : 0,
      ]),
      `monthly_summary_${timeFilter}_${new Date().toISOString().split('T')[0]}.csv`
    )
  }

  function exportPPBCSV() {
    downloadCSV(
      ['Drug Name', 'Drug Code', 'PPB Category', 'Opening Stock', 'Dispensed', 'Closing Stock'],
      ppbReport.map(item => [
        item.drug_name,
        item.drug_code || '',
        item.ppb_category || '',
        item.openingStock,
        item.dispensed,
        item.closingStock,
      ]),
      `ppb_controlled_${new Date().toISOString().split('T')[0]}.csv`
    )
  }

  function exportProfitCSV() {
    downloadCSV(
      ['Drug Name', 'Units Sold', 'Revenue (KES)', 'Estimated Cost (KES)', 'Profit (KES)', 'Margin (%)', 'Cost Price (KES)', 'Selling Price (KES)'],
      profitAnalysis.map(item => [
        item.name,
        item.units,
        item.revenue,
        item.estimatedCost,
        item.profit,
        item.margin.toFixed(1),
        item.unitCost,
        item.unitPrice,
      ]),
      `profit_margin_${timeFilter}_${new Date().toISOString().split('T')[0]}.csv`
    )
  }

  function exportStaffCSV() {
    downloadCSV(
      ['Staff', 'Sales Rows', 'Units Sold', 'Revenue (KES)', 'Average Sale (KES)', 'Last Sale'],
      staffPerformance.map(staff => [
        staff.name,
        staff.transactions,
        staff.units,
        staff.revenue,
        staff.averageSale.toFixed(2),
        staff.lastSale ? new Date(staff.lastSale).toLocaleString('en-GB') : '',
      ]),
      `staff_performance_${timeFilter}_${new Date().toISOString().split('T')[0]}.csv`
    )
  }

  function exportSlowMoversCSV() {
    downloadCSV(
      ['Drug Name', 'Category', 'Current Stock', 'Units Sold in Period', 'Last Sale Date', 'Supplier Name'],
      slowMovers.map(item => [
        item.drugName,
        item.category,
        item.currentStock,
        item.unitsSold,
        item.lastSaleDate,
        item.supplierName,
      ]),
      `slow_movers_${timeFilter}_${new Date().toISOString().split('T')[0]}.csv`
    )
  }

  function exportCurrentTab() {
    if (activeTab === 'sales') exportSalesCSV()
    if (activeTab === 'top') exportTopDrugsCSV()
    if (activeTab === 'monthly') exportMonthlySummaryCSV()
    if (activeTab === 'ppb') exportPPBCSV()
    if (activeTab === 'profit') exportProfitCSV()
    if (activeTab === 'staff') exportStaffCSV()
    if (activeTab === 'slow') exportSlowMoversCSV()
  }

  if (loading) return <div style={styles.loading}>Loading reports...</div>

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <h2 style={styles.title}>Reports & Analytics</h2>
          <p style={styles.subtitle}>Owner-focused summaries using current pharmacy sales and controlled-drug activity.</p>
        </div>
        <div style={styles.toolbar}>
          {['today', 'week', 'month', 'lastMonth', 'year', 'all'].map(filter => (
            <button
              key={filter}
              onClick={() => setTimeFilter(filter)}
              style={{ ...styles.filterBtn, ...(timeFilter === filter ? styles.filterActive : {}) }}
            >
              {filter === 'lastMonth' ? 'Last Month' : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {screenError && <div style={styles.errorBanner}>{screenError}</div>}

      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Revenue</div>
          <div style={styles.summaryValue}>{formatCurrency(totalRevenue)}</div>
          <div style={styles.summaryNote}>For the selected period</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Transactions</div>
          <div style={styles.summaryValue}>{sales.length}</div>
          <div style={styles.summaryNote}>Completed sales entries</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Average Sale</div>
          <div style={styles.summaryValue}>{formatCurrency(averageSale)}</div>
          <div style={styles.summaryNote}>Revenue per transaction</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Largest Payment Type</div>
          <div style={styles.summaryValueSmall}>{paymentBreakdown[0]?.method || 'None'}</div>
          <div style={styles.summaryNote}>{formatCurrency(paymentBreakdown[0]?.total || 0)}</div>
        </div>
      </div>

      <div style={styles.tabs}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{ ...styles.tab, ...(activeTab === tab.id ? styles.tabActive : {}) }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <div style={styles.cardTitle}>
              {activeTab === 'sales' && 'Sales Report'}
              {activeTab === 'top' && 'Top Selling Drugs'}
              {activeTab === 'profit' && 'Profit & Margin'}
              {activeTab === 'staff' && 'Staff Performance'}
              {activeTab === 'monthly' && 'Monthly Summary'}
              {activeTab === 'ppb' && 'PPB Controlled Drugs Report'}
              {activeTab === 'slow' && 'Slow Movers'}
            </div>
            <p style={styles.cardNote}>
              {activeTab === 'sales' && 'Read revenue by weekday and download the transaction list.'}
              {activeTab === 'top' && 'See which medicines are driving units and revenue.'}
              {activeTab === 'profit' && 'Compare revenue against estimated inventory cost to spot your strongest earners.'}
              {activeTab === 'staff' && 'See who is serving the most customers and generating the most revenue.'}
              {activeTab === 'monthly' && 'Compare grouped totals and average sale size.'}
              {activeTab === 'ppb' && 'Controlled-drug movement for PPB compliance.'}
              {activeTab === 'slow' && 'Spot items with no movement or very weak sales against their low-stock threshold.'}
            </p>
          </div>
          {canExport ? (
            <button onClick={exportCurrentTab} style={styles.btnPrimary}>Export CSV</button>
          ) : (
            <div style={styles.adminNotice}>CSV export restricted to the pharmacy owner.</div>
          )}
        </div>

        {activeTab === 'sales' && (
          <>
            {byDay.map(day => (
              <div key={day.day} style={styles.barRow}>
                <div style={styles.barLabel}>{day.day}</div>
                <div style={styles.barTrack}>
                  <div style={{ ...styles.barFill, width: `${(day.total / maxDay) * 100}%` }} />
                </div>
                <div style={styles.barVal}>{formatCurrency(day.total)}</div>
              </div>
            ))}

            <div style={styles.sectionTitle}>Payment Mix</div>
            {paymentBreakdown.length === 0 ? (
              <p style={styles.empty}>No sales in the selected period.</p>
            ) : (
              paymentBreakdown.map(row => (
                <div key={row.method} style={styles.barRow}>
                  <div style={{ ...styles.barLabel, width: '140px' }}>{row.method}</div>
                  <div style={styles.barTrack}>
                    <div style={{ ...styles.barFill, width: `${totalRevenue > 0 ? (row.total / totalRevenue) * 100 : 0}%` }} />
                  </div>
                  <div style={styles.barVal}>{formatCurrency(row.total)}</div>
                </div>
              ))
            )}
          </>
        )}

        {activeTab === 'top' && (
          <>
            {topDrugs.length > 0 ? topDrugs.map(drug => (
              <div key={drug.name} style={styles.barRow}>
                <div style={{ ...styles.barLabel, width: '180px', fontSize: '11px' }}>{drug.name}</div>
                <div style={styles.barTrack}>
                  <div style={{ ...styles.barFill, width: `${(drug.units / maxUnits) * 100}%` }} />
                </div>
                <div style={styles.barVal}>{drug.units} units</div>
              </div>
            )) : <p style={styles.empty}>No sales in selected period.</p>}

            {topDrugs.length > 0 && (
              <table style={{ ...styles.table, marginTop: '18px' }}>
                <thead>
                  <tr>
                    <th style={styles.th}>Drug</th>
                    <th style={styles.th}>Units Sold</th>
                    <th style={styles.th}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topDrugs.map(drug => (
                    <tr key={drug.name}>
                      <td style={styles.td}>{drug.name}</td>
                      <td style={styles.td}>{drug.units}</td>
                      <td style={styles.td}>{formatCurrency(drug.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {activeTab === 'profit' && (
          <>
            {profitAnalysis.length > 0 ? profitAnalysis.slice(0, 8).map(drug => (
              <div key={drug.name} style={styles.barRow}>
                <div style={{ ...styles.barLabel, width: '180px', fontSize: '11px' }}>{drug.name}</div>
                <div style={styles.barTrack}>
                  <div
                    style={{
                      ...styles.barFill,
                      background: drug.profit >= 0 ? '#0F6E56' : '#B91C1C',
                      width: `${(Math.abs(drug.profit) / maxProfit) * 100}%`,
                    }}
                  />
                </div>
                <div style={styles.barVal}>{formatCurrency(drug.profit)}</div>
              </div>
            )) : <p style={styles.empty}>No sales in selected period.</p>}

            {profitAnalysis.length > 0 && (
              <table style={{ ...styles.table, marginTop: '18px' }}>
                <thead>
                  <tr>
                    <th style={styles.th}>Drug</th>
                    <th style={styles.th}>Units Sold</th>
                    <th style={styles.th}>Revenue</th>
                    <th style={styles.th}>Estimated Cost</th>
                    <th style={styles.th}>Profit</th>
                    <th style={styles.th}>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {profitAnalysis.map(drug => (
                    <tr key={drug.name}>
                      <td style={styles.td}>{drug.name}</td>
                      <td style={styles.td}>{drug.units}</td>
                      <td style={styles.td}>{formatCurrency(drug.revenue)}</td>
                      <td style={styles.td}>{formatCurrency(drug.estimatedCost)}</td>
                      <td style={{ ...styles.td, color: drug.profit >= 0 ? '#0F6E56' : '#B91C1C', fontWeight: '600' }}>
                        {formatCurrency(drug.profit)}
                      </td>
                      <td style={styles.td}>{drug.margin.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {activeTab === 'staff' && (
          <>
            {staffPerformance.length > 0 ? staffPerformance.map(staff => (
              <div key={staff.name} style={styles.barRow}>
                <div style={{ ...styles.barLabel, width: '180px', fontSize: '11px' }}>{staff.name}</div>
                <div style={styles.barTrack}>
                  <div style={{ ...styles.barFill, width: `${(staff.revenue / maxStaffRevenue) * 100}%` }} />
                </div>
                <div style={styles.barVal}>{formatCurrency(staff.revenue)}</div>
              </div>
            )) : <p style={styles.empty}>No staff-linked sales in selected period.</p>}

            {staffPerformance.length > 0 && (
              <table style={{ ...styles.table, marginTop: '18px' }}>
                <thead>
                  <tr>
                    <th style={styles.th}>Staff</th>
                    <th style={styles.th}>Sales Rows</th>
                    <th style={styles.th}>Units Sold</th>
                    <th style={styles.th}>Revenue</th>
                    <th style={styles.th}>Average Sale</th>
                    <th style={styles.th}>Last Sale</th>
                  </tr>
                </thead>
                <tbody>
                  {staffPerformance.map(staff => (
                    <tr key={staff.name}>
                      <td style={styles.td}>{staff.name}</td>
                      <td style={styles.td}>{staff.transactions}</td>
                      <td style={styles.td}>{staff.units}</td>
                      <td style={styles.td}>{formatCurrency(staff.revenue)}</td>
                      <td style={styles.td}>{formatCurrency(staff.averageSale)}</td>
                      <td style={styles.td}>{staff.lastSale ? new Date(staff.lastSale).toLocaleString('en-GB') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {activeTab === 'monthly' && (
          monthlySummary.length > 0 ? (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Period</th>
                  <th style={styles.th}>Transactions</th>
                  <th style={styles.th}>Revenue</th>
                  <th style={styles.th}>Average Sale</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary.map(row => (
                  <tr key={row.label}>
                    <td style={styles.td}>{row.label}</td>
                    <td style={styles.td}>{row.transactions}</td>
                    <td style={styles.td}>{formatCurrency(row.revenue)}</td>
                    <td style={styles.td}>{formatCurrency(row.transactions > 0 ? row.revenue / row.transactions : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={styles.empty}>No sales in selected period.</p>
          )
        )}

        {activeTab === 'ppb' && (
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
              {ppbReport.length > 0 ? ppbReport.map(item => (
                <tr key={item.id}>
                  <td style={styles.td}>{item.drug_name}</td>
                  <td style={styles.td}>{item.drug_code || '-'}</td>
                  <td style={styles.td}>{item.ppb_category || '-'}</td>
                  <td style={styles.td}>{item.openingStock}</td>
                  <td style={styles.td}><strong>{item.dispensed}</strong></td>
                  <td style={styles.td}>{item.closingStock}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" style={styles.emptyTableCell}>
                    No controlled drugs found. Add them in Inventory and mark them as controlled substances.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'slow' && canViewSlowMovers && (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Drug Name</th>
                <th style={styles.th}>Category</th>
                <th style={styles.th}>Current Stock</th>
                <th style={styles.th}>Units Sold in Period</th>
                <th style={styles.th}>Last Sale Date</th>
                <th style={styles.th}>Supplier Name</th>
              </tr>
            </thead>
            <tbody>
              {slowMovers.length > 0 ? slowMovers.map(item => (
                <tr key={item.id} style={item.unitsSold === 0 ? styles.slowMoverRow : undefined}>
                  <td style={styles.td}>{item.drugName}</td>
                  <td style={styles.td}>{item.category}</td>
                  <td style={styles.td}>{item.currentStock}</td>
                  <td style={{ ...styles.td, fontWeight: '600' }}>{item.unitsSold}</td>
                  <td style={styles.td}>{item.lastSaleDate}</td>
                  <td style={styles.td}>{item.supplierName}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" style={styles.emptyTableCell}>
                    No slow movers found for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        <div style={styles.paginationFooter}>
          <div style={styles.paginationMeta}>
            Showing {sales.length} of {salesCount} rows
          </div>
          {sales.length < salesCount && (
            <button style={styles.btnSecondary} onClick={loadMoreSales} disabled={loadingMoreSales}>
              {loadingMoreSales ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: { padding: '18px 22px', flex: 1, overflowY: 'auto', background: '#f8f9f8' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', marginBottom: '14px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111', margin: 0 },
  subtitle: { fontSize: '12px', color: '#888', marginTop: '4px' },
  toolbar: { display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' },
  filterBtn: { padding: '6px 14px', border: '1px solid #ddd', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', background: '#fff' },
  filterActive: { background: '#0F6E56', color: '#fff', borderColor: '#0F6E56' },
  errorBanner: { background: '#FEF2F2', border: '1px solid #F8D7DA', borderRadius: '10px', padding: '12px 14px', color: '#B91C1C', fontSize: '13px', marginBottom: '14px' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '14px' },
  summaryCard: { background: '#fff', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e8ebe8' },
  summaryLabel: { fontSize: '11px', color: '#888', marginBottom: '6px' },
  summaryValue: { fontSize: '22px', fontWeight: '700', color: '#111' },
  summaryValueSmall: { fontSize: '16px', fontWeight: '700', color: '#111', lineHeight: '1.4' },
  summaryNote: { fontSize: '11px', color: '#666', marginTop: '4px' },
  tabs: { display: 'flex', gap: '0', marginBottom: '14px', background: '#fff', borderRadius: '8px', border: '1px solid #e8ebe8', overflow: 'hidden' },
  tab: { flex: 1, padding: '10px', border: 'none', background: 'none', fontSize: '12px', cursor: 'pointer', color: '#555' },
  tabActive: { background: '#0F6E56', color: '#fff', fontWeight: '600' },
  card: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '16px' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111' },
  cardNote: { fontSize: '12px', color: '#666', margin: '4px 0 0' },
  adminNotice: { fontSize: '12px', color: '#6b7280' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  sectionTitle: { fontSize: '12px', fontWeight: '600', color: '#111', marginTop: '18px', marginBottom: '10px' },
  barRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' },
  barLabel: { width: '45px', fontSize: '12px', color: '#666' },
  barTrack: { flex: 1, height: '10px', background: '#f0f2f0', borderRadius: '99px', overflow: 'hidden' },
  barFill: { height: '100%', background: '#0F6E56', borderRadius: '99px' },
  barVal: { width: '110px', fontSize: '11px', color: '#666', textAlign: 'right' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' },
  th: { textAlign: 'left', padding: '10px 12px', color: '#666', fontWeight: '600', borderBottom: '1px solid #eee', background: '#f9f9f9' },
  td: { padding: '11px 12px', borderBottom: '1px solid #f4f4f4', color: '#222' },
  slowMoverRow: { background: '#FFFBEB' },
  empty: { color: '#888', textAlign: 'center', padding: '40px' },
  emptyTableCell: { textAlign: 'center', padding: '40px', color: '#888' },
  paginationFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', gap: '12px', flexWrap: 'wrap' },
  paginationMeta: { fontSize: '12px', color: '#555' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' },
}
