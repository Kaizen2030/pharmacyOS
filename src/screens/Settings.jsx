import { useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import supabase from '../supabase'
import { usePharmacy } from '../context'
import { notifyError, notifyInfo, notifySuccess } from '../notifications'
import { downloadCSV } from '../utils/csv'
import { hashPin, normalizePin } from '../utils/pin'

const defaultSystemSettings = {
  lowStockThreshold: '20',
  expiryWarning: '90',
  currency: 'KES - Kenyan Shilling',
  morningReport: 'Enabled - 7:00 AM Mon-Sat',
  etims: 'Enabled - every sale',
}

const emptyUser = {
  name: '',
  email: '',
  phone: '',
  role: 'Cashier',
  approved: true,   // default YES when owner adds manually
  pin: '',
  branch_pharmacy_id: '', // which branch/main they belong to
}

export default function Settings() {
  const {
    pharmacyId,
    pharmacyName,
    pharmacyOwnerEmail,
    currentUserEmail,
    currentUserName,
    isOwner,
    canManagePharmacySettings,
  } = usePharmacy()

  const canManageSettings = canManagePharmacySettings
  const accountEmail = (currentUserEmail || pharmacyOwnerEmail || '').trim().toLowerCase()

  const [loading, setLoading] = useState(true)
  const [settingsError, setSettingsError] = useState('')
  const [settingsUnlocked, setSettingsUnlocked] = useState(false)
  const [settingsPassword, setSettingsPassword] = useState('')
  const [showSettingsPassword, setShowSettingsPassword] = useState(false)
  const [settingsLockError, setSettingsLockError] = useState('')
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')

  const [savingProfile, setSavingProfile] = useState(false)
  const [savingSystem, setSavingSystem] = useState(false)
  const [savingAlertSettings, setSavingAlertSettings] = useState(false)
  const [exportingBackup, setExportingBackup] = useState(false)

  const [pharmacy, setPharmacy] = useState({
    name: '', location: '', ppb: '', mpesa: '', kraPin: '', phone: '',
    darajaKey: '', darajaSecret: '', darajaShortcode: '', darajaPasskey: '',
  })

  const [system, setSystem] = useState(defaultSystemSettings)
  const [whatsappAlertsEnabled, setWhatsappAlertsEnabled] = useState(false)
  const [whatsappAlertPhone, setWhatsappAlertPhone] = useState('')
  const [whatsappAlertThreshold, setWhatsappAlertThreshold] = useState(20)
  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([]) // all branches for dropdown
  const [showAddUser, setShowAddUser] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [newUser, setNewUser] = useState(emptyUser)
  const [showKraPin, setShowKraPin] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState(false)

  useEffect(() => {
    if (!pharmacyId) { setLoading(false); return }
    async function loadPage() {
      setLoading(true)
      setSettingsError('')
      try {
        await Promise.all([fetchSettings(), fetchUsers(), fetchBranches()])
      } catch (error) {
        setSettingsError(error?.message || 'Unable to load settings')
      } finally {
        setLoading(false)
      }
    }
    loadPage()
  }, [pharmacyId])

  useEffect(() => { setAdminEmail(accountEmail) }, [accountEmail])

  const visibleUsers = useMemo(() => {
    return users.filter(u => (u.email || '').trim().toLowerCase() !== accountEmail)
  }, [users, accountEmail])

  // Build branch name lookup map: id → display name
  const branchMap = useMemo(() => {
    const map = { [pharmacyId]: `${pharmacyName} (Main)` }
    branches.forEach(b => { map[b.id] = b.name })
    return map
  }, [branches, pharmacyId, pharmacyName])

  async function fetchSettings() {
    const { data, error } = await supabase.from('pharmacies').select('*').eq('id', pharmacyId).single()
    if (error) throw error
    if (data) {
      setPharmacy({
        name: data.name || '', location: data.location || '', ppb: data.ppb_license || '',
        mpesa: data.mpesa_paybill || '', kraPin: data.kra_pin || '', phone: data.phone || '',
        darajaKey: data.daraja_consumer_key || '', darajaSecret: data.daraja_consumer_secret || '',
        darajaShortcode: data.daraja_shortcode || '', darajaPasskey: data.daraja_passkey || '',
      })
      setSystem(data.system_settings ? { ...defaultSystemSettings, ...data.system_settings } : defaultSystemSettings)
      setWhatsappAlertsEnabled(Boolean(data.whatsapp_alerts_enabled))
      setWhatsappAlertPhone(data.whatsapp_alert_phone || data.phone || '')
      setWhatsappAlertThreshold(data.whatsapp_alert_threshold ?? 20)
    }
  }

  async function fetchUsers() {
    const { data, error } = await supabase
      .from('web_users')
      .select('id, name, email, phone, role, approved, pin_hash, branch_pharmacy_id')
      .eq('pharmacy_id', pharmacyId)
    if (error) throw error
    setUsers((data || []).map(user => ({
      ...user,
      has_pin: Boolean(user.pin_hash),
    })))
  }

  async function fetchBranches() {
    const { data } = await supabase
      .from('pharmacies')
      .select('id, name, location')
      .eq('parent_pharmacy_id', pharmacyId)
      .order('created_at', { ascending: true })
    setBranches(data || [])
  }

  // ── Invite helpers ──────────────────────────────────────────────
  function getBaseUrl() {
    const origin = window.location.origin
    if (origin.startsWith('http')) return origin
    return 'http://localhost:5173'
  }

  function buildInviteMessage(email, name, branchName) {
    const link = `${getBaseUrl()}/?inviteEmail=${encodeURIComponent((email || '').trim().toLowerCase())}`
    const location = branchName || pharmacyName || 'the pharmacy'
    return (
      `Hello ${name || 'Team Member'},\n\n` +
      `You have been added as staff at *${location}* on PharmacyOS.\n\n` +
      `👉 Sign up here using this exact email address (${email}):\n${link}\n\n` +
      `After signing up, your account will be active immediately.\n\n` +
      `– ${adminEmail || 'Pharmacy Administrator'}`
    )
  }

  function copyInviteMessage(email, name, branchPharmacyId) {
    const branchName = branchMap[branchPharmacyId] || branchMap[pharmacyId]
    const msg = buildInviteMessage(email, name, branchName)
    navigator.clipboard.writeText(msg).then(() => {
      setCopiedInvite(true)
      notifySuccess('Invite message copied to clipboard.', { title: 'Invite copied' })
      setTimeout(() => setCopiedInvite(false), 2000)
    })
  }

  function sendWhatsApp(email, name, branchPharmacyId) {
    if (!email) return alert('Enter a staff email first.')
    const branchName = branchMap[branchPharmacyId] || branchMap[pharmacyId]
    const msg = buildInviteMessage(email, name, branchName)
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  function sendGmail(email, name, branchPharmacyId) {
    if (!email) return alert('Enter a staff email first.')
    const branchName = branchMap[branchPharmacyId] || branchMap[pharmacyId]
    const subject = `You've been added to ${pharmacyName || 'PharmacyOS'}`
    const body = buildInviteMessage(email, name, branchName)
    window.open(
      `https://mail.google.com/mail/u/0/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
      '_blank'
    )
  }

  // ── Save helpers ────────────────────────────────────────────────
  async function saveProfile() {
    setSavingProfile(true)
    const { error } = await supabase.from('pharmacies').update({
      name: pharmacy.name.trim(), location: pharmacy.location.trim(),
      ppb_license: pharmacy.ppb.trim(), mpesa_paybill: pharmacy.mpesa.trim(),
      kra_pin: pharmacy.kraPin.trim(), daraja_consumer_key: pharmacy.darajaKey.trim(),
      daraja_consumer_secret: pharmacy.darajaSecret.trim(),
      daraja_shortcode: pharmacy.darajaShortcode.trim(), daraja_passkey: pharmacy.darajaPasskey.trim(),
    }).eq('id', pharmacyId)
    setSavingProfile(false)
    if (error) notifyError('Error saving profile: ' + error.message, { title: 'Profile save failed' })
    else notifySuccess('Pharmacy profile saved.', { title: 'Profile updated' })
  }

  async function saveSystem() {
    setSavingSystem(true)
    const { error } = await supabase.from('pharmacies').update({ system_settings: system }).eq('id', pharmacyId)
    setSavingSystem(false)
    if (error) notifyError('Error saving system settings: ' + error.message, { title: 'Settings save failed' })
    else notifySuccess('System settings saved.', { title: 'Settings updated' })
  }

  async function saveAlertSettings() {
    setSavingAlertSettings(true)
    if (whatsappAlertsEnabled && !whatsappAlertPhone.trim()) {
      setSavingAlertSettings(false)
      return alert('Enter a WhatsApp phone number to enable alerts.')
    }

    const { error } = await supabase.from('pharmacies').update({
      whatsapp_alerts_enabled: whatsappAlertsEnabled,
      whatsapp_alert_phone: whatsappAlertPhone.trim() || null,
      whatsapp_alert_threshold: parseInt(whatsappAlertThreshold, 10) || 20,
    }).eq('id', pharmacyId)

    setSavingAlertSettings(false)
    if (error) notifyError('Error saving low stock alerts: ' + error.message, { title: 'Alerts save failed' })
    else notifySuccess('Low stock alerts saved.', { title: 'Alerts updated' })
  }

  async function saveUser() {
    if (!newUser.name.trim()) return alert('Full Name is required')
    if (!newUser.email.trim()) return alert('Email is required')
    const normalizedPin = normalizePin(newUser.pin)
    if (newUser.pin && normalizedPin.length !== 4) return alert('PIN must be exactly 4 digits.')

    const assignedBranchId = newUser.branch_pharmacy_id || pharmacyId

    const payload = {
      pharmacy_id: pharmacyId,
      branch_pharmacy_id: assignedBranchId,
      name: newUser.name.trim(),
      email: newUser.email.trim().toLowerCase(),
      phone: newUser.phone.trim() || null,
      role: newUser.role,
      approved: true,
    }

    if (normalizedPin) {
      payload.pin_hash = await hashPin(normalizedPin)
      payload.pin = null
    } else if (!editingUser) {
      payload.pin_hash = null
      payload.pin = null
    }

    try {
      if (editingUser) {
        const { error } = await supabase.from('web_users').update(payload).eq('id', editingUser.id)
        if (error) throw error
        notifySuccess('User updated.', { title: 'Staff saved' })
      } else {
        const { error } = await supabase.from('web_users').insert([payload])
        if (error) throw error
        notifySuccess('User added. Send them the invite so they can sign up.', { title: 'Staff added' })
      }
      setShowAddUser(false)
      setEditingUser(null)
      setNewUser(emptyUser)
      await fetchUsers()
    } catch (error) {
      notifyError('Error: ' + error.message, { title: 'Staff save failed' })
    }
  }

  async function approveUser(user) {
    const { error } = await supabase.from('web_users').update({ approved: true }).eq('id', user.id)
    if (error) {
      notifyError('Error approving user: ' + error.message, { title: 'Approval failed' })
      return
    }
    notifySuccess(`${user.name || user.email || 'Staff member'} approved.`, { title: 'Staff approved' })
    await fetchUsers()
  }

  async function deleteUser(id) {
    if (!window.confirm('Delete this user permanently?')) return
    const { error } = await supabase.from('web_users').delete().eq('id', id).eq('pharmacy_id', pharmacyId)
    if (error) {
      notifyError('Error deleting user: ' + error.message, { title: 'Delete failed' })
      return
    }
    notifyInfo('Staff member deleted.', { title: 'Staff removed' })
    await fetchUsers()
  }

  function startEdit(user) {
    setNewUser({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role || 'Cashier',
      approved: !!user.approved,
      pin: '',
      branch_pharmacy_id: user.branch_pharmacy_id || pharmacyId,
    })
    setEditingUser(user)
    setShowAddUser(true)
  }

  async function handleLogout() {
    if (!window.confirm('Sign out from this session?')) return
    await supabase.auth.signOut()
    window.location.reload()
  }

  async function unlockSettings() {
    if (!settingsPassword) { setSettingsLockError('Enter your account password to continue.'); return }
    if (!accountEmail) { setSettingsLockError('Unable to determine your account email.'); return }
    setSettingsLoading(true)
    setSettingsLockError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email: accountEmail, password: settingsPassword })
    setSettingsLoading(false)
    if (error) { setSettingsLockError(error.message || 'Unable to verify password.'); return }
    if (data?.user) { setSettingsUnlocked(true); setSettingsPassword('') }
  }

  async function sendSettingsReset() {
    if (!accountEmail) { setSettingsLockError('Unable to determine your account email.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(accountEmail, { redirectTo: window.location.origin })
    setSettingsLockError(error ? error.message : 'Reset email sent to ' + accountEmail + '.')
  }

  function buildBackupCSV(records, preferredHeaders = []) {
    const headers = preferredHeaders.length > 0
      ? preferredHeaders
      : Array.from(
        (records || []).reduce((allHeaders, row) => {
          Object.keys(row || {}).forEach(key => allHeaders.add(key))
          return allHeaders
        }, new Set())
      )

    const rows = (records || []).map(record => headers.map(header => record?.[header] ?? ''))
    return downloadCSV(headers, rows, 'backup.csv', { download: false })
  }

  async function exportFullBackup() {
    if (!pharmacyId) return

    setExportingBackup(true)

    try {
      const [
        salesResult,
        inventoryResult,
        patientsResult,
        shiftsResult,
        creditSalesResult,
        webUsersResult,
      ] = await Promise.all([
        supabase.from('sales_ledger').select('*').eq('pharmacy_id', pharmacyId),
        supabase.from('inventory').select('*').eq('pharmacy_id', pharmacyId),
        supabase.from('patients').select('*').eq('pharmacy_id', pharmacyId),
        supabase.from('shifts').select('*').eq('pharmacy_id', pharmacyId),
        supabase.from('credit_sales').select('*').eq('pharmacy_id', pharmacyId),
        supabase
          .from('web_users')
          .select('id, name, email, role, branch_pharmacy_id')
          .eq('pharmacy_id', pharmacyId),
      ])

      const firstError = [
        salesResult.error,
        inventoryResult.error,
        patientsResult.error,
        shiftsResult.error,
        creditSalesResult.error,
        webUsersResult.error,
      ].find(Boolean)

      if (firstError) {
        throw firstError
      }

      const zip = new JSZip()
      const today = new Date().toISOString().split('T')[0]

      zip.file('sales_ledger.csv', buildBackupCSV(salesResult.data || []))
      zip.file('inventory.csv', buildBackupCSV(inventoryResult.data || []))
      zip.file('patients.csv', buildBackupCSV(patientsResult.data || []))
      zip.file('shifts.csv', buildBackupCSV(shiftsResult.data || []))
      zip.file('credit_sales.csv', buildBackupCSV(creditSalesResult.data || []))
      zip.file(
        'web_users.csv',
        buildBackupCSV(webUsersResult.data || [], ['id', 'name', 'email', 'role', 'branch_pharmacy_id'])
      )

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `pharmacyos_backup_${today}.zip`
      link.click()
      URL.revokeObjectURL(url)

      notifySuccess('Full backup exported successfully.', { title: 'Backup ready' })
    } catch (error) {
      console.error('Backup export failed:', error)
      notifyError('Unable to export backup: ' + (error?.message || 'Unknown error'), { title: 'Backup failed' })
    } finally {
      setExportingBackup(false)
    }
  }

  // ── Render guards ───────────────────────────────────────────────
  if (loading) return <div style={st.loading}>Loading settings...</div>

  if (settingsError) return (
    <div style={st.page}>
      <div style={st.topbar}><h2 style={st.title}>Settings</h2></div>
      <div style={st.card}><div style={st.cardTitle}>Unable to load settings</div><p style={st.infoText}>{settingsError}</p></div>
    </div>
  )

  if (!canManageSettings) return (
    <div style={st.page}>
      <div style={st.topbar}><h2 style={st.title}>Settings</h2></div>
      <div style={st.card}>
        <div style={st.cardTitle}>Access Restricted</div>
        <p style={st.infoText}>Only an approved pharmacy administrator or the account owner can manage settings.</p>
      </div>
    </div>
  )

  if (!settingsUnlocked) return (
    <div style={st.page}>
      <div style={st.topbar}><h2 style={st.title}>Settings</h2></div>
      <div style={st.card}>
        <div style={st.cardTitle}>Administrator settings access</div>
        <p style={st.infoText}>Enter your account password to open Settings.</p>
        <div style={st.formGroup}>
          <label style={st.label}>Password</label>
          <div style={st.pinRow}>
            <input
              type={showSettingsPassword ? 'text' : 'password'}
              style={{ ...st.input, marginRight: '8px' }}
              value={settingsPassword}
              onChange={e => setSettingsPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && unlockSettings()}
            />
            <button style={st.btnToggle} onClick={() => setShowSettingsPassword(v => !v)}>
              {showSettingsPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        {settingsLockError && <div style={st.errorBox}>{settingsLockError}</div>}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button style={st.btnPrimary} onClick={unlockSettings} disabled={settingsLoading}>
            {settingsLoading ? 'Verifying...' : 'Unlock Settings'}
          </button>
          <button style={st.btnSecondary} onClick={sendSettingsReset}>Forgot password?</button>
        </div>
      </div>
    </div>
  )

  // ── Main Settings UI ────────────────────────────────────────────
  return (
    <div style={st.page}>
      <div style={st.topbar}><h2 style={st.title}>Settings</h2></div>

      {/* Profile + System */}
      <div style={st.twoCol}>
        <div style={st.card}>
          <div style={st.cardTitle}>Pharmacy Profile</div>
          {[
            ['Pharmacy Name', 'name'], ['Location', 'location'],
            ['PPB License No.', 'ppb'], ['M-Pesa Paybill / Till', 'mpesa'],
          ].map(([label, key]) => (
            <div key={key} style={st.formGroup}>
              <label style={st.label}>{label}</label>
              <input style={st.input} value={pharmacy[key]} onChange={e => setPharmacy({ ...pharmacy, [key]: e.target.value })} />
            </div>
          ))}

          {[
            ['Daraja Consumer Key', 'darajaKey', 'text', 'From Safaricom Developer Portal'],
            ['Daraja Consumer Secret', 'darajaSecret', 'password', 'From Safaricom Developer Portal'],
            ['M-Pesa Shortcode / Paybill', 'darajaShortcode', 'text', 'e.g. 174379'],
            ['Daraja Passkey', 'darajaPasskey', 'password', 'From Safaricom Developer Portal'],
          ].map(([label, key, type, placeholder]) => (
            <div key={key} style={st.formGroup}>
              <label style={st.label}>{label}</label>
              <input style={st.input} type={type} value={pharmacy[key]} placeholder={placeholder}
                onChange={e => setPharmacy({ ...pharmacy, [key]: e.target.value })} />
            </div>
          ))}

          <div style={st.mpesaTip}>
            Get these from <strong>developer.safaricom.co.ke</strong> → Create App → Lipa Na M-Pesa Online
          </div>

          <div style={st.formGroup}>
            <label style={st.label}>KRA PIN</label>
            <div style={st.pinRow}>
              <input type={showKraPin ? 'text' : 'password'} style={{ ...st.input, marginRight: '8px' }}
                value={pharmacy.kraPin} onChange={e => setPharmacy({ ...pharmacy, kraPin: e.target.value })} />
              <button style={st.btnToggle} onClick={() => setShowKraPin(v => !v)}>{showKraPin ? 'Hide' : 'Show'}</button>
            </div>
          </div>

          <button style={st.btnPrimary} onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        <div style={st.card}>
          <div style={st.cardTitle}>System Settings</div>
          <div style={st.formGroup}>
            <label style={st.label}>Low stock alert threshold</label>
            <input style={st.input} type="number" value={system.lowStockThreshold}
              onChange={e => setSystem({ ...system, lowStockThreshold: e.target.value })} />
          </div>
          <div style={st.formGroup}>
            <label style={st.label}>Expiry warning (days)</label>
            <input style={st.input} type="number" value={system.expiryWarning}
              onChange={e => setSystem({ ...system, expiryWarning: e.target.value })} />
          </div>
          <div style={st.formGroup}>
            <label style={st.label}>Default currency</label>
            <select style={st.input} value={system.currency} onChange={e => setSystem({ ...system, currency: e.target.value })}>
              <option>KES - Kenyan Shilling</option>
              <option>USD - US Dollar</option>
              <option>UGX - Ugandan Shilling</option>
            </select>
          </div>
          <div style={st.formGroup}>
            <label style={st.label}>Auto morning report</label>
            <select style={st.input} value={system.morningReport} onChange={e => setSystem({ ...system, morningReport: e.target.value })}>
              <option>Enabled - 7:00 AM Mon-Sat</option>
              <option>Enabled - 7:00 AM Daily</option>
              <option>Disabled</option>
            </select>
          </div>
          <div style={st.formGroup}>
            <label style={st.label}>eTIMS auto-submit</label>
            <select style={st.input} value={system.etims} onChange={e => setSystem({ ...system, etims: e.target.value })}>
              <option>Enabled - every sale</option>
              <option>Enabled - end of day</option>
              <option>Disabled</option>
            </select>
          </div>
          <button style={st.btnPrimary} onClick={saveSystem} disabled={savingSystem}>
            {savingSystem ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* ── User Accounts ── */}
      <div style={st.card}>
        <div style={st.cardTitle}>User Accounts & Roles</div>
        <p style={st.infoText}>
          Add staff, assign them to a branch, set their PIN for quick POS staff switching and shift accountability, then send them an invite via WhatsApp or Gmail.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={st.table}>
            <thead>
              <tr>
                <th style={st.th}>Name</th>
                <th style={st.th}>Email</th>
                <th style={st.th}>Phone</th>
                <th style={st.th}>Role</th>
                <th style={st.th}>Branch</th>
                <th style={st.th}>PIN</th>
                <th style={st.th}>Status</th>
                <th style={st.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Owner row */}
              <tr>
                <td style={st.td}>{currentUserName || pharmacyName || 'Administrator'}</td>
                <td style={st.td}>{accountEmail || '-'}</td>
                <td style={st.td}>-</td>
                <td style={st.td}>{isOwner ? 'Owner' : 'Administrator'}</td>
                <td style={st.td}><span style={st.branchPill}>Main</span></td>
                <td style={st.td}>-</td>
                <td style={st.td}><span style={{ ...st.pill, background: '#E1F5EE', color: '#0F6E56' }}>Approved</span></td>
                <td style={st.td}><span style={{ fontSize: '11px', color: '#888' }}>You</span></td>
              </tr>

              {visibleUsers.map(user => (
                <tr key={user.id}>
                  <td style={st.td}>{user.name}</td>
                  <td style={st.td}>{user.email || '-'}</td>
                  <td style={st.td}>{user.phone || '-'}</td>
                  <td style={st.td}>{user.role || 'Cashier'}</td>
                  <td style={st.td}>
                    <span style={st.branchPill}>
                      {branchMap[user.branch_pharmacy_id] || branchMap[pharmacyId] || 'Main'}
                    </span>
                  </td>
                  <td style={st.td}>
                    {user.has_pin ? <span style={st.pinDots}>••••</span> : <span style={{ color: '#ccc', fontSize: '11px' }}>—</span>}
                  </td>
                  <td style={st.td}>
                    <span style={{ ...st.pill, background: user.approved ? '#E1F5EE' : '#FEF3F2', color: user.approved ? '#0F6E56' : '#B91C1C' }}>
                      {user.approved ? 'Approved' : 'Pending'}
                    </span>
                  </td>
                  <td style={st.td}>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      <button style={st.btnInviteWa} onClick={() => sendWhatsApp(user.email, user.name, user.branch_pharmacy_id)}>
                        WhatsApp
                      </button>
                      <button style={st.btnInviteGm} onClick={() => sendGmail(user.email, user.name, user.branch_pharmacy_id)}>
                        Gmail
                      </button>
                      <button style={st.btnCopy} onClick={() => copyInviteMessage(user.email, user.name, user.branch_pharmacy_id)}>
                        Copy
                      </button>
                      {!user.approved && (
                        <button style={st.btnApprove} onClick={() => approveUser(user)}>Approve</button>
                      )}
                      <button style={st.btnEdit} onClick={() => startEdit(user)}>Edit</button>
                      <button style={st.btnDelete} onClick={() => deleteUser(user.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button style={{ ...st.btnPrimary, marginTop: '14px' }} onClick={() => { setNewUser(emptyUser); setShowAddUser(true) }}>
          + Add Staff Member
        </button>
      </div>

      {isOwner && (
        <>
          <div style={st.card}>
            <div style={st.cardTitle}>Low Stock Alerts</div>
            <div style={st.formGroup}>
              <label style={st.label}>
                <input
                  type="checkbox"
                  checked={whatsappAlertsEnabled}
                  onChange={e => setWhatsappAlertsEnabled(e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                Enable WhatsApp low stock alerts
              </label>
            </div>
            <div style={st.formGroup}>
              <label style={st.label}>WhatsApp alert phone</label>
              <input
                style={st.input}
                type="text"
                value={whatsappAlertPhone}
                onChange={e => setWhatsappAlertPhone(e.target.value)}
                placeholder="e.g. +254712345678"
              />
              <div style={st.fieldNote}>This phone number is used to open WhatsApp Web/app with the low stock alert message.</div>
            </div>
            <div style={st.formGroup}>
              <label style={st.label}>Threshold override</label>
              <input
                style={st.input}
                type="number"
                min="1"
                value={whatsappAlertThreshold}
                onChange={e => setWhatsappAlertThreshold(parseInt(e.target.value, 10) || 20)}
              />
              <div style={st.fieldNote}>Used when a product has no low stock threshold set and saved in pharmacy settings.</div>
            </div>
            <button style={st.btnPrimary} onClick={saveAlertSettings} disabled={savingAlertSettings}>
              {savingAlertSettings ? 'Saving...' : 'Save Low Stock Alerts'}
            </button>
          </div>

          <div style={st.card}>
            <div style={st.cardTitle}>Backup & Export</div>
            <p style={st.infoText}>
              Download a full ZIP backup containing CSV exports for sales, inventory, patients, shifts, credit sales, and staff accounts.
            </p>
            <button style={st.btnPrimary} onClick={exportFullBackup} disabled={exportingBackup}>
              {exportingBackup ? 'Exporting Backup...' : 'Export Full Backup'}
            </button>
          </div>
        </>
      )}

      {/* Logout */}
      <div style={st.logoutSection}>
        <button onClick={handleLogout} style={st.logoutBtn}>Sign Out</button>
        <p style={st.logoutText}>Signed in as <strong>{currentUserName || pharmacyName || 'Administrator'}</strong></p>
      </div>

      {/* ── Add / Edit User Modal ── */}
      {showAddUser && (
        <div style={st.overlay}>
          <div style={st.modal}>
            <h3 style={st.modalTitle}>{editingUser ? '✏️ Edit Staff Member' : '👤 Add New Staff Member'}</h3>

            {/* Name */}
            <div style={st.formGroup}>
              <label style={st.label}>Full Name *</label>
              <input style={st.input} value={newUser.name}
                onChange={e => setNewUser({ ...newUser, name: e.target.value })} placeholder="e.g. Jane Kamau" />
            </div>

            {/* Email */}
            <div style={st.formGroup}>
              <label style={st.label}>Email Address *</label>
              <input style={st.input} type="email" value={newUser.email}
                onChange={e => setNewUser({ ...newUser, email: e.target.value })} placeholder="staff@pharmacy.co.ke" />
              <div style={st.fieldNote}>This email links the staff member to your pharmacy when they sign up.</div>
            </div>

            {/* Phone */}
            <div style={st.formGroup}>
              <label style={st.label}>Phone Number</label>
              <input style={st.input} value={newUser.phone}
                onChange={e => setNewUser({ ...newUser, phone: e.target.value })} placeholder="0712 345 678" />
            </div>

            {/* Role */}
            <div style={st.formGroup}>
              <label style={st.label}>Role</label>
              <select style={st.input} value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                <option>Administrator</option>
                <option>HR</option>
                <option>Pharmacist</option>
                <option>Cashier</option>
              </select>
            </div>

            {/* Branch Assignment — the key new field */}
            <div style={st.formGroup}>
              <label style={st.label}>Assign to Branch</label>
              <select style={st.input} value={newUser.branch_pharmacy_id || pharmacyId}
                onChange={e => setNewUser({ ...newUser, branch_pharmacy_id: e.target.value })}>
                <option value={pharmacyId}>{pharmacyName} (Main Branch)</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name} — {b.location}</option>
                ))}
              </select>
              <div style={st.fieldNote}>
                This staff member will only see data for the branch you assign them to.
              </div>
            </div>

            {/* PIN */}
            <div style={st.formGroup}>
              <label style={st.label}>POS PIN (optional — 4 digits)</label>
              <input style={st.input} type="password" maxLength={4} value={newUser.pin}
                onChange={e => setNewUser({ ...newUser, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="e.g. 1234" />
              <div style={st.fieldNote}>
                {editingUser?.has_pin
                  ? 'Enter a new 4-digit PIN only if you want to replace the current one. Leave this blank to keep the existing PIN.'
                  : 'A 4-digit PIN for fast POS staff switching at the till and for recording who opened a shift. Leave blank if not needed.'}
              </div>
            </div>

            {/* Invite buttons — shown after email is filled */}
            {newUser.email && (
              <div style={st.inviteBox}>
                <div style={st.inviteLabel}>📨 Send invite to {newUser.email}</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                  <button style={st.btnInviteWa} onClick={() => sendWhatsApp(newUser.email, newUser.name, newUser.branch_pharmacy_id)}>
                    📱 WhatsApp
                  </button>
                  <button style={st.btnInviteGm} onClick={() => sendGmail(newUser.email, newUser.name, newUser.branch_pharmacy_id)}>
                    ✉️ Gmail
                  </button>
                  <button style={st.btnCopy} onClick={() => copyInviteMessage(newUser.email, newUser.name, newUser.branch_pharmacy_id)}>
                    {copiedInvite ? '✓ Copied!' : '📋 Copy Message'}
                  </button>
                </div>
              </div>
            )}

            <div style={st.modalFooter}>
              <button style={st.btnSecondary} onClick={() => { setShowAddUser(false); setEditingUser(null); setNewUser(emptyUser) }}>
                Cancel
              </button>
              <button style={st.btnPrimary} onClick={saveUser}>
                {editingUser ? 'Update Staff' : 'Add Staff'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const st = {
  page: { padding: '18px 22px', flex: 1, overflowY: 'auto' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' },
  card: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '18px 20px', marginBottom: '14px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '14px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' },
  label: { fontSize: '11px', color: '#666' },
  input: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', width: '100%', boxSizing: 'border-box' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '8px 10px', color: '#888', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e8ebe8', whiteSpace: 'nowrap' },
  td: { padding: '10px', borderBottom: '1px solid #f0f2f0', color: '#222', verticalAlign: 'middle' },
  pill: { padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '500' },
  branchPill: { background: '#EFF6FF', color: '#1D4ED8', fontSize: '11px', padding: '2px 8px', borderRadius: '99px', fontWeight: '500', whiteSpace: 'nowrap' },
  pinDots: { fontSize: '14px', color: '#555', letterSpacing: '2px' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' },
  btnSecondary: { background: '#fff', color: '#333', border: '1px solid #ddd', padding: '8px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  btnEdit: { background: '#0F6E56', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' },
  btnDelete: { background: '#E24B4A', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' },
  btnApprove: { background: '#0F6E56', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' },
  btnInviteWa: { background: '#25D366', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: '500' },
  btnInviteGm: { background: '#EA4335', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: '500' },
  btnCopy: { background: '#f0f2f0', color: '#333', border: '1px solid #ddd', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' },
  pinRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  btnToggle: { background: '#f3f4f6', color: '#111827', border: '1px solid #d1d5db', borderRadius: '7px', padding: '8px 12px', cursor: 'pointer', fontSize: '12px' },
  fieldNote: { fontSize: '11px', color: '#6b7280', marginTop: '4px' },
  loading: { padding: '80px', textAlign: 'center', color: '#666', fontSize: '16px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '20px' },
  modal: { background: '#fff', borderRadius: '12px', padding: '24px', width: '500px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '15px', fontWeight: '600', marginBottom: '16px', color: '#111' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', flexWrap: 'wrap' },
  inviteBox: { background: '#F0FDF4', border: '1px solid #A7F3D0', borderRadius: '8px', padding: '12px 14px', marginBottom: '12px' },
  inviteLabel: { fontSize: '12px', color: '#065F46', fontWeight: '500' },
  mpesaTip: { padding: '10px 14px', background: '#E1F5EE', borderRadius: '8px', fontSize: '12px', color: '#0F6E56', marginTop: '8px', marginBottom: '12px' },
  logoutSection: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '20px', textAlign: 'center', marginTop: '20px' },
  logoutBtn: { background: '#E24B4A', color: '#fff', border: 'none', padding: '12px 32px', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' },
  logoutText: { marginTop: '12px', fontSize: '13px', color: '#666' },
  infoText: { fontSize: '13px', color: '#444', lineHeight: '1.6', marginBottom: '12px' },
  errorBox: { border: '1px solid #F8D7DA', background: '#FEF2F2', color: '#B91C1C', borderRadius: '8px', padding: '10px', marginBottom: '14px' },
}
