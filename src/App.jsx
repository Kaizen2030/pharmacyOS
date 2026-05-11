import { useEffect, useMemo, useState } from 'react'
import { PharmacyContext } from './context'
import supabase from './supabase'
import Dashboard from './screens/Dashboard'
import Inventory from './screens/Inventory'
import Sales from './screens/Sales'
import Patients from './screens/Patients'
import Shifts from './screens/Shifts'
import Suppliers from './screens/Suppliers'
import Expiry from './screens/Expiry'
import Credit from './screens/Credit'
import Prescriptions from './screens/Prescriptions'
import Mpesa from './screens/Mpesa'
import Claims from './screens/Claims'
import Insurance from './screens/Insurance'
import Etims from './screens/Etims'
import Branches from './screens/Branches'
import AI from './screens/AI'
import Reports from './screens/Reports'
import Settings from './screens/Settings'
import Login from './screens/Login'
import ToastViewport from './components/ToastViewport'
import { canAccessScreen, getScreenRestrictionMessage } from './access'
import { getLastKnownConnectivity, isOnline } from './connectivity'
import { notifySuccess, notifyWarning } from './notifications'
import { syncPendingSales } from './sync'
import { findStaffByPin } from './utils/pin'

const navGroups = [
  { label: 'OVERVIEW', items: [{ id: 'dashboard', label: 'Dashboard', icon: '' }] },
  {
    label: 'OPERATIONS',
    items: [
      { id: 'inventory', label: 'Inventory', icon: '' },
      { id: 'sales', label: 'Sales & POS', icon: '' },
      { id: 'patients', label: 'Patients', icon: '' },
      { id: 'shifts', label: 'Shifts', icon: '' },
      { id: 'suppliers', label: 'Suppliers', icon: '' },
      { id: 'expiry', label: 'Expiry Alerts', icon: '' },
      { id: 'credit', label: 'Credit & Debts', icon: '' },
      { id: 'prescriptions', label: 'Prescriptions', icon: '' },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { id: 'mpesa', label: 'M-Pesa', icon: '' },
      { id: 'claims', label: 'SHA Claims', icon: '' },
      { id: 'insurance', label: 'Insurance Claims', icon: '' },
      { id: 'etims', label: 'eTIMS / KRA', icon: '' },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { id: 'branches', label: 'Branches', icon: '' },
      { id: 'ai', label: 'AI Drug Advisor', icon: '' },
      { id: 'reports', label: 'Reports', icon: '' },
      { id: 'settings', label: 'Settings', icon: '' },
    ],
  },
]

const screenComponents = {
  dashboard: Dashboard,
  inventory: Inventory,
  sales: Sales,
  patients: Patients,
  shifts: Shifts,
  suppliers: Suppliers,
  expiry: Expiry,
  credit: Credit,
  prescriptions: Prescriptions,
  mpesa: Mpesa,
  claims: Claims,
  insurance: Insurance,
  etims: Etims,
  branches: Branches,
  ai: AI,
  reports: Reports,
  settings: Settings,
}

