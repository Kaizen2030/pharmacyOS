import { useEffect, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'

export default function Branches() {
  const { pharmacyId, pharmacyName, isOwner, pharmacyOwnerEmail } = usePharmacy()
  const [branches, setBranches] = useState([])
  const [branchStats, setBranchStats] = useState({}) // { [branchId]: { sales, inventory, shift, staff } }
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [editingBranch, setEditingBranch] = useState(null) // branch object being edited
  const [viewingBranch, setViewingBranch] = useState(null) // branch object being viewed
  const [form, setForm] = useState({ name: '', location: '' })
  const [msg, setMsg] = useState({ text: '', type: '' })
  const [mainStats, setMainStats] = useState({ sales: 0, inventory: 0, shift: null, staff: 0 })

  useEffect(() => {
    if (pharmacyId) {
      fetchBranches()
      fetchMainStats()
    }
  }, [pharmacyId])

  function showMsg(text, type = 'success') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 3500)
  }

  async function fetchBranches() {
    const { data } = await supabase
      .from('pharmacies')
      .select('*')
      .eq('parent_pharmacy_id', pharmacyId)
      .order('created_at', { ascending: true })

    const list = data || []
    setBranches(list)
    setLoading(false)

    // fetch stats for each branch in parallel
    const statsEntries = await Promise.all(list.map(b => fetchBranchStats(b.id)))
    const statsMap = {}
    list.forEach((b, i) => { statsMap[b.id] = statsEntries[i] })
    setBranchStats(statsMap)
  }

  async function fetchBranchStats(bid) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [salesRes, inventoryRes, shiftRes, staffRes] = await Promise.all([
      supabase
        .from('sales_ledger')
        .select('total_kes')
        .eq('pharmacy_id', bid)
        .gte('created_at', today.toISOString()),
      supabase
        .from('inventory')
        .select('id', { count: 'exact', head: true })
        .eq('pharmacy_id', bid),
      supabase
        .from('shifts')
        .select('*')
        .eq('pharmacy_id', bid)
        .eq('status', 'Open')
        .maybeSingle(),
      supabase
        .from('web_users')
        .select('id', { count: 'exact', head: true })
        .eq('pharmacy_id', bid),
    ])

    const todaySales = (salesRes.data || []).reduce((s, r) => s + (parseFloat(r.total_kes) || 0), 0)

    return {
      sales: todaySales,
      inventory: inventoryRes.count || 0,
      shift: shiftRes.data || null,
      staff: staffRes.count || 0,
    }
  }

  async function fetchMainStats() {
    const stats = await fetchBranchStats(pharmacyId)
    setMainStats(stats)
  }

  async function addBranch() {
    if (!form.name || !form.location) return showMsg('Fill in branch name and location', 'error')
    if (!isOwner) return showMsg('Only the pharmacy owner can add branches', 'error')
    setSaving(true)

    const { error } = await supabase
      .from('pharmacies')
      .insert([{
        name: form.name,
        location: form.location,
        branch_name: form.name,
        owner_email: pharmacyOwnerEmail,
        parent_pharmacy_id: pharmacyId,
        is_branch: true
      }])

    if (error) {
      showMsg('Error: ' + error.message, 'error')
    } else {
      showMsg('Branch added successfully ✓')
      setForm({ name: '', location: '' })
      setShowForm(false)
      fetchBranches()
    }
    setSaving(false)
  }

  async function saveBranchEdit() {
    if (!editingBranch.name || !editingBranch.location) return showMsg('Fill in both fields', 'error')
    setSaving(true)

    const { error } = await supabase
      .from('pharmacies')
      .update({ name: editingBranch.name, location: editingBranch.location, branch_name: editingBranch.name })
      .eq('id', editingBranch.id)

    if (error) {
      showMsg('Error: ' + error.message, 'error')
    } else {
      showMsg('Branch updated ✓')
      setEditingBranch(null)
      fetchBranches()
    }
    setSaving(false)
  }

  async function cleanupBranchData(branchId) {
    const cleanupSteps = [
      { table: 'web_users', column: 'branch_pharmacy_id' },
      { table: 'sales_ledger', column: 'pharmacy_id' },
      { table: 'shifts', column: 'pharmacy_id' },
      { table: 'inventory', column: 'pharmacy_id' },
      { table: 'patients', column: 'pharmacy_id' },
      { table: 'credit_sales', column: 'pharmacy_id' },
      { table: 'prescriptions', column: 'pharmacy_id' },
      { table: 'purchase_orders', column: 'pharmacy_id' },
    ]

    for (const step of cleanupSteps) {
      try {
        const { error } = await supabase
          .from(step.table)
          .delete()
          .eq(step.column, branchId)

        if (error) {
          console.warn(`Cleanup warning [${step.table}]:`, error.message || error)
        }
      } catch (error) {
        console.warn(`Cleanup error [${step.table}]:`, error)
      }
    }

    return null
  }

  function promiseWithTimeout(promise, ms, timeoutMessage) {
    let timeoutId
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), ms)
    })

    return Promise.race([promise, timeoutPromise]).finally(() => {
      window.clearTimeout(timeoutId)
    })
  }

  async function deleteBranch(branch) {
    if (!isOwner) return showMsg('Only the owner can delete branches', 'error')
    if (!window.confirm(`Delete "${branch.name}"? This cannot be undone.`)) return
    setDeleting(branch.id)

    try {
      await promiseWithTimeout(
        cleanupBranchData(branch.id),
        25000,
        'Branch cleanup timed out after 25 seconds'
      )

      const { error } = await promiseWithTimeout(
        supabase
          .from('pharmacies')
          .delete()
          .eq('id', branch.id)
          .eq('parent_pharmacy_id', pharmacyId),
        25000,
        'Branch delete timed out after 25 seconds'
      )

      if (error) {
        showMsg('Error deleting branch: ' + error.message, 'error')
      } else {
        showMsg('Branch deleted')
        setBranches(prev => prev.filter(b => b.id !== branch.id))
      }
    } catch (error) {
      console.error('Delete branch failed:', error)
      showMsg('Error deleting branch: ' + (error?.message || 'Unknown error'), 'error')
    } finally {
      setDeleting(null)
    }
  }

  // ── Branch Detail View ─────────────────────────────────────────
  if (viewingBranch) {
    const stats = branchStats[viewingBranch.id] || {}
    return (
      <div style={s.page}>
        <div style={s.topbar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button style={s.backBtn} onClick={() => setViewingBranch(null)}>← Back</button>
            <div>
              <h2 style={s.title}>{viewingBranch.name}</h2>
              <p style={s.sub}>📍 {viewingBranch.location}</p>
            </div>
          </div>
          {stats.shift ? (
            <span style={s.pillOpen}>● Shift Open</span>
          ) : (
            <span style={s.pillClosed}>No Active Shift</span>
          )}
        </div>

        {/* Stats Grid */}
        <div style={s.statsGrid}>
          <div style={s.statCard}>
            <div style={s.statIcon}>💰</div>
            <div style={s.statValue}>KES {(stats.sales || 0).toLocaleString()}</div>
            <div style={s.statLabel}>Today's Sales</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statIcon}>💊</div>
            <div style={s.statValue}>{stats.inventory || 0}</div>
            <div style={s.statLabel}>Inventory Items</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statIcon}>👥</div>
            <div style={s.statValue}>{stats.staff || 0}</div>
            <div style={s.statLabel}>Staff Members</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statIcon}>🕐</div>
            <div style={s.statValue}>{stats.shift ? stats.shift.cashier_name || 'Open' : '—'}</div>
            <div style={s.statLabel}>Active Cashier</div>
          </div>
        </div>

        {/* Shift Details */}
        {stats.shift && (
          <div style={{ ...s.card, borderLeft: '3px solid #0F6E56' }}>
            <div style={s.cardTitle}>Active Shift Details</div>
            <div style={s.shiftGrid}>
              <div>
                <div style={s.label}>Cashier</div>
                <div style={s.val}>{stats.shift.cashier_name || '—'}</div>
              </div>
              <div>
                <div style={s.label}>Opened At</div>
                <div style={s.val}>{new Date(stats.shift.opened_at).toLocaleString('en-GB')}</div>
              </div>
              <div>
                <div style={s.label}>Opening Float</div>
                <div style={s.val}>KES {parseFloat(stats.shift.opening_float || 0).toLocaleString()}</div>
              </div>
            </div>
          </div>
        )}

        <div style={s.card}>
          <div style={s.cardTitle}>Branch Info</div>
          <div style={s.infoGrid}>
            <div>
              <div style={s.label}>Branch ID</div>
              <div style={{ ...s.val, fontSize: '11px', color: '#999', fontFamily: 'monospace' }}>{viewingBranch.id}</div>
            </div>
            <div>
              <div style={s.label}>Created</div>
              <div style={s.val}>{viewingBranch.created_at ? new Date(viewingBranch.created_at).toLocaleDateString('en-GB') : '—'}</div>
            </div>
            <div>
              <div style={s.label}>Owner Email</div>
              <div style={s.val}>{viewingBranch.owner_email || '—'}</div>
            </div>
          </div>
        </div>

        <div style={s.tipBox}>
          💡 <strong>Tip:</strong> Staff at this branch log in with their own credentials and are automatically assigned to this branch. Their sales, inventory, and shifts are isolated to this location.
        </div>
      </div>
    )
  }

  // ── Main Branches List ─────────────────────────────────────────
  if (loading) return <div style={s.loading}>Loading branches...</div>

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.topbar}>
        <div>
          <h2 style={s.title}>Branches</h2>
          <p style={s.sub}>Manage all locations under {pharmacyName}</p>
        </div>
        {isOwner && (
          <button style={s.btnPrimary} onClick={() => { setShowForm(!showForm); setEditingBranch(null) }}>
            {showForm ? '✕ Cancel' : '+ Add Branch'}
          </button>
        )}
      </div>

      {/* Message Banner */}
      {msg.text && (
        <div style={{ ...s.msgBanner, ...(msg.type === 'error' ? s.msgError : s.msgSuccess) }}>
          {msg.text}
        </div>
      )}

      {/* Add Branch Form */}
      {showForm && (
        <div style={{ ...s.card, borderTop: '3px solid #0F6E56' }}>
          <div style={s.cardTitle}>New Branch</div>
          <div style={s.formGrid}>
            <div>
              <div style={s.label}>Branch Name *</div>
              <input
                style={s.input}
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Westlands Branch"
              />
            </div>
            <div>
              <div style={s.label}>Location *</div>
              <input
                style={s.input}
                value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Westlands, Nairobi"
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button style={s.btnPrimary} onClick={addBranch} disabled={saving}>
              {saving ? 'Saving...' : 'Save Branch'}
            </button>
            <button style={s.btnGhost} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Main Branch Card */}
      <div style={{ ...s.card, borderLeft: '3px solid #0F6E56' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div style={s.cardTitle}>🏥 Main Branch — {pharmacyName}</div>
          <span style={s.badgeMain}>HEAD OFFICE</span>
        </div>
        <div style={s.miniStats}>
          <div style={s.miniStat}>
            <span style={s.miniVal}>KES {(mainStats.sales || 0).toLocaleString()}</span>
            <span style={s.miniLabel}>Today's Sales</span>
          </div>
          <div style={s.miniDivider} />
          <div style={s.miniStat}>
            <span style={s.miniVal}>{mainStats.inventory || 0}</span>
            <span style={s.miniLabel}>Items</span>
          </div>
          <div style={s.miniDivider} />
          <div style={s.miniStat}>
            <span style={s.miniVal}>{mainStats.staff || 0}</span>
            <span style={s.miniLabel}>Staff</span>
          </div>
          <div style={s.miniDivider} />
          <div style={s.miniStat}>
            {mainStats.shift ? (
              <span style={{ ...s.miniVal, color: '#0F6E56' }}>● Open</span>
            ) : (
              <span style={{ ...s.miniVal, color: '#999' }}>No Shift</span>
            )}
            <span style={s.miniLabel}>Shift</span>
          </div>
        </div>
      </div>

      {/* Branch List */}
      {branches.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: '36px', marginBottom: '10px' }}>🏬</div>
          <p style={{ margin: 0, fontWeight: '500', color: '#555' }}>No branches yet</p>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#999' }}>Click "+ Add Branch" to create your first branch location.</p>
        </div>
      ) : (
        branches.map((b, i) => {
          const stats = branchStats[b.id] || {}
          const isEditingThis = editingBranch?.id === b.id

          return (
            <div key={b.id} style={s.card}>
              {isEditingThis ? (
                // ── Edit Mode ──
                <div>
                  <div style={s.cardTitle}>✏️ Editing Branch</div>
                  <div style={s.formGrid}>
                    <div>
                      <div style={s.label}>Branch Name *</div>
                      <input
                        style={s.input}
                        value={editingBranch.name}
                        onChange={e => setEditingBranch({ ...editingBranch, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <div style={s.label}>Location *</div>
                      <input
                        style={s.input}
                        value={editingBranch.location}
                        onChange={e => setEditingBranch({ ...editingBranch, location: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button style={s.btnPrimary} onClick={saveBranchEdit} disabled={saving}>
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button style={s.btnGhost} onClick={() => setEditingBranch(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                // ── View Mode ──
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={s.branchIcon}>🏪</div>
                      <div>
                        <div style={s.branchName}>{b.name}</div>
                        <div style={s.branchSub}>📍 {b.location}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {stats.shift ? (
                        <span style={s.pillOpen}>● Shift Open</span>
                      ) : (
                        <span style={s.pillClosed}>No Shift</span>
                      )}
                      <span style={{ ...s.badgeMain, background: '#E1F5EE', color: '#0F6E56' }}>Branch {i + 1}</span>
                    </div>
                  </div>

                  {/* Mini stats row */}
                  <div style={s.miniStats}>
                    <div style={s.miniStat}>
                      <span style={s.miniVal}>KES {(stats.sales || 0).toLocaleString()}</span>
                      <span style={s.miniLabel}>Today's Sales</span>
                    </div>
                    <div style={s.miniDivider} />
                    <div style={s.miniStat}>
                      <span style={s.miniVal}>{stats.inventory || 0}</span>
                      <span style={s.miniLabel}>Items</span>
                    </div>
                    <div style={s.miniDivider} />
                    <div style={s.miniStat}>
                      <span style={s.miniVal}>{stats.staff || 0}</span>
                      <span style={s.miniLabel}>Staff</span>
                    </div>
                    <div style={s.miniDivider} />
                    <div style={s.miniStat}>
                      <span style={s.miniVal}>{stats.shift ? stats.shift.cashier_name || 'Open' : '—'}</span>
                      <span style={s.miniLabel}>Cashier</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', borderTop: '1px solid #f0f2f0', paddingTop: '10px' }}>
                    <button style={s.btnSm} onClick={() => setViewingBranch(b)}>
                      👁 View Details
                    </button>
                    {isOwner && (
                      <>
                        <button style={s.btnSm} onClick={() => { setEditingBranch({ ...b }); setShowForm(false) }}>
                          ✏️ Edit
                        </button>
                        <button
                          style={{ ...s.btnSm, ...s.btnSmDanger }}
                          onClick={() => deleteBranch(b)}
                          disabled={deleting === b.id}
                        >
                          {deleting === b.id ? 'Deleting...' : '🗑 Delete'}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })
      )}

      {/* Info tip at bottom */}
      <div style={s.tipBox}>
        💡 <strong>How branches work:</strong> Each branch has its own inventory, sales, shifts, and staff. Staff log in with their credentials and are automatically linked to their branch. As owner, you see all branches here.
      </div>
    </div>
  )
}

const s = {
  page: { padding: '18px 22px', flex: 1, overflowY: 'auto' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111', margin: 0 },
  sub: { fontSize: '12px', color: '#888', margin: '4px 0 0' },
  card: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '14px 16px', marginBottom: '12px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '12px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  label: { fontSize: '11px', color: '#888', marginBottom: '4px' },
  val: { fontSize: '13px', color: '#111', fontWeight: '500' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', outline: 'none' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
  btnGhost: { background: 'transparent', color: '#555', border: '1px solid #ddd', padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
  btnSm: { background: '#f5f6f5', color: '#333', border: '1px solid #e8ebe8', padding: '6px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' },
  btnSmDanger: { background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' },
  backBtn: { background: '#f0f2f0', color: '#333', border: 'none', padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' },
  branchIcon: { fontSize: '22px' },
  branchName: { fontSize: '14px', fontWeight: '600', color: '#111' },
  branchSub: { fontSize: '12px', color: '#888', marginTop: '2px' },
  badgeMain: { background: '#f0f2f0', color: '#555', fontSize: '10px', padding: '3px 10px', borderRadius: '99px', fontWeight: '600', letterSpacing: '0.5px' },
  pillOpen: { background: '#E1F5EE', color: '#0F6E56', fontSize: '11px', padding: '3px 10px', borderRadius: '99px', fontWeight: '600' },
  pillClosed: { background: '#f5f5f5', color: '#999', fontSize: '11px', padding: '3px 10px', borderRadius: '99px', fontWeight: '500' },
  miniStats: { display: 'flex', alignItems: 'center', gap: '0', background: '#fafbfa', borderRadius: '8px', padding: '10px 14px' },
  miniStat: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 },
  miniVal: { fontSize: '13px', fontWeight: '600', color: '#111' },
  miniLabel: { fontSize: '10px', color: '#999', marginTop: '2px' },
  miniDivider: { width: '1px', height: '28px', background: '#e8ebe8', margin: '0 4px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '14px' },
  statCard: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '14px', textAlign: 'center' },
  statIcon: { fontSize: '22px', marginBottom: '8px' },
  statValue: { fontSize: '16px', fontWeight: '700', color: '#111', marginBottom: '4px' },
  statLabel: { fontSize: '11px', color: '#888' },
  shiftGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' },
  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' },
  msgBanner: { borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '12px' },
  msgSuccess: { background: '#E1F5EE', color: '#0F6E56', border: '1px solid #A7E3CE' },
  msgError: { background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' },
  empty: { textAlign: 'center', padding: '40px', background: '#fafbfa', borderRadius: '10px', border: '1px dashed #ddd', marginBottom: '12px' },
  tipBox: { background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '12px 14px', fontSize: '12px', color: '#92400E', marginTop: '4px' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' },
}
