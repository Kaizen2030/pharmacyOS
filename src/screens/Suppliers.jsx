import { useEffect, useMemo, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'

const emptySupplier = {
  name: '',
  contact_person: '',
  phone: '',
  email: '',
}

const emptyOrder = {
  supplier_id: '',
  drug_name: '',
  qty_ordered: '',
  unit_cost: '',
}

export default function Suppliers() {
  const { pharmacyId } = usePharmacy()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('suppliers')
  const [suppliers, setSuppliers] = useState([])
  const [orders, setOrders] = useState([])
  const [showSupplierForm, setShowSupplierForm] = useState(false)
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [supplierForm, setSupplierForm] = useState(emptySupplier)
  const [orderForm, setOrderForm] = useState(emptyOrder)

  useEffect(() => {
    if (pharmacyId) fetchData()
  }, [pharmacyId])

  const pendingOrders = useMemo(
    () => orders.filter(order => order.status !== 'Received'),
    [orders]
  )

  async function fetchData() {
    setLoading(true)

    const [{ data: supplierData, error: supplierError }, { data: orderData, error: orderError }] = await Promise.all([
      supabase
        .from('suppliers')
        .select('*')
        .eq('pharmacy_id', pharmacyId)
        .order('created_at', { ascending: false }),
      supabase
        .from('purchase_orders')
        .select('*')
        .eq('pharmacy_id', pharmacyId)
        .order('sent_at', { ascending: false }),
    ])

    if (supplierError) console.error('Failed to load suppliers:', supplierError)
    if (orderError) console.error('Failed to load purchase orders:', orderError)

    setSuppliers(supplierData || [])
    setOrders(orderData || [])
    setLoading(false)
  }

  async function saveSupplier() {
    if (!supplierForm.name.trim()) return alert('Supplier name is required.')

    const payload = {
      pharmacy_id: pharmacyId,
      name: supplierForm.name.trim(),
      contact_person: supplierForm.contact_person.trim() || null,
      phone: supplierForm.phone.trim() || null,
      email: supplierForm.email.trim() || null,
    }

    let error

    if (editingSupplier) {
      const { error: updateError } = await supabase
        .from('suppliers')
        .update(payload)
        .eq('id', editingSupplier.id)
      error = updateError
    } else {
      const { error: insertError } = await supabase
        .from('suppliers')
        .insert([payload])
      error = insertError
    }

    if (error) {
      alert('Unable to save supplier: ' + error.message)
      return
    }

    setShowSupplierForm(false)
    setEditingSupplier(null)
    setSupplierForm(emptySupplier)
    fetchData()
  }

  function openEditSupplier(supplier) {
    setEditingSupplier(supplier)
    setSupplierForm({
      name: supplier.name || '',
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
    })
    setShowSupplierForm(true)
  }

  async function deleteSupplier(supplier) {
    if (!window.confirm(`Delete supplier ${supplier.name}?`)) return

    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', supplier.id)

    if (error) {
      alert('Unable to delete supplier: ' + error.message)
      return
    }

    fetchData()
  }

  async function saveOrder() {
    if (!orderForm.drug_name.trim()) return alert('Drug name is required.')
    if (!orderForm.qty_ordered) return alert('Quantity ordered is required.')

    const timestamp = new Date().toISOString()
    const payload = {
      pharmacy_id: pharmacyId,
      supplier_id: orderForm.supplier_id || null,
      drug_name: orderForm.drug_name.trim(),
      qty_ordered: parseInt(orderForm.qty_ordered, 10),
      unit_cost: parseFloat(orderForm.unit_cost) || 0,
      status: 'Pending',
      sent_at: timestamp,
      ordered_at: timestamp,
    }

    const { error } = await supabase
      .from('purchase_orders')
      .insert([payload])

    if (error) {
      alert('Unable to create purchase order: ' + error.message)
      return
    }

    setShowOrderForm(false)
    setOrderForm(emptyOrder)
    fetchData()
  }

  async function receiveStock(order) {
    const { data: inventoryItem, error: fetchError } = await supabase
      .from('inventory')
      .select('id, quantity')
      .eq('pharmacy_id', pharmacyId)
      .eq('drug_name', order.drug_name)
      .maybeSingle()

    if (fetchError) {
      alert('Unable to locate inventory item: ' + fetchError.message)
      return
    }

    if (!inventoryItem) {
      alert(`No inventory item named "${order.drug_name}" was found. Add it in Inventory first, then receive this order.`)
      return
    }

    const nextQty = (parseInt(inventoryItem.quantity, 10) || 0) + (parseInt(order.qty_ordered, 10) || 0)

    const { error: inventoryError } = await supabase
      .from('inventory')
      .update({ quantity: nextQty })
      .eq('id', inventoryItem.id)

    if (inventoryError) {
      alert('Unable to update inventory: ' + inventoryError.message)
      return
    }

    const { error: orderError } = await supabase
      .from('purchase_orders')
      .update({
        status: 'Received',
        received_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    if (orderError) {
      alert('Stock was updated but order status could not be saved: ' + orderError.message)
      return
    }

    fetchData()
  }

  function getSupplierName(supplierId) {
    return suppliers.find(supplier => supplier.id === supplierId)?.name || 'Unassigned'
  }

  if (loading) return <div style={styles.loading}>Loading suppliers...</div>

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <h2 style={styles.title}>Suppliers</h2>
          <p style={styles.subtitle}>Manage suppliers and receive stock from purchase orders.</p>
        </div>
        <div style={styles.actions}>
          <button style={styles.btnSecondary} onClick={() => setShowSupplierForm(true)}>+ Supplier</button>
          <button style={styles.btnPrimary} onClick={() => setShowOrderForm(true)}>+ Purchase Order</button>
        </div>
      </div>

      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(activeTab === 'suppliers' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('suppliers')}
        >
          Suppliers
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'orders' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('orders')}
        >
          Purchase Orders
        </button>
      </div>

      {activeTab === 'suppliers' ? (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Supplier Directory</div>
          {suppliers.length === 0 ? (
            <div style={styles.emptyState}>No suppliers added yet.</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Contact</th>
                  <th style={styles.th}>Phone</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map(supplier => (
                  <tr key={supplier.id}>
                    <td style={styles.td}>{supplier.name}</td>
                    <td style={styles.td}>{supplier.contact_person || '-'}</td>
                    <td style={styles.td}>{supplier.phone || '-'}</td>
                    <td style={styles.td}>{supplier.email || '-'}</td>
                    <td style={styles.td}>
                      <div style={styles.rowActions}>
                        <button style={styles.btnSecondary} onClick={() => openEditSupplier(supplier)}>Edit</button>
                        <button style={styles.btnDelete} onClick={() => deleteSupplier(supplier)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Pending Orders ({pendingOrders.length})</div>
          {orders.length === 0 ? (
            <div style={styles.emptyState}>No purchase orders created yet.</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Drug</th>
                  <th style={styles.th}>Supplier</th>
                  <th style={styles.th}>Qty</th>
                  <th style={styles.th}>Unit Cost</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Ordered</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.id}>
                    <td style={styles.td}>{order.drug_name}</td>
                    <td style={styles.td}>{getSupplierName(order.supplier_id)}</td>
                    <td style={styles.td}>{order.qty_ordered}</td>
                    <td style={styles.td}>KES {parseFloat(order.unit_cost || 0).toLocaleString()}</td>
                    <td style={styles.td}>
                      <span style={order.status === 'Received' ? styles.pillDone : styles.pillPending}>
                        {order.status}
                      </span>
                    </td>
                    <td style={styles.td}>{order.ordered_at || order.sent_at ? new Date(order.ordered_at || order.sent_at).toLocaleString('en-GB') : '-'}</td>
                    <td style={styles.td}>
                      {order.status !== 'Received' ? (
                        <button style={styles.btnPrimary} onClick={() => receiveStock(order)}>Receive Stock</button>
                      ) : (
                        <span style={styles.receivedText}>Received</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showSupplierForm && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}</h3>
            <div style={styles.formGrid}>
              {[
                ['name', 'Supplier Name'],
                ['contact_person', 'Contact Person'],
                ['phone', 'Phone'],
                ['email', 'Email'],
              ].map(([key, label]) => (
                <div key={key} style={styles.formGroup}>
                  <label style={styles.label}>{label}</label>
                  <input
                    style={styles.input}
                    value={supplierForm[key]}
                    onChange={event => setSupplierForm({ ...supplierForm, [key]: event.target.value })}
                  />
                </div>
              ))}
            </div>

            <div style={styles.modalFooter}>
              <button
                style={styles.btnSecondary}
                onClick={() => {
                  setShowSupplierForm(false)
                  setEditingSupplier(null)
                  setSupplierForm(emptySupplier)
                }}
              >
                Cancel
              </button>
              <button style={styles.btnPrimary} onClick={saveSupplier}>
                {editingSupplier ? 'Update Supplier' : 'Save Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showOrderForm && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Create Purchase Order</h3>
            <div style={styles.formGrid}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Supplier</label>
                <select
                  style={styles.input}
                  value={orderForm.supplier_id}
                  onChange={event => setOrderForm({ ...orderForm, supplier_id: event.target.value })}
                >
                  <option value="">Select supplier (optional)</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </div>

              {[
                ['drug_name', 'Drug Name'],
                ['qty_ordered', 'Quantity Ordered'],
                ['unit_cost', 'Unit Cost (KES)'],
              ].map(([key, label]) => (
                <div key={key} style={styles.formGroup}>
                  <label style={styles.label}>{label}</label>
                  <input
                    style={styles.input}
                    type={key === 'drug_name' ? 'text' : 'number'}
                    value={orderForm[key]}
                    onChange={event => setOrderForm({ ...orderForm, [key]: event.target.value })}
                  />
                </div>
              ))}
            </div>

            <div style={styles.modalFooter}>
              <button
                style={styles.btnSecondary}
                onClick={() => {
                  setShowOrderForm(false)
                  setOrderForm(emptyOrder)
                }}
              >
                Cancel
              </button>
              <button style={styles.btnPrimary} onClick={saveOrder}>Save Order</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { padding: '18px 22px', flex: 1, overflowY: 'auto' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111', margin: 0 },
  subtitle: { fontSize: '12px', color: '#888', margin: '4px 0 0' },
  actions: { display: 'flex', gap: '8px' },
  tabs: { display: 'flex', gap: '0', marginBottom: '14px', background: '#fff', borderRadius: '8px', border: '1px solid #e8ebe8', overflow: 'hidden' },
  tab: { flex: 1, padding: '10px', border: 'none', background: 'none', fontSize: '12px', cursor: 'pointer', color: '#555' },
  tabActive: { background: '#0F6E56', color: '#fff', fontWeight: '600' },
  card: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '16px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '12px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '8px 10px', color: '#888', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e8ebe8' },
  td: { padding: '10px', borderBottom: '1px solid #f0f2f0', color: '#222', verticalAlign: 'top' },
  rowActions: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  btnSecondary: { background: '#fff', color: '#333', border: '1px solid #ddd', padding: '8px 14px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  btnDelete: { background: '#FFF1F2', color: '#BE123C', border: '1px solid #FDA4AF', padding: '8px 14px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  pillPending: { background: '#FFF7E6', color: '#9A6700', padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '600' },
  pillDone: { background: '#E1F5EE', color: '#0F6E56', padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '600' },
  receivedText: { fontSize: '12px', color: '#0F6E56', fontWeight: '600' },
  emptyState: { color: '#888', fontSize: '13px', padding: '24px 0' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '10px', padding: '24px', width: '640px', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '16px', fontWeight: '600', marginBottom: '16px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  formGroup: { marginBottom: '12px' },
  label: { fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' },
}
