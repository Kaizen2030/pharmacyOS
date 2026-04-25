import { useState, useEffect } from 'react'
import supabase from '../supabase'

export default function Login({ onLogin, isPasswordRecovery, onResetDone }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteDetected, setInviteDetected] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [resetSent, setResetSent] = useState(false)

  useEffect(() => {
    if (isPasswordRecovery) setMode('reset')

    const params = new URLSearchParams(window.location.search)
    const invite = params.get('inviteEmail')
    if (invite) {
      const normalizedInvite = invite.trim().toLowerCase()
      setEmail(normalizedInvite)
      setInviteEmail(normalizedInvite)
      setInviteDetected(true)
      setMode('signup')
    }
  }, [isPasswordRecovery])

  function getErrorMessage(err) {
    if (!err) return ''
    if (typeof err === 'string') return err
    if (err.message) return err.message
    if (err.error_description) return err.error_description
    return 'Something went wrong. Please try again.'
  }

  async function handleLogin() {
    if (!email || !password) return setError('Enter email and password')
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) setError(getErrorMessage(err))
      else onLogin(data.user)
    } catch (e) {
      setError('Login failed: ' + (e.message || 'Unknown error'))
    }
    setLoading(false)
  }

  async function handleSignup() {
    if (!email || !password || !name) return setError('Fill in all fields')
    if (password.length < 6) return setError('Password must be at least 6 characters')
    setLoading(true)
    setError('')

    try {
      const { data: invite, error: inviteError } = await supabase
        .from('web_users')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle()

      if (inviteError) {
        setError(getErrorMessage(inviteError))
        setLoading(false)
        return
      }

      if (!invite) {
        setError('This email has not been invited. Ask your pharmacy admin to add you first.')
        setLoading(false)
        return
      }

      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } }
      })

      if (err) setError(getErrorMessage(err))
      else {
        alert('✅ Account created! Check your email to confirm then log in.')
        setMode('login')
        setName('')
        setEmail('')
        setPassword('')
      }
    } catch (e) {
      setError('Signup failed: ' + (e.message || 'Unknown error'))
    }
    setLoading(false)
  }

  async function handleForgotPassword() {
    if (!email) return setError('Enter your email address')
    setLoading(true)
    setError('')
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'http://localhost:5173'
      })
      if (err) setError(getErrorMessage(err))
      else setResetSent(true)
    } catch (e) {
      setError('Failed to send reset email.')
    }
    setLoading(false)
  }

  async function handleResetPassword() {
    if (!newPassword || !confirmPassword) return setError('Fill in both fields')
    if (newPassword.length < 6) return setError('Password must be at least 6 characters')
    if (newPassword !== confirmPassword) return setError('Passwords do not match')
    setLoading(true)
    setError('')
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPassword })
      if (err) setError(getErrorMessage(err))
      else {
        alert('✅ Password updated! Please sign in with your new password.')
        await supabase.auth.signOut()
        setMode('login')
        setNewPassword('')
        setConfirmPassword('')
        onResetDone()
      }
    } catch (e) {
      setError('Failed to update password.')
    }
    setLoading(false)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoArea}>
          <div style={styles.logoIcon}>💊</div>
          <h1 style={styles.logoText}>PharmacyOS</h1>
          <p style={styles.logoSub}>Dispensary Manager v4.0</p>
        </div>

        {mode !== 'forgot' && mode !== 'reset' && (
          <div style={styles.tabs}>
            <button
              style={{...styles.tab, ...(mode === 'login' ? styles.tabActive : {})}}
              onClick={() => { setMode('login'); setError('') }}>
              Sign In
            </button>
            <button
              style={{...styles.tab, ...(mode === 'signup' ? styles.tabActive : {})}}
              onClick={() => { setMode('signup'); setError('') }}>
              Create Account
            </button>
          </div>
        )}

        {error && <div style={styles.errorBox}>⚠️ {error}</div>}

        {/* RESET PASSWORD */}
        {mode === 'reset' && (
          <>
            <h3 style={styles.modalTitle}>🔐 Set New Password</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>New Password</label>
              <div style={styles.passwordWrapper}>
                <input
                  style={styles.input}
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
                <button type="button" style={styles.eyeBtn} onClick={() => setShowNewPassword(!showNewPassword)}>
                  {showNewPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Confirm Password</label>
              <div style={styles.passwordWrapper}>
                <input
                  style={styles.input}
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
                <button type="button" style={styles.eyeBtn} onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <button style={styles.btnPrimary} onClick={handleResetPassword} disabled={loading}>
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </>
        )}

        {/* FORGOT PASSWORD */}
        {mode === 'forgot' && (
          <>
            <h3 style={styles.modalTitle}>Reset Password</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Email Address</label>
              <input style={styles.input} type="email" placeholder="admin@pharmacy.co.ke" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            {resetSent ? (
              <div style={{ color: '#0F6E56', textAlign: 'center', padding: '20px 0', fontSize: '13px' }}>
                ✅ Reset link sent! Check your email.
              </div>
            ) : (
              <button style={styles.btnPrimary} onClick={handleForgotPassword} disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            )}
            <p style={styles.footerNote}>
              <span style={styles.link} onClick={() => { setMode('login'); setResetSent(false) }}>
                ← Back to Login
              </span>
            </p>
          </>
        )}

        {/* LOGIN / SIGNUP */}
        {(mode === 'login' || mode === 'signup') && (
          <>
            {mode === 'signup' && (
              <div style={styles.formGroup}>
                <label style={styles.label}>Full Name</label>
                <input style={styles.input} placeholder="e.g. Julius Wanjau" value={name} onChange={e => setName(e.target.value)} />
              </div>
            )}

            <div style={styles.formGroup}>
              <label style={styles.label}>Email Address</label>
              <input
                style={styles.input}
                type="email"
                placeholder="admin@pharmacy.co.ke"
                value={email}
                onChange={e => setEmail(e.target.value)}
                readOnly={mode === 'signup' && inviteDetected}
              />
              {mode === 'signup' && (
                <p style={styles.infoText}>
                  {inviteDetected
                    ? 'Invite link detected. This email is locked to the invited address. Ask your pharmacy admin for a new invite if you need a different email.'
                    : 'Sign-up is invite-only. Use the email your pharmacy admin invited, or ask them to send you an invite link.'}
                </p>
              )}
            </div>

            {mode === 'login' && (
              <div style={{ textAlign: 'right', marginBottom: '8px' }}>
                <span style={styles.link} onClick={() => setMode('forgot')}>Forgot Password?</span>
              </div>
            )}

            <div style={styles.formGroup}>
              <label style={styles.label}>Password</label>
              <div style={styles.passwordWrapper}>
                <input
                  style={styles.input}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && mode === 'login' && handleLogin()}
                />
                <button type="button" style={styles.eyeBtn} onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button style={styles.btnPrimary}
              onClick={mode === 'login' ? handleLogin : handleSignup}
              disabled={loading}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>

            <p style={styles.footerNote}>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <span style={styles.link} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
                {mode === 'login' ? 'Create one' : 'Sign in'}
              </span>
            </p>
          </>
        )}

        <p style={styles.version}>PharmacyOS Desktop • Multi-Pharmacy Ready</p>
      </div>
    </div>
  )
}

