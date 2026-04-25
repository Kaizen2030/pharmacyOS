import { useEffect, useMemo, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'

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
  approved: false,
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

  const [pharmacy, setPharmacy] = useState({
    name: '',
    location: '',
    ppb: '',
    mpesa: '',
    kraPin: '',
    darajaKey: '',
    darajaSecret: '',
    darajaShortcode: '',
    darajaPasskey: '',
  })

  const [system, setSystem] = useState(defaultSystemSettings)
  const [users, setUsers] = useState([])
  const [showAddUser, setShowAddUser] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [newUser, setNewUser] = useState(emptyUser)
  const [showKraPin, setShowKraPin] = useState(false)

  useEffect(() => {
    if (!pharmacyId) {
      setLoading(false)
      return
    }

    async function loadPage() {
      setLoading(true)
      setSettingsError('')

      try {
        await Promise.all([fetchSettings(), fetchUsers()])
      } catch (error) {
        setSettingsError(error?.message || 'Unable to load settings')
      } finally {
        setLoading(false)
      }
    }

    loadPage()
  }, [pharmacyId])

  useEffect(() => {
    setAdminEmail(accountEmail)
  }, [accountEmail])

  const visibleUsers = useMemo(() => {
    return users.filter(user => (user.email || '').trim().toLowerCase() !== accountEmail)
  }, [users, accountEmail])

  async function fetchSettings() {
    const { data, error } = await supabase
      .from('pharmacies')
      .select('*')
      .eq('id', pharmacyId)
      .single()

    if (error) throw error

    if (data) {
      setPharmacy({
        name: data.name || '',
        location: data.location || '',
        ppb: data.ppb_license || '',
        mpesa: data.mpesa_paybill || '',
        kraPin: data.kra_pin || '',
        darajaKey: data.daraja_consumer_key || '',
        darajaSecret: data.daraja_consumer_secret || '',
        darajaShortcode: data.daraja_shortcode || '',
        darajaPasskey: data.daraja_passkey || '',
      })

      setSystem(data.system_settings ? { ...defaultSystemSettings, ...data.system_settings } : defaultSystemSettings)
    }
  }

  async function fetchUsers() {
    const { data, error } = await supabase
      .from('web_users')
      .select('id, name, email, phone, role, approved')
      .eq('pharmacy_id', pharmacyId)

    if (error) throw error
    setUsers(data || [])
  }

  function getInviteBaseUrl() {
    const origin = window.location.origin
    if (origin.startsWith('http://') || origin.startsWith('https://')) return origin

    const host = window.location.host
    if (host) return `${window.location.protocol}//${host}`

    return 'http://localhost:5173'
  }

  function generateInviteLink(email) {
    if (!email) return ''
    const params = new URLSearchParams({ inviteEmail: email.trim().toLowerCase() })
    return `${getInviteBaseUrl()}/?${params.toString()}`
  }

  function formatInviteMessage(email, name) {
    const inviteLink = generateInviteLink(email)

    return `Hello ${name || 'Team Member'},\n\n` +
      `You have been invited to join the PharmacyOS account for ${pharmacyName || 'your pharmacy'}.\n\n` +
      `Please create your account using this email address: ${email}.\n\n` +
      `Click the link below to open PharmacyOS and sign up:\n${inviteLink}\n\n` +
      `If the link does not open automatically, copy and paste it into your browser.\n\n` +
      `Sent by: ${adminEmail || 'Pharmacy Administrator'}`
  }

  function createMailtoLink(email, name) {
    if (!email) return ''
    const subject = `PharmacyOS invitation to join ${pharmacyName || 'your pharmacy'}`
    const body = formatInviteMessage(email, name)
    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  function openDefaultMailClient(email, name) {
    const mailto = createMailtoLink(email, name)
    if (!mailto) return alert('Unable to create the email. Email is required.')
    window.location.href = mailto
  }

  function openGmailCompose(email, name) {
    if (!email) return alert('Enter a valid staff email first.')
    const subject = `PharmacyOS invitation to join ${pharmacyName || 'your pharmacy'}`
    const body = formatInviteMessage(email, name)
    const url = `https://mail.google.com/mail/u/0/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(url, '_blank')
  }

  function openYahooCompose(email, name) {
    if (!email) return alert('Enter a valid staff email first.')
    const subject = `PharmacyOS invitation to join ${pharmacyName || 'your pharmacy'}`
    const body = formatInviteMessage(email, name)
    const url = `https://mail.yahoo.com/d/compose?to=${encodeURIComponent(email)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(url, '_blank')
  }

  function openOutlookCompose(email, name) {
    if (!email) return alert('Enter a valid staff email first.')
    const subject = `PharmacyOS invitation to join ${pharmacyName || 'your pharmacy'}`
    const body = formatInviteMessage(email, name)
    const url = `https://outlook.live.com/owa/?path=/mail/action/compose&to=${encodeURIComponent(email)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(url, '_blank')
  }

  async function saveProfile() {
    setSavingProfile(true)

    const profileUpdate = {
      name: pharmacy.name.trim(),
      location: pharmacy.location.trim(),
      ppb_license: pharmacy.ppb.trim(),
      mpesa_paybill: pharmacy.mpesa.trim(),
      kra_pin: pharmacy.kraPin.trim(),
      daraja_consumer_key: pharmacy.darajaKey.trim(),
      daraja_consumer_secret: pharmacy.darajaSecret.trim(),
      daraja_shortcode: pharmacy.darajaShortcode.trim(),
      daraja_passkey: pharmacy.darajaPasskey.trim(),
    }

    const { error } = await supabase
      .from('pharmacies')
      .update(profileUpdate)
      .eq('id', pharmacyId)

    setSavingProfile(false)

    if (error) alert('Error saving profile: ' + error.message)
    else alert('Pharmacy profile saved.')
  }

  async function saveSystem() {
    setSavingSystem(true)

    const { error } = await supabase
      .from('pharmacies')
      .update({ system_settings: system })
      .eq('id', pharmacyId)

    setSavingSystem(false)

    if (error) alert('Error saving system settings: ' + error.message)
    else alert('System settings saved.')
  }

  async function saveUser() {
    if (!newUser.name.trim()) return alert('Full Name is required')
    if (!newUser.email.trim()) return alert('Email is required')

    const payload = {
      pharmacy_id: pharmacyId,
      name: newUser.name.trim(),
      email: newUser.email.trim().toLowerCase(),
      phone: newUser.phone.trim() || null,
      role: newUser.role,
      approved: !!newUser.approved,
    }

    try {
      if (editingUser) {
        const { error } = await supabase
          .from('web_users')
          .update(payload)
          .eq('id', editingUser.id)

        if (error) throw error
        alert('User updated.')
      } else {
        const { error } = await supabase.from('web_users').insert([payload])
        if (error) throw error
        alert('User added.')
      }

      setShowAddUser(false)
      setEditingUser(null)
      setNewUser(emptyUser)
      await fetchUsers()
    } catch (error) {
      alert('Error: ' + error.message)
    }
  }

  async function approveUser(user) {
    const { error } = await supabase
      .from('web_users')
      .update({ approved: true })
      .eq('id', user.id)

    if (error) return alert('Error approving user: ' + error.message)
    await fetchUsers()
  }

  async function deleteUser(id) {
    if (!window.confirm('Delete this user permanently?')) return

    const { error } = await supabase
      .from('web_users')
      .delete()
      .eq('id', id)
      .eq('pharmacy_id', pharmacyId)

    if (error) return alert('Error deleting user: ' + error.message)

    alert('User deleted.')
    await fetchUsers()
  }

  function startEdit(user) {
    setNewUser({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role || 'Cashier',
      approved: !!user.approved,
    })
    setEditingUser(user)
    setShowAddUser(true)
  }

  async function handleLogout() {
    if (!window.confirm('Sign out from this session?')) return

    const { error } = await supabase.auth.signOut()
    if (error) return alert('Error signing out: ' + error.message)

    window.location.reload()
  }

  async function unlockSettings() {
    if (!settingsPassword) {
      setSettingsLockError('Enter your account password to continue.')
      return
    }

    if (!accountEmail) {
      setSettingsLockError('Unable to determine your account email.')
      return
    }

    setSettingsLoading(true)
    setSettingsLockError('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email: accountEmail,
      password: settingsPassword,
    })

    setSettingsLoading(false)

    if (error) {
      setSettingsLockError(error.message || 'Unable to verify password.')
      return
    }

    if (data?.user) {
      setSettingsUnlocked(true)
      setSettingsPassword('')
    }
  }

  async function sendSettingsReset() {
    if (!accountEmail) {
      setSettingsLockError('Unable to determine your account email.')
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(accountEmail, {
      redirectTo: window.location.origin,
    })

    if (error) {
      setSettingsLockError(error.message || 'Unable to send reset email.')
    } else {
      setSettingsLockError('Reset email sent to ' + accountEmail + '.')
    }
  }

  if (loading) return <div style={styles.loading}>Loading settings...</div>

  if (settingsError) {
    return (
      <div style={styles.page}>
        <div style={styles.topbar}>
          <h2 style={styles.title}>Settings</h2>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Unable to load settings</div>
          <p style={styles.infoText}>{settingsError}</p>
        </div>
      </div>
    )
  }

  if (!canManageSettings) {
    return (
      <div style={styles.page}>
        <div style={styles.topbar}>
          <h2 style={styles.title}>Settings</h2>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Access Restricted</div>
          <p style={styles.infoText}>
            Only an approved pharmacy administrator or the account owner who created this pharmacy can manage settings, add users, and approve staff.
          </p>
          <p style={styles.infoText}>
            If you need access, ask the pharmacy owner to assign you the Administrator role and approve your account.
          </p>
        </div>
      </div>
    )
  }

  if (!settingsUnlocked) {
    return (
      <div style={styles.page}>
        <div style={styles.topbar}>
          <h2 style={styles.title}>Settings</h2>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Administrator settings access</div>
          <p style={styles.infoText}>
            Enter your account password to open Settings. This protects the Settings page only; other app screens remain accessible.
          </p>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <div style={styles.pinRow}>
              <input
                type={showSettingsPassword ? 'text' : 'password'}
                style={{ ...styles.input, marginRight: '8px' }}
                value={settingsPassword}
                onChange={event => setSettingsPassword(event.target.value)}
              />
              <button type="button" style={styles.btnToggle} onClick={() => setShowSettingsPassword(value => !value)}>
                {showSettingsPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {settingsLockError && <div style={styles.errorBox}>{settingsLockError}</div>}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button style={styles.btnPrimary} onClick={unlockSettings} disabled={settingsLoading}>
              {settingsLoading ? 'Verifying...' : 'Unlock Settings'}
            </button>
            <button style={styles.btnSecondary} onClick={sendSettingsReset}>
              Forgot password?
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <h2 style={styles.title}>Settings</h2>
      </div>

      <div style={styles.twoCol}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Pharmacy Profile</div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Pharmacy Name</label>
            <input
              style={styles.input}
              value={pharmacy.name}
              onChange={event => setPharmacy({ ...pharmacy, name: event.target.value })}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Location</label>
            <input
              style={styles.input}
              value={pharmacy.location}
              onChange={event => setPharmacy({ ...pharmacy, location: event.target.value })}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>PPB License No.</label>
            <input
              style={styles.input}
              value={pharmacy.ppb}
              onChange={event => setPharmacy({ ...pharmacy, ppb: event.target.value })}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>M-Pesa Paybill / Till</label>
            <input
              style={styles.input}
              value={pharmacy.mpesa}
              onChange={event => setPharmacy({ ...pharmacy, mpesa: event.target.value })}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Daraja Consumer Key</label>
            <input
              style={styles.input}
              value={pharmacy.darajaKey}
              onChange={event => setPharmacy({ ...pharmacy, darajaKey: event.target.value })}
              placeholder="From Safaricom Developer Portal"
              disabled={!settingsUnlocked || !canManageSettings}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Daraja Consumer Secret</label>
            <input
              style={styles.input}
              type="password"
              value={pharmacy.darajaSecret}
              onChange={event => setPharmacy({ ...pharmacy, darajaSecret: event.target.value })}
              placeholder="From Safaricom Developer Portal"
              disabled={!settingsUnlocked || !canManageSettings}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>M-Pesa Shortcode / Paybill</label>
            <input
              style={styles.input}
              value={pharmacy.darajaShortcode}
              onChange={event => setPharmacy({ ...pharmacy, darajaShortcode: event.target.value })}
              placeholder="e.g. 174379"
              disabled={!settingsUnlocked || !canManageSettings}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Daraja Passkey</label>
            <input
              style={styles.input}
              type="password"
              value={pharmacy.darajaPasskey}
              onChange={event => setPharmacy({ ...pharmacy, darajaPasskey: event.target.value })}
              placeholder="From Safaricom Developer Portal"
              disabled={!settingsUnlocked || !canManageSettings}
            />
          </div>

          <div style={{ padding: '10px 14px', background: '#E1F5EE', borderRadius: '8px', fontSize: '12px', color: '#0F6E56', marginTop: '8px', marginBottom: '12px' }}>
            Get these credentials from <strong>developer.safaricom.co.ke</strong> - Create App - Lipa Na M-Pesa Online
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>KRA PIN</label>
            <div style={styles.pinRow}>
              <input
                type={showKraPin ? 'text' : 'password'}
                style={{ ...styles.input, marginRight: '8px' }}
                value={pharmacy.kraPin}
                onChange={event => setPharmacy({ ...pharmacy, kraPin: event.target.value })}
              />
              <button type="button" style={styles.btnToggle} onClick={() => setShowKraPin(value => !value)}>
                {showKraPin ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <button style={styles.btnPrimary} onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>System Settings</div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Low stock alert threshold</label>
            <input
              style={styles.input}
              type="number"
              value={system.lowStockThreshold}
              onChange={event => setSystem({ ...system, lowStockThreshold: event.target.value })}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Expiry warning (days)</label>
            <input
              style={styles.input}
              type="number"
              value={system.expiryWarning}
              onChange={event => setSystem({ ...system, expiryWarning: event.target.value })}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Default currency</label>
            <select
              style={styles.input}
              value={system.currency}
              onChange={event => setSystem({ ...system, currency: event.target.value })}
            >
              <option>KES - Kenyan Shilling</option>
              <option>USD - US Dollar</option>
              <option>UGX - Ugandan Shilling</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Auto morning report</label>
            <select
              style={styles.input}
              value={system.morningReport}
              onChange={event => setSystem({ ...system, morningReport: event.target.value })}
            >
              <option>Enabled - 7:00 AM Mon-Sat</option>
              <option>Enabled - 7:00 AM Daily</option>
              <option>Disabled</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>eTIMS auto-submit</label>
            <select
              style={styles.input}
              value={system.etims}
              onChange={event => setSystem({ ...system, etims: event.target.value })}
            >
              <option>Enabled - every sale</option>
              <option>Enabled - end of day</option>
              <option>Disabled</option>
            </select>
          </div>

          <button style={styles.btnPrimary} onClick={saveSystem} disabled={savingSystem}>
            {savingSystem ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>User Accounts and Roles</div>
        <p style={styles.infoText}>
          Add staff by email, then use one of the webmail buttons to send a full invitation message with the sign-up link.
        </p>
        <p style={styles.fieldNote}>
          Your administrator email is <strong>{adminEmail || 'not available'}</strong>. This will be included in the invite message.
        </p>

        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Phone</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={styles.td}>{currentUserName || pharmacyName || 'Administrator'}</td>
              <td style={styles.td}>{accountEmail || '-'}</td>
              <td style={styles.td}>-</td>
              <td style={styles.td}>{isOwner ? 'Owner / Administrator' : 'Administrator'}</td>
              <td style={styles.td}>
                <span style={{ ...styles.pill, background: '#E1F5EE', color: '#0F6E56' }}>
                  Approved
                </span>
              </td>
              <td style={styles.td}>
                <span style={{ fontSize: '11px', color: '#888' }}>You</span>
              </td>
            </tr>

            {visibleUsers.map(user => (
              <tr key={user.id}>
                <td style={styles.td}>{user.name}</td>
                <td style={styles.td}>{user.email || '-'}</td>
                <td style={styles.td}>{user.phone || '-'}</td>
                <td style={styles.td}>{user.role || 'Cashier'}</td>
                <td style={styles.td}>
                  <span
                    style={{
                      ...styles.pill,
                      background: user.approved ? '#E1F5EE' : '#FEF3F2',
                      color: user.approved ? '#0F6E56' : '#B91C1C',
                    }}
                  >
                    {user.approved ? 'Approved' : 'Pending approval'}
                  </span>
                </td>
                <td style={styles.td}>
                  <button style={styles.btnSecondary} onClick={() => openGmailCompose(user.email, user.name)}>
                    Gmail
                  </button>
                  <button style={styles.btnSecondary} onClick={() => openYahooCompose(user.email, user.name)}>
                    Yahoo
                  </button>
                  <button style={styles.btnSecondary} onClick={() => openOutlookCompose(user.email, user.name)}>
                    Outlook
                  </button>
                  <button style={styles.btnSecondary} onClick={() => openDefaultMailClient(user.email, user.name)}>
                    Mailto
                  </button>
                  {!user.approved && (
                    <button style={styles.btnApprove} onClick={() => approveUser(user)}>
                      Approve
                    </button>
                  )}
                  <button style={styles.btnEdit} onClick={() => startEdit(user)}>Edit</button>
                  <button style={styles.btnDelete} onClick={() => deleteUser(user.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button style={{ ...styles.btnPrimary, marginTop: '14px' }} onClick={() => setShowAddUser(true)}>
          + Add User
        </button>
      </div>

      <div style={styles.logoutSection}>
        <button onClick={handleLogout} style={styles.logoutBtn}>Sign Out</button>
        <p style={styles.logoutText}>
          Signed in as <strong>{currentUserName || pharmacyName || 'Administrator'}</strong>
        </p>
      </div>

      {showAddUser && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>{editingUser ? 'Edit User' : 'Add New User'}</h3>

            <div style={styles.formGroup}>
              <label style={styles.label}>Full Name</label>
              <input
                style={styles.input}
                value={newUser.name}
                onChange={event => setNewUser({ ...newUser, name: event.target.value })}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Email Address</label>
              <input
                style={styles.input}
                type="email"
                value={newUser.email}
                onChange={event => setNewUser({ ...newUser, email: event.target.value })}
                placeholder="staff@pharmacy.co.ke"
              />
              <div style={styles.fieldNote}>
                This email is used to link the invited staff member to your pharmacy when they sign up.
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Phone Number</label>
              <input
                style={styles.input}
                value={newUser.phone}
                onChange={event => setNewUser({ ...newUser, phone: event.target.value })}
                placeholder="0712 345 678"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Role</label>
              <select
                style={styles.input}
                value={newUser.role}
                onChange={event => setNewUser({ ...newUser, role: event.target.value })}
              >
                <option>Administrator</option>
                <option>HR</option>
                <option>Pharmacist</option>
                <option>Cashier</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Approved</label>
              <select
                style={styles.input}
                value={newUser.approved ? 'yes' : 'no'}
                onChange={event => setNewUser({ ...newUser, approved: event.target.value === 'yes' })}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>

            <div style={styles.modalFooter}>
              <button
                style={styles.btnSecondary}
                onClick={() => {
                  setShowAddUser(false)
                  setEditingUser(null)
                  setNewUser(emptyUser)
                }}
              >
                Cancel
              </button>
              {newUser.email && !editingUser && (
                <>
                  <button style={styles.btnSecondary} onClick={() => openGmailCompose(newUser.email, newUser.name)}>
                    Gmail
                  </button>
                  <button style={styles.btnSecondary} onClick={() => openYahooCompose(newUser.email, newUser.name)}>
                    Yahoo
                  </button>
                  <button style={styles.btnSecondary} onClick={() => openOutlookCompose(newUser.email, newUser.name)}>
                    Outlook
                  </button>
                  <button style={styles.btnSecondary} onClick={() => openDefaultMailClient(newUser.email, newUser.name)}>
                    Mailto
                  </button>
                </>
              )}
              <button style={styles.btnPrimary} onClick={saveUser}>
                {editingUser ? 'Update User' : 'Add User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
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
  th: { textAlign: 'left', padding: '8px 10px', color: '#888', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e8ebe8' },
  td: { padding: '10px', borderBottom: '1px solid #f0f2f0', color: '#222' },
  pill: { padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '500' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' },
  btnSecondary: { background: '#fff', color: '#333', border: '1px solid #ddd', padding: '8px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  btnEdit: { background: '#0F6E56', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', marginRight: '6px' },
  btnDelete: { background: '#E24B4A', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' },
  btnApprove: {
    background: '#0F6E56',
    color: '#fff',
    border: 'none',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    cursor: 'pointer',
    marginRight: '6px',
  },
  pinRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  btnToggle: {
    background: '#f3f4f6',
    color: '#111827',
    border: '1px solid #d1d5db',
    borderRadius: '7px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  fieldNote: { fontSize: '11px', color: '#6b7280', marginTop: '4px' },
  loading: { padding: '80px', textAlign: 'center', color: '#666', fontSize: '16px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '10px', padding: '24px', width: '480px' },
  modalTitle: { fontSize: '16px', fontWeight: '600', marginBottom: '16px' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', flexWrap: 'wrap' },
  logoutSection: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '20px', textAlign: 'center', marginTop: '20px' },
  logoutBtn: { background: '#E24B4A', color: '#fff', border: 'none', padding: '12px 32px', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' },
  logoutText: { marginTop: '12px', fontSize: '13px', color: '#666' },
  infoText: { fontSize: '13px', color: '#444', lineHeight: '1.6', marginBottom: '12px' },
  errorBox: { border: '1px solid #F8D7DA', background: '#FEF2F2', color: '#B91C1C', borderRadius: '8px', padding: '10px', marginBottom: '14px' },
}
