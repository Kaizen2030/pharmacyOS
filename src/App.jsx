import { useState, useEffect } from 'react'
import { PharmacyContext } from './context'
import supabase from './supabase'
import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import Inventory from './screens/Inventory'
import Sales from './screens/Sales'
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
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [screen, setScreen] = useState('dashboard')
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [expiryBadge, setExpiryBadge] = useState(0)

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

      if (event === 'SIGNED_IN' && !isPasswordRecovery) {
        setUser(session.user)
        setUserId(session.user.id)
        setCurrentUserEmail(session.user.email?.trim().toLowerCase() || '')
        fetchPharmacyId(session.user)
      }

      if (event === 'SIGNED_OUT') {
        setUser(null)
        setUserId(null)
        setCurrentUserEmail('')
        setUserRole('Cashier')
        setUserApproved(false)
        setPharmacyId(null)
        setPharmacyName('')
        setIsPasswordRecovery(false)
        setExpiryBadge(0)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

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
      .select('id, pharmacy_id, role, approved, email')
      .eq('id', currentUserId)
      .maybeSingle()

    if (userByIdError) {
      console.error('Error checking web user by id:', userByIdError)
    }

    if (existingWebUserById) {
      existingWebUser = existingWebUserById
    } else {
      const { data: existingWebUserByEmail, error: userByEmailError } = await supabase
        .from('web_users')
        .select('id, pharmacy_id, role, approved, email')
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

      if (!existingWebUserById && existingWebUser.id !== currentUserId) {
        const { error: assignError } = await supabase
          .from('web_users')
          .update({ id: currentUserId })
          .eq('id', existingWebUser.id)
          .eq('pharmacy_id', existingWebUser.pharmacy_id)

        if (assignError) {
          console.error('Error assigning auth id to invited web user:', assignError)
        }
      }
    }

    let existingPharmacy = null
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
        existingPharmacy = data
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
        setUserRole(existingWebUser.role || 'Cashier')
        setUserApproved(existingWebUser.approved ?? false)
      } else {
        const defaultRole = ownerEmail === email ? 'Administrator' : 'Pharmacist'
        const defaultApproved = defaultRole === 'Administrator'
        const defaultName = fullName || email?.split('@')[0] || 'Staff'
        const { error: insertError } = await supabase.from('web_users').insert([{
          id: currentUserId,
          pharmacy_id: pid,
          name: defaultName,
          email,
          role: defaultRole,
          approved: defaultApproved
        }])

        if (insertError) {
          console.error('Error creating web user:', insertError)
        }

        setUserRole(defaultRole)
        setUserApproved(defaultApproved)
        setCurrentUserName(defaultName)
      }
    }

    setCheckingAuth(false)
  }

  async function handleLogin(authUser) {
    setUser(authUser)
    await fetchPharmacyId(authUser)
  }

  async function handleLogout() {
    if (window.confirm('Sign out from this session?')) {
      await supabase.auth.signOut()
      setUser(null)
      setCurrentUserEmail('')
      setPharmacyId(null)
      setPharmacyName('')
      setScreen('dashboard')
      setExpiryBadge(0)
    }
  }

  const isOwner = currentUserEmail && pharmacyOwnerEmail && currentUserEmail === pharmacyOwnerEmail
  const isAdmin = userRole === 'Administrator'
  const canManagePharmacySettings = Boolean(isOwner || (isAdmin && userApproved))

  if (checkingAuth) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f0' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>💊</div>
          <p style={{ color: '#888' }}>Loading PharmacyOS...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Login onLogin={handleLogin} isPasswordRecovery={isPasswordRecovery} onResetDone={() => setIsPasswordRecovery(false)} />

  const navGroups = [
    { label: 'OVERVIEW', items: [{ id: 'dashboard', label: 'Dashboard', icon: '' }] },
    {
      label: 'OPERATIONS',
      items: [
        { id: 'inventory', label: 'Inventory', icon: '' },
        { id: 'sales', label: 'Sales & POS', icon: '' },
        { id: 'expiry', label: 'Expiry Alerts', icon: '' },
        { id: 'credit', label: 'Credit & Debts', icon: '' },
        { id: 'prescriptions', label: 'Prescriptions', icon: '' },
      ]
    },
    {
      label: 'FINANCE',
      items: [
        { id: 'mpesa', label: 'M-Pesa', icon: '' },
        { id: 'claims', label: 'SHA Claims', icon: '' },
        { id: 'insurance', label: 'Insurance Claims', icon: '' },
        { id: 'etims', label: 'eTIMS / KRA', icon: '' },
      ]
    },
    {
      label: 'ADMIN',
      items: [
        { id: 'branches', label: 'Branches', icon: '' },
        { id: 'ai', label: 'AI Drug Advisor', icon: '' },
        { id: 'reports', label: 'Reports', icon: '' },
        { id: 'settings', label: 'Settings', icon: '' },
      ]
    }
  ]

  return (
    <PharmacyContext.Provider value={{ 
      pharmacyId, 
      pharmacyName,
      pharmacyLicense,
      pharmacyOwnerEmail,
      currentUserEmail,
      currentUserName,
      isOwner,
      isAdmin,
      canManagePharmacySettings,
      userId,
      userRole,
      userApproved,
      expiryBadge,
      setExpiryBadge
    }}>
      <div style={styles.container}>
        <div style={styles.sidebar}>
          <div style={styles.logoArea}>
            <div style={styles.logoIcon}>💊</div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <h1 style={styles.logoText}>PharmacyOS</h1>
              <p style={styles.logoSub} title={pharmacyName}>
                {pharmacyName || 'Dispensary Manager'}
              </p>
            </div>
          </div>

          <nav style={styles.nav}>
            {navGroups.map(group => (
              <div key={group.label} style={styles.navSection}>
                <div style={styles.navSectionTitle}>{group.label}</div>
                {group.items.map(item => (
                  <div
                    key={item.id}
                    onClick={() => setScreen(item.id)}
                    style={{ 
                      ...styles.navItem, 
                      ...(screen === item.id ? styles.navItemActive : {}) 
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
            <button onClick={handleLogout} style={styles.logoutBtn} title="Sign Out">⏻</button>
          </div>
        </div>

        <div style={styles.main}>
          {screen === 'dashboard' && <Dashboard />}
          {screen === 'inventory' && <Inventory />}
          {screen === 'sales' && <Sales />}
          {screen === 'expiry' && <Expiry />}
          {screen === 'credit' && <Credit />}
          {screen === 'prescriptions' && <Prescriptions />}
          {screen === 'mpesa' && <Mpesa />}
          {screen === 'claims' && <Claims />}
          {screen === 'insurance' && <Insurance />}
          {screen === 'etims' && <Etims />}
          {screen === 'branches' && <Branches />}
          {screen === 'ai' && <AI />}
          {screen === 'reports' && <Reports />}
          {screen === 'settings' && <Settings />}

          {!['dashboard','inventory','sales','expiry','credit','prescriptions','mpesa','claims','insurance','etims','branches','ai','reports','settings'].includes(screen) && (
            <div style={styles.comingSoon}>
              <span style={styles.comingIcon}>🚧</span>
              <p style={styles.comingText}>{screen.toUpperCase()} — Coming Soon</p>
            </div>
          )}
        </div>
      </div>
    </PharmacyContext.Provider>
  )
}

const styles = {
  container: { display: 'flex', height: '100vh', background: '#f0f2f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  sidebar: { width: '210px', background: '#0F6E56', color: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  logoArea: { padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', gap: '10px' },
  logoIcon: { fontSize: '28px' },
  logoText: { fontSize: '15px', fontWeight: '600', margin: 0, letterSpacing: '0.3px' },
  logoSub: { fontSize: '10px', color: 'rgba(255,255,255,0.5)', margin: 0 },
  nav: { flex: 1, overflowY: 'auto', padding: '8px 0' },
  navSection: { marginBottom: '8px' },
  navSectionTitle: { fontSize: '9px', color: 'rgba(255,255,255,0.35)', padding: '12px 16px 4px', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.8px' },
  navItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', fontSize: '13px', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', borderLeft: '3px solid transparent' },
  navItemActive: { background: 'rgba(255,255,255,0.14)', color: '#fff', borderLeft: '3px solid #9FE1CB', fontWeight: '500' },
  navIcon: { fontSize: '15px', width: '18px' },
  navBadge: { marginLeft: 'auto', background: '#E24B4A', color: '#fff', fontSize: '10px', padding: '1px 6px', borderRadius: '99px' },
  userBar: { marginTop: 'auto', padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', gap: '10px' },
  avatar: { width: '30px', height: '30px', borderRadius: '50%', background: '#9FE1CB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600', color: '#0F6E56' },
  userInfo: { flex: 1, overflow: 'hidden' },
  userName: { fontSize: '12px', color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  userRole: { fontSize: '10px', color: 'rgba(255,255,255,0.5)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  logoutBtn: { background: '#E24B4A', color: '#fff', border: 'none', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  main: { flex: 1, overflowY: 'auto', background: '#f7f8f7' },
  comingSoon: { height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#888' },
  comingIcon: { fontSize: '60px', marginBottom: '12px' },
  comingText: { fontSize: '15px' }
}