const styles = {
  page: { height: '100vh', background: '#f0f2f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  card: { background: '#fff', borderRadius: '16px', padding: '40px', width: '420px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #e8ebe8' },
  logoArea: { textAlign: 'center', marginBottom: '24px' },
  logoIcon: { fontSize: '48px', marginBottom: '8px' },
  logoText: { fontSize: '22px', fontWeight: '700', color: '#0F6E56', margin: 0 },
  logoSub: { fontSize: '12px', color: '#888', margin: '4px 0 0' },
  tabs: { display: 'flex', background: '#f0f2f0', borderRadius: '8px', padding: '4px', marginBottom: '20px' },
  tab: { flex: 1, padding: '8px', border: 'none', background: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', color: '#666', fontWeight: '500' },
  tabActive: { background: '#fff', color: '#0F6E56', fontWeight: '600', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
  errorBox: { background: '#FCEBEB', border: '1px solid #F09595', borderRadius: '7px', padding: '10px 14px', fontSize: '12px', color: '#A32D2D', marginBottom: '14px' },
  formGroup: { marginBottom: '14px' },
  label: { fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px', fontWeight: '500' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  passwordWrapper: { position: 'relative' },
  eyeBtn: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '600',
    color: '#0F6E56',
    padding: '4px',
    letterSpacing: '0.5px'
  },
  btnPrimary: { width: '100%', background: '#0F6E56', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginTop: '4px' },
  footerNote: { textAlign: 'center', fontSize: '12px', color: '#888', marginTop: '16px' },
  infoText: { fontSize: '12px', color: '#4b5563', marginTop: '6px' },
  link: { color: '#0F6E56', cursor: 'pointer', fontWeight: '600' },
  version: { textAlign: 'center', fontSize: '10px', color: '#bbb', marginTop: '20px' },
  modalTitle: { fontSize: '15px', fontWeight: '600', color: '#111', marginBottom: '12px' }
}