import { useEffect, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'

export default function Etims() {
  const { pharmacyId, currentUserEmail, canManagePharmacySettings } = usePharmacy()
  const canEdit = canManagePharmacySettings

  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState({
    kra_pin: '',
    branch_id: '',
    device_serial: '',
  })
  const [systemSettings, setSystemSettings] = useState({})
  const [isConfigured, setIsConfigured] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [configUnlocked, setConfigUnlocked] = useState(false)
  const [configPassword, setConfigPassword] = useState('')
  const [showConfigPassword, setShowConfigPassword] = useState(false)
  const [configLockError, setConfigLockError] = useState('')
  const [configLoading, setConfigLoading] = useState(false)
  const [showKraPin, setShowKraPin] = useState(false)
  const [showBranchId, setShowBranchId] = useState(false)
  const [showDeviceSerial, setShowDeviceSerial] = useState(false)

  useEffect(() => {
    if (pharmacyId) fetchEtimsData()
  }, [pharmacyId])

  async function fetchEtimsData() {
    setLoading(true)

    const [{ data: salesData, error: salesError }, { data: pharmacyData, error: pharmacyError }] = await Promise.all([
      supabase
        .from('sales_ledger')
        .select('*')
        .eq('pharmacy_id', pharmacyId)
        .order('sold_at', { ascending: false }),
      supabase
        .from('pharmacies')
        .select('kra_pin, system_settings')
        .eq('id', pharmacyId)
        .single(),
    ])

    if (salesError) console.error('Error fetching eTIMS sales:', salesError)
    if (pharmacyError) console.error('Error fetching eTIMS config:', pharmacyError)

    const nextSystemSettings = pharmacyData?.system_settings || {}
    const savedConfig = nextSystemSettings.etimsConfig || {}
    const nextConfig = {
      kra_pin: pharmacyData?.kra_pin || '',
      branch_id: savedConfig.branch_id || '',
      device_serial: savedConfig.device_serial || '',
    }

    setSales(salesData || [])
    setSystemSettings(nextSystemSettings)
    setConfig(nextConfig)
    setIsConfigured(Boolean(nextConfig.kra_pin && nextConfig.branch_id && nextConfig.device_serial))
    setLoading(false)
  }

  async function handleSaveConfig() {
    if (!config.kra_pin || !config.branch_id || !config.device_serial) {
      return alert('Please fill all KRA fields')
    }

    if (!canEdit || !configUnlocked) {
      return alert('Only an approved pharmacy administrator or owner can save settings after unlock.')
    }

    const nextSystemSettings = {
      ...systemSettings,
      etimsConfig: {
        branch_id: config.branch_id.trim(),
        device_serial: config.device_serial.trim(),
        configured_at: new Date().toISOString(),
        configured_by: currentUserEmail || null,
      },
    }

    const { error } = await supabase
      .from('pharmacies')
      .update({
        kra_pin: config.kra_pin.trim(),
        system_settings: nextSystemSettings,
      })
      .eq('id', pharmacyId)

    if (error) {
      setSaveMessage('Unable to save configuration: ' + error.message)
      return
    }

    setSystemSettings(nextSystemSettings)
    setIsConfigured(true)
    setSaveMessage('Configuration saved successfully.')
    setTimeout(() => setSaveMessage(''), 3000)
  }

  async function unlockConfig() {
    if (!configPassword) {
      setConfigLockError('Enter your account password to unlock settings.')
      return
    }

    if (!currentUserEmail) {
      setConfigLockError('Unable to determine your account email.')
      return
    }

    setConfigLockError('')
    setConfigLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: currentUserEmail,
      password: configPassword,
    })

    setConfigLoading(false)

    if (error) {
      setConfigLockError('Incorrect password. Try again.')
      return
    }

    setConfigUnlocked(true)
    setConfigPassword('')
  }

  function exportCSV() {
    const headers = ['Sale Ref', 'Drug', 'Qty', 'Amount (KES)', 'Payment', 'Date', 'eTIMS Status']
    const rows = sales.map(sale => [
      `#${sale.id}`,
      sale.drug_name || '',
      sale.qty_sold || 0,
      sale.total_kes || 0,
      sale.payment_method || '',
      sale.sold_at ? sale.sold_at.split('T')[0] : '',
      isConfigured ? 'Configured' : 'Pending setup',
    ])

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `etims_report_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const today = new Date().toISOString().split('T')[0]
  const todaySales = sales.filter(sale => sale.sold_at?.startsWith(today))
  const monthSales = sales.filter(sale => {
    const saleDate = new Date(sale.sold_at)
    const now = new Date()
    return saleDate.getMonth() === now.getMonth() && saleDate.getFullYear() === now.getFullYear()
  })

  if (loading) return <div style={styles.loading}>Loading eTIMS data...</div>

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <h2 style={styles.title}>eTIMS / KRA Compliance</h2>
          <p style={styles.subtitle}>Kenya Revenue Authority - Electronic Tax Invoice Management</p>
        </div>
        {canEdit ? (
          <button style={styles.btnAmber} onClick={exportCSV}>Download CSV Report</button>
        ) : (
          <span style={styles.adminNote}>Export and config are limited to approved administrators or the owner.</span>
        )}
      </div>

      <div style={styles.alertInfo}>
        This screen keeps each pharmacy's eTIMS setup on its own pharmacy record and generates CSV reports for manual upload to the KRA portal.
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.lbl}>Today</div>
          <div style={styles.val}>{todaySales.length}</div>
          <div style={styles.sub}>KES {todaySales.reduce((sum, sale) => sum + (parseFloat(sale.total_kes) || 0), 0).toLocaleString()}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.lbl}>This Month</div>
          <div style={styles.val}>{monthSales.length}</div>
          <div style={styles.sub}>KES {monthSales.reduce((sum, sale) => sum + (parseFloat(sale.total_kes) || 0), 0).toLocaleString()}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.lbl}>Total Records</div>
          <div style={styles.val}>{sales.length}</div>
          <div style={styles.sub}>All time</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.lbl}>Status</div>
          <div style={{ ...styles.val, color: isConfigured ? '#0F6E56' : '#92400e' }}>
            {isConfigured ? 'Ready' : 'Pending'}
          </div>
          <div style={styles.sub}>{isConfigured ? 'Configuration saved' : 'Finish setup to activate'}</div>
        </div>
      </div>

      <div style={styles.twoCol}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>eTIMS Configuration</div>

          {!canEdit ? (
            <div style={styles.lockedCard}>
              <p style={styles.lockedText}>Only an approved pharmacy administrator or the owner can change eTIMS configuration.</p>
              <p style={styles.smallNote}>Other staff can still review activity and reports.</p>
            </div>
          ) : !configUnlocked ? (
            <div style={styles.lockPanel}>
              <p style={styles.lockedText}>Enter your account password to unlock configuration.</p>
              <div style={styles.formRow}>
                <label style={styles.label}>Account Password</label>
                <div style={styles.passwordRow}>
                  <input
                    type={showConfigPassword ? 'text' : 'password'}
                    style={styles.input}
                    placeholder="Enter password"
                    value={configPassword}
                    onChange={event => setConfigPassword(event.target.value)}
                  />
                  <button type="button" style={styles.btnToggle} onClick={() => setShowConfigPassword(value => !value)}>
                    {showConfigPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              {configLockError && <p style={styles.errorText}>{configLockError}</p>}
              <button style={styles.btnPrimary} onClick={unlockConfig} disabled={configLoading}>
                {configLoading ? 'Verifying...' : 'Unlock Settings'}
              </button>
            </div>
          ) : (
            <>
              <div style={styles.formRow}>
                <label style={styles.label}>KRA PIN</label>
                <div style={styles.passwordRow}>
                  <input
                    type={showKraPin ? 'text' : 'password'}
                    style={styles.input}
                    placeholder="e.g. P051234567X"
                    value={config.kra_pin}
                    onChange={event => setConfig({ ...config, kra_pin: event.target.value })}
                  />
                  <button type="button" style={styles.btnToggle} onClick={() => setShowKraPin(value => !value)}>
                    {showKraPin ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div style={styles.formRow}>
                <label style={styles.label}>Branch ID</label>
                <div style={styles.passwordRow}>
                  <input
                    type={showBranchId ? 'text' : 'password'}
                    style={styles.input}
                    placeholder="e.g. 001"
                    value={config.branch_id}
                    onChange={event => setConfig({ ...config, branch_id: event.target.value })}
                  />
                  <button type="button" style={styles.btnToggle} onClick={() => setShowBranchId(value => !value)}>
                    {showBranchId ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div style={styles.formRow}>
                <label style={styles.label}>Device Serial No.</label>
                <div style={styles.passwordRow}>
                  <input
                    type={showDeviceSerial ? 'text' : 'password'}
                    style={styles.input}
                    placeholder="e.g. KRA/DEV/2024/00881"
                    value={config.device_serial}
                    onChange={event => setConfig({ ...config, device_serial: event.target.value })}
                  />
                  <button type="button" style={styles.btnToggle} onClick={() => setShowDeviceSerial(value => !value)}>
                    {showDeviceSerial ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div style={styles.formRow}>
                <label style={styles.label}>API Status</label>
                <input
                  style={{ ...styles.input, color: isConfigured ? '#0F6E56' : '#9ca3af' }}
                  value={isConfigured ? 'Connected' : 'Not Configured'}
                  readOnly
                />
              </div>

              <button style={styles.btnPrimary} onClick={handleSaveConfig}>
                Save and Verify Config
              </button>

              {saveMessage && (
                <p style={{ marginTop: '10px', color: saveMessage.startsWith('Unable') ? '#b91c1c' : '#0F6E56' }}>
                  {saveMessage}
                </p>
              )}
            </>
          )}
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardTitle}>Recent Sales ({sales.length})</div>
            {canEdit ? (
              <button style={styles.btnSm} onClick={exportCSV}>Export CSV</button>
            ) : (
              <span style={styles.adminNote}>Export restricted to approved administrators or the owner.</span>
            )}
          </div>

          {sales.length === 0 ? (
            <div style={styles.empty}>No sales recorded yet.</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  <th style={styles.th}>Sale Ref</th>
                  <th style={styles.th}>Drug</th>
                  <th style={styles.th}>Amount</th>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sales.slice(0, 10).map((sale, index) => (
                  <tr key={sale.id} style={index % 2 === 0 ? {} : { background: '#fafafa' }}>
                    <td style={{ ...styles.td, fontFamily: 'monospace' }}>#{String(sale.id).padStart(4, '0')}</td>
                    <td style={{ ...styles.td, fontWeight: '500' }}>{sale.drug_name}</td>
                    <td style={styles.td}>KES {parseFloat(sale.total_kes || 0).toLocaleString()}</td>
                    <td style={styles.td}>{sale.sold_at ? new Date(sale.sold_at).toLocaleDateString('en-GB') : '-'}</td>
                    <td style={styles.td}>
                      <span style={styles.pillGreen}>{isConfigured ? 'Ready' : 'Pending setup'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: { padding: '18px 22px', flex: 1, overflowY: 'auto' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111', margin: 0 },
  subtitle: { fontSize: '12px', color: '#888', margin: '3px 0 0' },
  alertInfo: { background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#0369a1', marginBottom: '16px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '18px' },
  statCard: { background: '#fff', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e5e7eb' },
  lbl: { fontSize: '11px', color: '#888', marginBottom: '6px' },
  val: { fontSize: '22px', fontWeight: '700', color: '#111', marginBottom: '2px' },
  sub: { fontSize: '11px', color: '#666' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '12px' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  formRow: { marginBottom: '12px' },
  label: { fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' },
  input: { width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', width: '100%' },
  btnAmber: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', padding: '7px 14px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  btnSm: { background: '#fff', color: '#374151', border: '1px solid #e5e7eb', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' },
  passwordRow: { display: 'flex', gap: '8px', alignItems: 'center' },
  btnToggle: { background: '#fff', color: '#374151', border: '1px solid #e5e7eb', padding: '7px 12px', borderRadius: '7px', fontSize: '11px', cursor: 'pointer', minWidth: '60px' },
  lockedCard: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px', marginBottom: '12px' },
  lockPanel: { background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '14px', marginBottom: '12px' },
  lockedText: { fontSize: '13px', color: '#78350f', marginBottom: '8px' },
  smallNote: { fontSize: '12px', color: '#6b7280' },
  adminNote: { fontSize: '11px', color: '#6b7280' },
  errorText: { color: '#b91c1c', fontSize: '12px', marginTop: '-8px', marginBottom: '10px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  thead: { background: '#f9fafb' },
  th: { textAlign: 'left', padding: '8px 10px', color: '#9ca3af', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '9px 10px', borderBottom: '1px solid #f3f4f6', color: '#374151' },
  pillGreen: { background: '#f0fdf4', color: '#065f46', padding: '2px 9px', borderRadius: '99px', fontSize: '11px', fontWeight: '500' },
  empty: { textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '13px' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' },
}