export default function App() {
  const [user, setUser] = useState(null)
  const [userId, setUserId] = useState(null)
  const [userRole, setUserRole] = useState('Cashier')
  const [userApproved, setUserApproved] = useState(false)
  const [pharmacyId, setPharmacyId] = useState(null)
  const [pharmacyName, setPharmacyName] = useState('')
  const [pharmacyLicense, setPharmacyLicense] = useState('')
  const [pharmacyOwnerEmail, setPharmacyOwnerEmail] = useState('')
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const [currentUserName, setCurrentUserName] = useState('')
  const [authenticatedStaff, setAuthenticatedStaff] = useState(null)
  const [activePosStaff, setActivePosStaff] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [screen, setScreen] = useState('dashboard')
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [expiryBadge, setExpiryBadge] = useState(0)
  const [online, setOnline] = useState(getLastKnownConnectivity())
  const [showStaffPinModal, setShowStaffPinModal] = useState(false)
  const [staffPin, setStaffPin] = useState('')
  const [staffSwitchLoading, setStaffSwitchLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const nativeAlert = window.alert
    window.alert = (message) => {
      notifyWarning(String(message || 'Something needs your attention.'), {
        title: 'Notice',
        duration: 4200,
      })
    }

    return () => {
      window.alert = nativeAlert
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        setUserId(session.user.id)
        setCurrentUserEmail(session.user.email?.trim().toLowerCase() || '')
        fetchPharmacyId(session.user)
      } else {
        setCheckingAuth(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
        setUser(null)
        setCurrentUserEmail('')
        setCheckingAuth(false)
        return
      }

      if (event === 'SIGNED_IN' && !isPasswordRecovery && session?.user) {
        setUser(session.user)
        setUserId(session.user.id)
        setCurrentUserEmail(session.user.email?.trim().toLowerCase() || '')
        fetchPharmacyId(session.user)
      }

      if (event === 'SIGNED_OUT') {
        setUser(null)
        setUserId(null)
        setCurrentUserEmail('')
        setCurrentUserName('')
        setUserRole('Cashier')
        setUserApproved(false)
        setPharmacyId(null)
        setPharmacyName('')
        setPharmacyLicense('')
        setPharmacyOwnerEmail('')
        setAuthenticatedStaff(null)
        setActivePosStaff(null)
        setIsPasswordRecovery(false)
        setExpiryBadge(0)
        setScreen('dashboard')
      }
    })

    return () => subscription.unsubscribe()
  }, [isPasswordRecovery])

  useEffect(() => {
    let active = true
    let hasInitialProbe = false
    let lastStatus = getLastKnownConnectivity()

    async function refreshConnectivity(force = false) {
      const reachable = await isOnline({ force })
      if (!active) return

      setOnline(reachable)

      if (!hasInitialProbe) {
        hasInitialProbe = true
        lastStatus = reachable
        if (reachable) {
          syncPendingSales().catch(error => console.error('Initial pending sales sync failed:', error))
        }
        return
      }

      if (reachable && !lastStatus) {
        notifySuccess('Connection restored. Pending sales are syncing now.', {
          title: 'Back online',
          duration: 3200,
        })
        syncPendingSales().catch(error => console.error('Pending sales sync failed:', error))
      }

      if (!reachable && lastStatus) {
        notifyWarning('Internet looks unavailable. New sales will save locally until the connection returns.', {
          title: 'Offline mode',
          duration: 4200,
        })
      }

      lastStatus = reachable
    }

    function handleBrowserOffline() {
      if (lastStatus) {
        notifyWarning('Internet looks unavailable. New sales will save locally until the connection returns.', {
          title: 'Offline mode',
          duration: 4200,
        })
      }

      setOnline(false)
      lastStatus = false
    }

    function handleBrowserOnline() {
      refreshConnectivity(true).catch(error => console.error('Connectivity refresh failed:', error))
    }

    window.addEventListener('online', handleBrowserOnline)
    window.addEventListener('offline', handleBrowserOffline)
    const intervalId = window.setInterval(() => {
      refreshConnectivity(true).catch(error => console.error('Connectivity poll failed:', error))
    }, 30000)

    refreshConnectivity(true).catch(error => console.error('Initial connectivity probe failed:', error))

    return () => {
      active = false
      window.removeEventListener('online', handleBrowserOnline)
      window.removeEventListener('offline', handleBrowserOffline)
      window.clearInterval(intervalId)
    }
  }, [])

  function buildStaffSession(staffRow, fallback = {}) {
    return {
      id: staffRow?.id || fallback.internalId || null,
      auth_user_id: staffRow?.auth_user_id || fallback.authUserId || null,
      name: staffRow?.name || fallback.name || 'Staff',
      role: staffRow?.role || fallback.role || 'Cashier',
      email: staffRow?.email || fallback.email || '',
      branchPharmacyId: staffRow?.branch_pharmacy_id || fallback.branchPharmacyId || pharmacyId,
      verifiedBy: fallback.verifiedBy || 'password',
    }
  }

  async function fetchPharmacyId(authUser) {
    const email = authUser.email?.trim().toLowerCase()
    const currentUserId = authUser.id
    const fullName = authUser.user_metadata?.full_name || 'Admin'
    setUserId(currentUserId)

    let pid = null
    let pname = ''
    let ownerEmail = ''
    let existingWebUser = null

    const { data: existingWebUserById, error: userByIdError } = await supabase
      .from('web_users')
      .select('id, auth_user_id, pharmacy_id, branch_pharmacy_id, role, approved, email, name')
      .or(`id.eq.${currentUserId},auth_user_id.eq.${currentUserId}`)
      .maybeSingle()

    if (userByIdError) {
      console.error('Error checking web user by id:', userByIdError)
    }

    if (existingWebUserById) {
      existingWebUser = existingWebUserById
    } else {
      const { data: existingWebUserByEmail, error: userByEmailError } = await supabase
        .from('web_users')
        .select('id, auth_user_id, pharmacy_id, branch_pharmacy_id, role, approved, email, name')
        .eq('email', email)
        .maybeSingle()

      if (userByEmailError) {
        console.error('Error checking web user by email:', userByEmailError)
      } else {
        existingWebUser = existingWebUserByEmail
      }
    }

    if (existingWebUser?.pharmacy_id) {
      const { data: pharmacyData, error: pharmacyError } = await supabase
        .from('pharmacies')
        .select('id, name, owner_email')
        .eq('id', existingWebUser.pharmacy_id)
        .single()

      if (pharmacyError) {
        console.error('Error fetching pharmacy for web user:', pharmacyError)
      } else if (pharmacyData) {
        pid = pharmacyData.id
        pname = pharmacyData.name
        ownerEmail = pharmacyData.owner_email || ''
      }

      if (!existingWebUserById) {
        const { data: linkResult, error: linkError } = await supabase.functions.invoke('link-staff-auth', {
          body: {
            auth_user_id: currentUserId,
            email,
            pharmacy_id: existingWebUser.pharmacy_id,
          },
        })

        if (linkError) {
          console.error('Error linking auth user to invited staff record:', linkError)
        } else if (linkResult?.reason === 'linked_to_different_auth') {
          notifyWarning('This staff email is already linked to another login. Ask an administrator to review the staff account.', {
            title: 'Staff link conflict',
            duration: 5200,
          })
        }
      }
    }

    if (!pid) {
      const { data, error } = await supabase
        .from('pharmacies')
        .select('id, name, owner_email')
        .eq('owner_email', email)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching pharmacy:', error)
      }

      if (data) {
        pid = data.id
        pname = data.name
        ownerEmail = data.owner_email || ''
      }
    }

    if (!pid) {
      const defaultName = fullName ? `${fullName}'s Pharmacy` : 'New Pharmacy'
      const { data: newPharmacy, error: createPharmacyError } = await supabase
        .from('pharmacies')
        .insert([{ name: defaultName, owner_email: email, location: 'Kenya' }])
        .select('id, name')
        .single()

      if (createPharmacyError) {
        console.error('Error creating pharmacy:', createPharmacyError)
      }

      if (newPharmacy) {
        pid = newPharmacy.id
        pname = newPharmacy.name
        ownerEmail = email
      }
    }

    if (pid) {
      setPharmacyId(pid)
      setPharmacyName(pname)
      setPharmacyOwnerEmail(ownerEmail)

      const userName = existingWebUser?.name || fullName || email?.split('@')[0] || ''
      setCurrentUserName(userName)

      const { data: pharmacyDetails, error: licenseError } = await supabase
        .from('pharmacies')
        .select('ppb_license')
        .eq('id', pid)
        .single()

      if (licenseError) {
        console.error('Error fetching pharmacy license:', licenseError)
      }

      setPharmacyLicense(pharmacyDetails?.ppb_license || '')

      if (existingWebUser) {
        const resolvedRole = existingWebUser.role || 'Cashier'
        setUserRole(resolvedRole)
        setUserApproved(existingWebUser.approved ?? false)
        const defaultStaff = buildStaffSession(existingWebUser, {
          authUserId: currentUserId,
          name: userName,
          role: resolvedRole,
          email,
          branchPharmacyId: existingWebUser.branch_pharmacy_id || pid,
          verifiedBy: 'password',
        })

        setAuthenticatedStaff(defaultStaff)
        setActivePosStaff(defaultStaff)
      } else {
        const defaultRole = ownerEmail === email ? 'Administrator' : 'Pharmacist'
        const defaultApproved = defaultRole === 'Administrator'
        const defaultName = fullName || email?.split('@')[0] || 'Staff'

        const { data: createdWebUser, error: insertError } = await supabase
          .from('web_users')
          .insert([{
            pharmacy_id: pid,
            auth_user_id: currentUserId,
            name: defaultName,
            email,
            role: defaultRole,
            approved: defaultApproved,
          }])
          .select('id, auth_user_id, branch_pharmacy_id, role, approved, email, name')
          .single()

        if (insertError) {
          console.error('Error creating web user:', insertError)
        }

        setUserRole(defaultRole)
        setUserApproved(defaultApproved)
        setCurrentUserName(defaultName)

        const defaultStaff = buildStaffSession(createdWebUser, {
          internalId: createdWebUser?.id || null,
          authUserId: currentUserId,
          name: defaultName,
          role: defaultRole,
          email,
          branchPharmacyId: createdWebUser?.branch_pharmacy_id || pid,
          verifiedBy: 'password',
        })

        setAuthenticatedStaff(defaultStaff)
        setActivePosStaff(defaultStaff)
      }
    }

    setCheckingAuth(false)
  }

  async function handleLogin(authUser) {
    setUser(authUser)
    await fetchPharmacyId(authUser)
  }

  async function handleLogout() {
    if (!window.confirm('Sign out from this session?')) return

    await supabase.auth.signOut()
    setUser(null)
    setCurrentUserEmail('')
    setPharmacyId(null)
    setPharmacyName('')
    setPharmacyLicense('')
    setPharmacyOwnerEmail('')
    setAuthenticatedStaff(null)
    setActivePosStaff(null)
    setScreen('dashboard')
    setExpiryBadge(0)
  }

  async function switchActiveStaffWithPin() {
    if (!pharmacyId) return alert('No pharmacy selected. Please sign in again.')
    if (!/^\d{4}$/.test(staffPin)) return alert('Enter a valid 4-digit PIN.')

    setStaffSwitchLoading(true)

    const { data, error } = await findStaffByPin(pharmacyId, staffPin)

    setStaffSwitchLoading(false)

    if (error) return alert('Unable to verify PIN: ' + error.message)
    if (!data || data.length === 0) return alert('PIN not found. Ask admin to check the staff PIN in Settings.')
    if (data.length > 1) return alert('This PIN is assigned to multiple staff. Please set unique staff PINs in Settings.')

    const staff = data[0]
    setActivePosStaff({
      id: staff.id,
      auth_user_id: staff.auth_user_id || null,
      name: staff.name || staff.email || 'Staff',
      role: staff.role || 'Cashier',
      email: staff.email || '',
      branchPharmacyId: staff.branch_pharmacy_id || pharmacyId,
      verifiedBy: 'pin',
    })
    setShowStaffPinModal(false)
    setStaffPin('')
  }

  function useSignedInAccount() {
    if (!authenticatedStaff) return
    setActivePosStaff(authenticatedStaff)
  }

  const isOwner = currentUserEmail && pharmacyOwnerEmail && currentUserEmail === pharmacyOwnerEmail
  const isAdmin = userRole === 'Administrator'
  const canManagePharmacySettings = Boolean(isOwner || (isAdmin && userApproved))
  const screenIsAllowed = canAccessScreen({ screenId: screen, isOwner, userRole, userApproved })
  const screenRestrictionMessage = getScreenRestrictionMessage({ screenId: screen, isOwner, userRole, userApproved })

  const visibleNavGroups = useMemo(() => (
    navGroups
      .map(group => ({
        ...group,
        items: group.items.filter(item => canAccessScreen({ screenId: item.id, isOwner, userRole, userApproved })),
      }))
      .filter(group => group.items.length > 0)
  ), [isOwner, userApproved, userRole])

  const ActiveScreen = screenComponents[screen]

  if (checkingAuth) {
    return (
      <>
        <div style={styles.loadingShell}>
          <div style={styles.loadingCard}>
            <div style={styles.loadingIcon}>Rx</div>
            <p style={styles.loadingText}>Loading PharmacyOS...</p>
          </div>

          {showStaffPinModal && (
            <div style={styles.overlay}>
              <div style={styles.modal}>
                <h3 style={styles.modalTitle}>Switch Active Staff</h3>
                <p style={styles.modalText}>
                  Enter the 4-digit PIN for the staff member taking over this session. Sales, shifts, claims,
                  prescriptions, and credit entries will use that identity.
                </p>
                <input
                  style={styles.modalInput}
                  type="password"
                  maxLength={4}
                  value={staffPin}
                  onChange={event => setStaffPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="4-digit PIN"
                />
                <div style={styles.modalActions}>
                  <button
                    style={styles.modalSecondaryBtn}
                    onClick={() => {
                      setShowStaffPinModal(false)
                      setStaffPin('')
                    }}
                  >
                    Cancel
                  </button>
                  <button style={styles.modalPrimaryBtn} onClick={switchActiveStaffWithPin} disabled={staffSwitchLoading}>
                    {staffSwitchLoading ? 'Switching...' : 'Switch Staff'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <ToastViewport />
      </>
    )
  }

  if (!user) {
    return (
      <>
        <Login onLogin={handleLogin} isPasswordRecovery={isPasswordRecovery} onResetDone={() => setIsPasswordRecovery(false)} />
        <ToastViewport />
      </>
    )
  }

  return (
    <>
      <PharmacyContext.Provider value={{
        pharmacyId,
        pharmacyName,
        pharmacyLicense,
        pharmacyOwnerEmail,
        currentUserEmail,
        currentUserName,
        authenticatedStaff,
        activePosStaff,
        setActivePosStaff,
        isOwner,
        isAdmin,
        canManagePharmacySettings,
        userId,
        userRole,
        userApproved,
        expiryBadge,
        setExpiryBadge,
      }}>
        <div style={styles.container}>
          <div style={styles.sidebar}>
            <div style={styles.logoArea}>
              <div style={styles.logoIcon}>Rx</div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <h1 style={styles.logoText}>PharmacyOS</h1>
                <p style={styles.logoSub} title={pharmacyName}>
                  {pharmacyName || 'Dispensary Manager'}
                </p>
              </div>
            </div>

            {!online && (
              <div style={styles.offlineBanner}>
                Offline - sales are being saved locally
              </div>
            )}

            <nav style={styles.nav}>
              {visibleNavGroups.map(group => (
                <div key={group.label} style={styles.navSection}>
                  <div style={styles.navSectionTitle}>{group.label}</div>
                  {group.items.map(item => (
                    <div
                      key={item.id}
                      onClick={() => setScreen(item.id)}
                      style={{
                        ...styles.navItem,
                        ...(screen === item.id ? styles.navItemActive : {}),
                      }}
                    >
                      <span style={styles.navIcon}>{item.icon}</span>
                      <span>{item.label}</span>
                      {item.id === 'expiry' && expiryBadge > 0 && (
                        <span style={styles.navBadge}>{expiryBadge}</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </nav>

            <div style={styles.staffSessionCard}>
              <div style={styles.staffSessionLabel}>Active POS Staff</div>
              <div style={styles.staffSessionName}>
                {activePosStaff?.name || currentUserName || 'Not set'}
              </div>
              <div style={styles.staffSessionMeta}>
                {(activePosStaff?.role || userRole || 'Cashier')} | {activePosStaff?.verifiedBy === 'pin' ? 'PIN verified' : 'Signed-in account'}
              </div>
              <div style={styles.staffSessionActions}>
                <button style={styles.staffSessionBtn} onClick={() => setShowStaffPinModal(true)}>
                  Switch PIN
                </button>
                {authenticatedStaff && activePosStaff?.id !== authenticatedStaff.id && (
                  <button style={styles.staffSessionGhostBtn} onClick={useSignedInAccount}>
                    Use My Account
                  </button>
                )}
              </div>
            </div>

            <div style={styles.userBar}>
              <div style={styles.avatar}>
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div style={styles.userInfo}>
                <div style={styles.userName}>
                  {user?.user_metadata?.full_name || 'Admin User'}
                </div>
                <div style={styles.userRole}>
                  {pharmacyName || user?.email || 'Administrator'}
                </div>
              </div>
              <button onClick={handleLogout} style={styles.logoutBtn} title="Sign Out">Out</button>
            </div>
          </div>

          <div style={styles.main}>
            {ActiveScreen && screenIsAllowed && <ActiveScreen />}

            {ActiveScreen && !screenIsAllowed && (
              <div style={styles.restrictedState}>
                <div style={styles.restrictedCard}>
                  <div style={styles.restrictedEyebrow}>Access Restricted</div>
                  <h2 style={styles.restrictedTitle}>You do not currently have access to this screen.</h2>
                  <p style={styles.restrictedText}>
                    {screenRestrictionMessage || 'Please contact a pharmacy administrator if this looks incorrect.'}
                  </p>
                  <button style={styles.restrictedButton} onClick={() => setScreen('dashboard')}>
                    Return to Dashboard
                  </button>
                </div>
              </div>
            )}

            {!ActiveScreen && (
              <div style={styles.comingSoon}>
                <span style={styles.comingIcon}>Soon</span>
                <p style={styles.comingText}>{screen.toUpperCase()} - Coming Soon</p>
              </div>
            )}
          </div>
        </div>

        {showStaffPinModal && (
          <div style={styles.overlay}>
            <div style={styles.modal}>
              <h3 style={styles.modalTitle}>Switch Active Staff</h3>
              <p style={styles.modalText}>
                Enter the 4-digit PIN for the staff member taking over this session. Sales, shifts, claims,
                prescriptions, and credit entries will use that identity.
              </p>
              <input
                style={styles.modalInput}
                type="password"
                maxLength={4}
                value={staffPin}
                onChange={event => setStaffPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4-digit PIN"
              />
              <div style={styles.modalActions}>
                <button
                  style={styles.modalSecondaryBtn}
                  onClick={() => {
                    setShowStaffPinModal(false)
                    setStaffPin('')
                  }}
                >
                  Cancel
                </button>
                <button style={styles.modalPrimaryBtn} onClick={switchActiveStaffWithPin} disabled={staffSwitchLoading}>
                  {staffSwitchLoading ? 'Switching...' : 'Switch Staff'}
                </button>
              </div>
            </div>
          </div>
        )}
      </PharmacyContext.Provider>
      <ToastViewport />
    </>
  )
}

const styles = {
  loadingShell: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f0' },
  loadingCard: { textAlign: 'center' },
  loadingIcon: { fontSize: '40px', fontWeight: '700', color: '#0F6E56', marginBottom: '12px' },
  loadingText: { color: '#888', margin: 0 },
  container: { display: 'flex', height: '100vh', background: '#f0f2f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  sidebar: { width: '210px', background: '#0F6E56', color: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  logoArea: { padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', gap: '10px' },
  logoIcon: { fontSize: '24px', fontWeight: '700', width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: '15px', fontWeight: '600', margin: 0, letterSpacing: '0.3px' },
  logoSub: { fontSize: '10px', color: 'rgba(255,255,255,0.5)', margin: 0 },
  offlineBanner: { background: '#E09B00', color: '#fff', padding: '6px 12px', fontSize: '11px', textAlign: 'center' },
  nav: { flex: 1, overflowY: 'auto', padding: '8px 0' },
  navSection: { marginBottom: '8px' },
  navSectionTitle: { fontSize: '9px', color: 'rgba(255,255,255,0.35)', padding: '12px 16px 4px', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.8px' },
  navItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', fontSize: '13px', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', borderLeft: '3px solid transparent' },
  navItemActive: { background: 'rgba(255,255,255,0.14)', color: '#fff', borderLeft: '3px solid #9FE1CB', fontWeight: '500' },
  navIcon: { fontSize: '15px', width: '18px' },
  navBadge: { marginLeft: 'auto', background: '#E24B4A', color: '#fff', fontSize: '10px', padding: '1px 6px', borderRadius: '99px' },
  staffSessionCard: { margin: '8px 16px 0', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '10px', padding: '12px' },
  staffSessionLabel: { fontSize: '10px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '6px' },
  staffSessionName: { fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  staffSessionMeta: { fontSize: '11px', color: 'rgba(255,255,255,0.72)', lineHeight: 1.4 },
  staffSessionActions: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' },
  staffSessionBtn: { background: '#9FE1CB', color: '#0F6E56', border: 'none', borderRadius: '7px', padding: '7px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' },
  staffSessionGhostBtn: { background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '7px', padding: '7px 10px', fontSize: '11px', cursor: 'pointer' },
  userBar: { marginTop: 'auto', padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', gap: '10px' },
  avatar: { width: '30px', height: '30px', borderRadius: '50%', background: '#9FE1CB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600', color: '#0F6E56' },
  userInfo: { flex: 1, overflow: 'hidden' },
  userName: { fontSize: '12px', color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  userRole: { fontSize: '10px', color: 'rgba(255,255,255,0.5)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  logoutBtn: { background: '#E24B4A', color: '#fff', border: 'none', width: '40px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  main: { flex: 1, overflowY: 'auto', background: '#f7f8f7' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 },
  modal: { background: '#fff', borderRadius: '12px', padding: '24px', width: '420px', maxWidth: '92vw', boxShadow: '0 24px 48px rgba(15,110,86,0.18)' },
  modalTitle: { margin: '0 0 10px', fontSize: '16px', fontWeight: '600', color: '#111' },
  modalText: { margin: '0 0 14px', fontSize: '13px', color: '#4B5563', lineHeight: 1.5 },
  modalInput: { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '14px', marginBottom: '16px' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
  modalPrimaryBtn: { background: '#0F6E56', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' },
  modalSecondaryBtn: { background: '#fff', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '8px', padding: '10px 16px', fontSize: '12px', cursor: 'pointer' },
  comingSoon: { height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#888' },
  comingIcon: { fontSize: '18px', fontWeight: '700', marginBottom: '12px' },
  comingText: { fontSize: '15px' },
  restrictedState: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px' },
  restrictedCard: { width: 'min(560px, 100%)', background: '#fff', borderRadius: '16px', border: '1px solid #D8E1DC', padding: '28px', boxShadow: '0 24px 60px rgba(15,110,86,0.08)' },
  restrictedEyebrow: { fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0F6E56', marginBottom: '10px' },
  restrictedTitle: { margin: '0 0 12px', fontSize: '22px', color: '#122019' },
  restrictedText: { margin: '0 0 18px', fontSize: '14px', lineHeight: 1.6, color: '#4B5563' },
  restrictedButton: { background: '#0F6E56', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' },
}
