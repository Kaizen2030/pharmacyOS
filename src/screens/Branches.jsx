import { useEffect, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'

export default function Branches() {
  const { pharmacyId, pharmacyName, isOwner, pharmacyOwnerEmail } = usePharmacy()
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', location: '', branch_name: '' })
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (pharmacyId) fetchBranches()
  }, [pharmacyId])

  async function fetchBranches() {
    const { data } = await supabase
      .from('pharmacies')
      .select('*')
      .eq('parent_pharmacy_id', pharmacyId)
      .order('created_at', { ascending: true })

    setBranches(data || [])
    setLoading(false)
  }

  async function addBranch() {
    if (!form.name || !form.location) return alert('Fill in branch name and location')
    if (!isOwner) return alert('Only the pharmacy owner can add branches')
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('pharmacies')
      .insert([{
        name: form.name,
        location: form.location,
        branch_name: form.branch_name || form.name,
        owner_email: user.email,
        parent_pharmacy_id: pharmacyId,
        is_branch: true
      }])

    if (error) {
      setMsg('Error: ' + error.message)
    } else {
      setMsg('Branch added successfully')
      setForm({ name: '', location: '', branch_name: '' })
      setShowForm(false)
      fetchBranches()
    }

    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  if (loading) return <div style={styles.loading}>Loading branches...</div>

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <h2 style={styles.title}>Branches</h2>
          <p style={styles.sub}>Manage all locations under {pharmacyName}</p>
        </div>
        {isOwner && (
          <button style={styles.btnPrimary} onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Add Branch'}
          </button>
        )}
      </div>

      {msg && <div style={styles.msg}>{msg}</div>}

      {showForm && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>New Branch</div>
          <div style={styles.formGrid}>
            <div>
              <div style={styles.label}>Branch Name</div>
              <input
                style={styles.input}
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Westlands Branch"
              />
            </div>
            <div>
              <div style={styles.label}>Location</div>
              <input
                style={styles.input}
                value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Westlands, Nairobi"
              />
            </div>
          </div>
          <button style={{ ...styles.btnPrimary, marginTop: '12px' }} onClick={addBranch} disabled={saving}>
            {saving ? 'Saving...' : 'Save Branch'}
          </button>
        </div>
      )}

      <div style={styles.card}>
        <div style={styles.cardTitle}>Main Branch</div>
        <div style={styles.branchRow}>
          <div style={styles.branchIcon}>🏪</div>
          <div>
            <div style={styles.branchName}>{pharmacyName}</div>
            <div style={styles.branchSub}>Main / Head Office</div>
          </div>
          <div style={styles.badge}>Main</div>
        </div>
      </div>

      {branches.length === 0 ? (
        <div style={styles.empty}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏬</div>
          <p>No branches added yet. Add your first branch above.</p>
        </div>
      ) : (
        branches.map((b, i) => (
          <div key={b.id} style={styles.card}>
            <div style={styles.branchRow}>
              <div style={styles.branchIcon}>🏪</div>
              <div style={{ flex: 1 }}>
                <div style={styles.branchName}>{b.name}</div>
                <div style={styles.branchSub}>{b.location}</div>
              </div>
              <div style={{ ...styles.badge, background: '#E1F5EE', color: '#0F6E56' }}>Branch {i + 1}</div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

const styles = {
  page: { padding: '18px 22px' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111', margin: 0 },
  sub: { fontSize: '12px', color: '#888', margin: '4px 0 0' },
  card: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '14px 16px', marginBottom: '12px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '12px' },
  branchRow: { display: 'flex', alignItems: 'center', gap: '12px' },
  branchIcon: { fontSize: '24px' },
  branchName: { fontSize: '14px', fontWeight: '500', color: '#111' },
  branchSub: { fontSize: '12px', color: '#888', marginTop: '2px' },
  badge: { background: '#f0f2f0', color: '#555', fontSize: '11px', padding: '3px 10px', borderRadius: '99px', fontWeight: '500' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  label: { fontSize: '11px', color: '#888', marginBottom: '4px' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
  msg: { background: '#E1F5EE', color: '#0F6E56', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '12px' },
  empty: { textAlign: 'center', color: '#888', padding: '40px', fontSize: '13px' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' },
}
