import { useEffect, useRef, useState } from 'react'
import { usePharmacy } from '../context'
import { notifyError, notifyInfo, notifySuccess } from '../notifications'
import supabase from '../supabase'
import { insertRowsWithSchemaFallback } from '../utils/audit'

const CSV_TEMPLATE_HEADERS = [
  'drug_name', 'drug_code', 'barcode', 'category', 'quantity',
  'price_kes', 'cost_price_kes', 'expiry_date', 'supplier_name',
  'low_stock_threshold', 'is_controlled', 'ppb_category',
]

const SAMPLE_ROWS = [
  ['Amoxicillin 500mg', 'AMOX-500', '', 'Antibiotic', '200', '45', '28', '2026-12-31', 'Elys Chemical', '20', 'No', ''],
  ['Tramadol 50mg', 'TRAM-50', '', 'Analgesic', '50', '120', '80', '2025-09-30', 'Dawa Ltd', '10', 'Yes', 'Opioid Analgesic'],
]

const emptyDrugForm = {
  drug_name: '',
  drug_code: '',
  barcode: '',
  quantity: '',
  price_kes: '',
  cost_price_kes: '',
  expiry_date: '',
  supplier_name: '',
  category: '',
  low_stock_threshold: 20,
  is_controlled: false,
  ppb_category: '',
}

const emptyReorderForm = {
  inventory_id: null,
  drug_name: '',
  drug_code: '',
  supplier_name: '',
  qty_ordered: '',
  notes: '',
  estimated_delivery_date: '',
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function formatCurrency(value) {
  return `KES ${Number(value || 0).toLocaleString()}`
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-GB')
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-GB')
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildPurchaseOrderMessage(order) {
  return [
    'Purchase Order',
    '',
    `Drug: ${order.drug_name || '-'}`,
    `Code: ${order.drug_code || '-'}`,
    `Supplier: ${order.supplier_name || 'Unassigned'}`,
    `Quantity: ${order.qty_ordered || 0}`,
    `Status: ${order.status || 'Pending'}`,
    `Created: ${formatDateTime(order.ordered_at || order.sent_at || order.created_at)}`,
    `Estimated delivery: ${formatDate(order.estimated_delivery_date)}`,
    `Notes: ${order.notes || 'None'}`,
  ].join('\n')
}

function buildPurchaseOrderPrintHtml(order) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Purchase Order</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #111; }
          .sheet { max-width: 720px; margin: 0 auto; }
          .title { font-size: 24px; font-weight: 700; margin-bottom: 6px; }
          .subtitle { color: #666; margin-bottom: 18px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 18px; margin-bottom: 18px; }
          .label { font-size: 12px; color: #666; margin-bottom: 4px; }
          .value { font-size: 14px; font-weight: 600; }
          .notes { border: 1px solid #ddd; border-radius: 10px; padding: 14px; min-height: 80px; }
          .footer { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
          .sign { border-top: 1px solid #999; padding-top: 8px; font-size: 12px; color: #555; }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="title">Purchase Order</div>
          <div class="subtitle">Prepared from PharmacyOS inventory replenishment workflow.</div>
          <div class="grid">
            <div>
              <div class="label">Drug Name</div>
              <div class="value">${escapeHtml(order.drug_name || '-')}</div>
            </div>
            <div>
              <div class="label">Drug Code</div>
              <div class="value">${escapeHtml(order.drug_code || '-')}</div>
            </div>
            <div>
              <div class="label">Supplier</div>
              <div class="value">${escapeHtml(order.supplier_name || 'Unassigned')}</div>
            </div>
            <div>
              <div class="label">Quantity Ordered</div>
              <div class="value">${escapeHtml(order.qty_ordered || 0)}</div>
            </div>
            <div>
              <div class="label">Status</div>
              <div class="value">${escapeHtml(order.status || 'Pending')}</div>
            </div>
            <div>
              <div class="label">Date Created</div>
              <div class="value">${escapeHtml(formatDateTime(order.ordered_at || order.sent_at || order.created_at))}</div>
            </div>
            <div>
              <div class="label">Estimated Delivery</div>
              <div class="value">${escapeHtml(formatDate(order.estimated_delivery_date))}</div>
            </div>
          </div>
          <div class="label">Notes</div>
          <div class="notes">${escapeHtml(order.notes || 'None')}</div>
          <div class="footer">
            <div class="sign">Prepared by</div>
            <div class="sign">Supplier confirmation</div>
          </div>
        </div>
      </body>
    </html>
  `
}

function ReorderModal({ form, submitting, onChange, onCancel, onSave }) {
  if (!form) return null

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <h3 style={s.modalTitle}>Create Purchase Order</h3>
        <div style={s.formGrid}>
          <div style={s.formGroup}>
            <label style={s.label}>Drug Name</label>
            <input style={{ ...s.input, ...s.readOnlyInput }} value={form.drug_name} readOnly />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Supplier Name</label>
            <input
              style={s.input}
              value={form.supplier_name}
              onChange={event => onChange('supplier_name', event.target.value)}
              placeholder="Supplier name"
            />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Quantity to Order</label>
            <input
              type="number"
              min="1"
              style={s.input}
              value={form.qty_ordered}
              onChange={event => onChange('qty_ordered', event.target.value)}
            />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Estimated Delivery Date</label>
            <input
              type="date"
              style={s.input}
              value={form.estimated_delivery_date}
              onChange={event => onChange('estimated_delivery_date', event.target.value)}
            />
          </div>
          <div style={{ ...s.formGroup, gridColumn: '1 / -1' }}>
            <label style={s.label}>Notes</label>
            <textarea
              style={s.textarea}
              value={form.notes}
              onChange={event => onChange('notes', event.target.value)}
              placeholder="Any supplier instructions, urgency, or packaging notes"
            />
          </div>
        </div>
        <div style={s.modalFooter}>
          <button style={s.btnSecondary} onClick={onCancel} disabled={submitting}>Cancel</button>
          <button style={s.btnPrimary} onClick={onSave} disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Purchase Order'}
          </button>
        </div>
      </div>
    </div>
  )
}

function POSummaryModal({ order, onClose, onPrint, onWhatsApp, onEmail }) {
  if (!order) return null

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <h3 style={s.modalTitle}>Purchase Order Summary</h3>
        <div style={s.summaryBox}>
          <div style={s.summaryRow}><span>Drug Name</span><strong>{order.drug_name}</strong></div>
          <div style={s.summaryRow}><span>Drug Code</span><strong>{order.drug_code || '-'}</strong></div>
          <div style={s.summaryRow}><span>Supplier</span><strong>{order.supplier_name || 'Unassigned'}</strong></div>
          <div style={s.summaryRow}><span>Quantity Ordered</span><strong>{order.qty_ordered}</strong></div>
          <div style={s.summaryRow}><span>Status</span><strong>{order.status || 'Pending'}</strong></div>
          <div style={s.summaryRow}><span>Date Created</span><strong>{formatDateTime(order.ordered_at || order.sent_at || order.created_at)}</strong></div>
          <div style={s.summaryRow}><span>Estimated Delivery</span><strong>{formatDate(order.estimated_delivery_date)}</strong></div>
          <div style={{ ...s.summaryRow, alignItems: 'flex-start', marginBottom: 0 }}>
            <span>Notes</span>
            <strong style={s.summaryNotes}>{order.notes || 'None'}</strong>
          </div>
        </div>
        <div style={s.modalFooterWrap}>
          <div style={s.actionBtns}>
            <button style={s.btnPrimary} onClick={onPrint}>Print PO</button>
            <button style={s.btnWhatsapp} onClick={onWhatsApp}>Send via WhatsApp</button>
            <button style={s.btnEmail} onClick={onEmail}>Send via Email</button>
          </div>
          <button style={s.btnSecondary} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default function Inventory() {
  const { pharmacyId, isOwner } = usePharmacy()
  const canEdit = isOwner

  const [drugs, setDrugs] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [filtered, setFiltered] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingDrug, setEditingDrug] = useState(null)
  const [activeTab, setActiveTab] = useState('inventory')
  const [showReorderModal, setShowReorderModal] = useState(false)
  const [reorderSubmitting, setReorderSubmitting] = useState(false)
  const [reorderForm, setReorderForm] = useState(emptyReorderForm)
  const [poSummaryOrder, setPoSummaryOrder] = useState(null)
  const [receivingOrderId, setReceivingOrderId] = useState(null)
  const [whatsappAlertsEnabled, setWhatsappAlertsEnabled] = useState(false)
  const [whatsappAlertPhone, setWhatsappAlertPhone] = useState('')
  const [whatsappAlertThreshold, setWhatsappAlertThreshold] = useState(20)

  const [importRows, setImportRows] = useState([])
  const [importErrors, setImportErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState(null)
  const fileInputRef = useRef(null)

  const [form, setForm] = useState(emptyDrugForm)

  useEffect(() => {
    if (pharmacyId) {
      fetchData()
      fetchAlertSettings()
    }
  }, [pharmacyId])

  useEffect(() => {
    const q = search.toLowerCase().trim()
    let list = drugs

    if (categoryFilter !== 'All') list = list.filter(drug => drug.category === categoryFilter)
    if (statusFilter !== 'All') list = list.filter(drug => getStatus(drug).label === statusFilter)
    if (q) {
      list = list.filter(drug =>
        drug.drug_name?.toLowerCase().includes(q) ||
        drug.drug_code?.toLowerCase().includes(q) ||
        drug.barcode?.toLowerCase().includes(q) ||
        drug.supplier_name?.toLowerCase().includes(q)
      )
    }

    setFiltered(list)
  }, [search, drugs, categoryFilter, statusFilter])

  async function fetchData() {
    setLoading(true)

    const [
      { data: inventoryData, error: inventoryError },
      { data: orderData, error: orderError },
    ] = await Promise.all([
      supabase.from('inventory').select('*').eq('pharmacy_id', pharmacyId).order('drug_name'),
      supabase.from('purchase_orders').select('*').eq('pharmacy_id', pharmacyId).order('ordered_at', { ascending: false }),
    ])

    if (inventoryError) {
      console.error('Fetch inventory error:', inventoryError)
      notifyError('Unable to load inventory right now.', { title: 'Inventory unavailable' })
    }

    if (orderError) {
      console.error('Fetch purchase orders error:', orderError)
      notifyError('Unable to load purchase orders right now.', { title: 'Orders unavailable' })
    }

    setDrugs(inventoryData || [])
    setPurchaseOrders(orderData || [])
    setLoading(false)
    return inventoryData || []
  }

  async function fetchAlertSettings() {
    if (!pharmacyId) return

    const { data, error } = await supabase
      .from('pharmacies')
      .select('whatsapp_alerts_enabled, whatsapp_alert_phone, whatsapp_alert_threshold')
      .eq('id', pharmacyId)
      .single()

    if (error) {
      console.error('Unable to load WhatsApp alert settings:', error)
      return
    }

    setWhatsappAlertsEnabled(Boolean(data?.whatsapp_alerts_enabled))
    setWhatsappAlertPhone(data?.whatsapp_alert_phone || '')
    setWhatsappAlertThreshold(data?.whatsapp_alert_threshold ?? 20)
  }

  function sanitizeWhatsAppPhone(value) {
    return String(value || '').trim().replace(/[^\d+]/g, '').replace(/^\+/, '')
  }

  function getLowStockItems(items) {
    return (items || []).map(item => {
      const threshold = Number.isFinite(Number(item.low_stock_threshold))
        ? parseInt(item.low_stock_threshold, 10) || whatsappAlertThreshold
        : whatsappAlertThreshold
      const quantity = parseInt(item.quantity, 10) || 0
      const suggestedReorder = Math.max(threshold * 3 - quantity, threshold)
      return { ...item, threshold, quantity, suggestedReorder }
    }).filter(item => item.quantity <= item.threshold)
  }

  function buildWhatsAppLowStockMessage(items) {
    const lines = ['PharmacyOS low stock alert', '', 'The following items are below threshold:']
    items.forEach(item => {
      lines.push(`- ${item.drug_name || 'Unknown'}: ${item.quantity} on hand, suggested reorder ${item.suggestedReorder} units`)
    })
    lines.push('', 'Please review stock and reorder as needed.')
    return lines.join('\n')
  }

  function openWhatsAppLowStockAlert(items) {
    if (!whatsappAlertsEnabled) return
    const phone = sanitizeWhatsAppPhone(whatsappAlertPhone)
    if (!phone) return

    const lowStockItems = getLowStockItems(items)
    if (lowStockItems.length === 0) return

    const message = buildWhatsAppLowStockMessage(lowStockItems)
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
  }

  function getStatus(drug) {
    const currentDate = new Date()
    const expiry = new Date(drug.expiry_date || '2100-01-01')
    const daysLeft = Math.ceil((expiry - currentDate) / 86400000)

    if (drug.quantity <= 0) return { label: 'Out of Stock', color: '#E24B4A', bg: '#FCEBEB' }
    if (daysLeft < 0) return { label: 'Expired', color: '#E24B4A', bg: '#FCEBEB' }
    if (daysLeft <= 30) return { label: 'Expiring Soon', color: '#E09B00', bg: '#FAEEDA' }
    if (drug.quantity <= (drug.low_stock_threshold || 20)) return { label: 'Low Stock', color: '#E09B00', bg: '#FAEEDA' }
    return { label: 'In Stock', color: '#0F6E56', bg: '#E1F5EE' }
  }

  const categories = ['All', ...Array.from(new Set(drugs.map(drug => drug.category).filter(Boolean))).sort()]
  const reorderList = drugs.filter(drug => drug.quantity <= (drug.low_stock_threshold || 20) && drug.quantity >= 0)

  function openAdd() {
    setEditingDrug(null)
    setForm(emptyDrugForm)
    setShowForm(true)
  }

  function openEdit(drug) {
    setEditingDrug(drug)
    setForm({
      drug_name: drug.drug_name || '',
      drug_code: drug.drug_code || '',
      barcode: drug.barcode || '',
      quantity: drug.quantity ?? '',
      price_kes: drug.price_kes ?? '',
      cost_price_kes: drug.cost_price_kes ?? '',
      expiry_date: drug.expiry_date || '',
      supplier_name: drug.supplier_name || '',
      category: drug.category || '',
      low_stock_threshold: drug.low_stock_threshold ?? 20,
      is_controlled: drug.is_controlled || false,
      ppb_category: drug.ppb_category || '',
    })
    setShowForm(true)
  }

  function openReorder(drug) {
    const threshold = parseInt(drug.low_stock_threshold, 10) || 20
    setReorderForm({
      inventory_id: drug.id,
      drug_name: drug.drug_name || '',
      drug_code: drug.drug_code || '',
      supplier_name: drug.supplier_name || '',
      qty_ordered: String(threshold * 3),
      notes: '',
      estimated_delivery_date: '',
    })
    setShowReorderModal(true)
  }

  function closeReorderModal() {
    if (reorderSubmitting) return
    setShowReorderModal(false)
    setReorderForm(emptyReorderForm)
  }

  function updateReorderForm(key, value) {
    setReorderForm(current => ({ ...current, [key]: value }))
  }

  async function saveDrug() {
    if (!pharmacyId) return alert('Pharmacy ID not found.')

    const payload = {
      pharmacy_id: pharmacyId,
      drug_name: form.drug_name.trim(),
      drug_code: form.drug_code.trim().toUpperCase(),
      barcode: form.barcode.trim() || null,
      quantity: parseInt(form.quantity, 10) || 0,
      price_kes: parseFloat(form.price_kes) || 0,
      cost_price_kes: parseFloat(form.cost_price_kes) || null,
      expiry_date: form.expiry_date || null,
      supplier_name: form.supplier_name.trim(),
      category: form.category.trim(),
      low_stock_threshold: parseInt(form.low_stock_threshold, 10) || 20,
      is_controlled: !!form.is_controlled,
      ppb_category: form.is_controlled ? form.ppb_category.trim() || null : null,
    }

    const { error } = editingDrug
      ? await supabase.from('inventory').update(payload).eq('id', editingDrug.id)
      : await supabase.from('inventory').insert([payload])

    if (error) {
      notifyError('Error saving drug: ' + error.message, { title: 'Save failed' })
      return
    }

    setShowForm(false)
    setEditingDrug(null)
    setForm(emptyDrugForm)
    notifySuccess(editingDrug ? 'Drug updated successfully.' : 'Drug added successfully.', { title: 'Inventory saved' })
    const inventoryData = await fetchData()
    openWhatsAppLowStockAlert(inventoryData)
  }

  async function deleteDrug(drug) {
    if (!window.confirm(`Delete "${drug.drug_name}"? This cannot be undone.`)) return

    await supabase.from('sales_ledger').delete().eq('drug_id', drug.id)
    const { error } = await supabase.from('inventory').delete().eq('id', drug.id)

    if (error) {
      notifyError('Error deleting drug: ' + error.message, { title: 'Delete failed' })
      return
    }

    notifySuccess(`Deleted ${drug.drug_name}.`, { title: 'Inventory updated' })
    fetchData()
  }

  async function savePurchaseOrder() {
    if (!pharmacyId) return

    const parsedQty = parseInt(reorderForm.qty_ordered, 10)
    if (!reorderForm.drug_name.trim()) return alert('Drug name is required.')
    if (Number.isNaN(parsedQty) || parsedQty < 1) return alert('Enter a valid quantity to order.')

    setReorderSubmitting(true)

    const orderedAt = new Date().toISOString()
    const payload = {
      pharmacy_id: pharmacyId,
      inventory_id: reorderForm.inventory_id || null,
      drug_name: reorderForm.drug_name.trim(),
      drug_code: reorderForm.drug_code.trim() || null,
      supplier_name: reorderForm.supplier_name.trim() || null,
      qty_ordered: parsedQty,
      notes: reorderForm.notes.trim() || null,
      estimated_delivery_date: reorderForm.estimated_delivery_date || null,
      status: 'Pending',
      sent_at: orderedAt,
      ordered_at: orderedAt,
    }

    const { data, error } = await insertRowsWithSchemaFallback('purchase_orders', [payload], '*')

    if (error) {
      setReorderSubmitting(false)
      notifyError('Error creating purchase order: ' + error.message, { title: 'Reorder failed' })
      return
    }

    const savedOrder = {
      ...payload,
      ...(data?.[0] || {}),
      ordered_at: data?.[0]?.ordered_at || orderedAt,
      sent_at: data?.[0]?.sent_at || orderedAt,
      supplier_name: data?.[0]?.supplier_name ?? payload.supplier_name,
      notes: data?.[0]?.notes ?? payload.notes,
      estimated_delivery_date: data?.[0]?.estimated_delivery_date ?? payload.estimated_delivery_date,
    }

    setReorderSubmitting(false)
    setShowReorderModal(false)
    setReorderForm(emptyReorderForm)
    setPoSummaryOrder(savedOrder)
    notifySuccess(`Purchase order created for ${savedOrder.drug_name}.`, { title: 'PO saved' })
    await fetchData()
  }

  async function markOrderReceived(order) {
    if (!window.confirm(`Mark ${order.drug_name} as received and add ${order.qty_ordered} units to inventory?`)) return

    setReceivingOrderId(order.id)

    let inventoryQuery = supabase
      .from('inventory')
      .select('id, quantity')
      .eq('pharmacy_id', pharmacyId)

    if (order.inventory_id) {
      inventoryQuery = inventoryQuery.eq('id', order.inventory_id)
    } else if (order.drug_code) {
      inventoryQuery = inventoryQuery.eq('drug_code', order.drug_code)
    } else {
      inventoryQuery = inventoryQuery.eq('drug_name', order.drug_name)
    }

    const { data: inventoryItem, error: fetchError } = await inventoryQuery.maybeSingle()

    if (fetchError) {
      setReceivingOrderId(null)
      notifyError('Unable to locate inventory item: ' + fetchError.message, { title: 'Receive failed' })
      return
    }

    if (!inventoryItem) {
      setReceivingOrderId(null)
      notifyError(`No inventory item named "${order.drug_name}" was found.`, { title: 'Receive failed' })
      return
    }

    const nextQty = (parseInt(inventoryItem.quantity, 10) || 0) + (parseInt(order.qty_ordered, 10) || 0)

    const { error: inventoryError } = await supabase
      .from('inventory')
      .update({ quantity: nextQty })
      .eq('id', inventoryItem.id)

    if (inventoryError) {
      setReceivingOrderId(null)
      notifyError('Unable to update inventory: ' + inventoryError.message, { title: 'Receive failed' })
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
      setReceivingOrderId(null)
      notifyError('Stock was updated but order status could not be saved: ' + orderError.message, { title: 'Receive failed' })
      return
    }

    setReceivingOrderId(null)
    notifySuccess(`${order.drug_name} marked as received.`, { title: 'Stock received' })
    const inventoryData = await fetchData()
    openWhatsAppLowStockAlert(inventoryData)
  }

  function openPrintWindow(title, html) {
    const printWindow = window.open('', title, 'width=900,height=720')
    if (!printWindow) {
      alert('Unable to open print window.')
      return
    }

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    printWindow.onload = () => {
      printWindow.print()
    }
  }

  function printPurchaseOrder(order) {
    openPrintWindow('purchase-order', buildPurchaseOrderPrintHtml(order))
  }

  function sendPurchaseOrderWhatsApp(order) {
    const message = buildPurchaseOrderMessage(order)
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  function sendPurchaseOrderEmail(order) {
    const subject = `Purchase Order - ${order.drug_name || 'Inventory Reorder'}`
    const body = buildPurchaseOrderMessage(order)
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
  }

  function exportCSV() {
    const headers = ['Drug Name', 'Code', 'Barcode', 'Category', 'Qty', 'Price (KES)', 'Cost (KES)', 'Expiry', 'Supplier', 'Controlled', 'PPB Category', 'Status']
    const rows = filtered.map(drug => [
      drug.drug_name,
      drug.drug_code || '',
      drug.barcode || '',
      drug.category || '',
      drug.quantity,
      drug.price_kes,
      drug.cost_price_kes || '',
      drug.expiry_date || '',
      drug.supplier_name || '',
      drug.is_controlled ? 'Yes' : 'No',
      drug.ppb_category || '',
      getStatus(drug).label,
    ])
    const csv = [headers, ...rows].map(row => row.map(value => `"${value}"`).join(',')).join('\n')
    downloadText(csv, `inventory_${today()}.csv`, 'text/csv')
  }

  function downloadTemplate() {
    const csv = [CSV_TEMPLATE_HEADERS, ...SAMPLE_ROWS].map(row => row.map(value => `"${value}"`).join(',')).join('\n')
    downloadText(csv, 'inventory_import_template.csv', 'text/csv')
  }

  function downloadText(text, filename, mime) {
    const blob = new Blob([text], { type: mime })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  function exportReorderCSV() {
    const headers = ['Drug Name', 'Code', 'Category', 'Current Qty', 'Threshold', 'Supplier', 'Price (KES)', 'Status']
    const rows = reorderList.map(drug => [
      drug.drug_name,
      drug.drug_code || '',
      drug.category || '',
      drug.quantity,
      drug.low_stock_threshold || 20,
      drug.supplier_name || '',
      drug.price_kes,
      getStatus(drug).label,
    ])
    const csv = [headers, ...rows].map(row => row.map(value => `"${value}"`).join(',')).join('\n')
    downloadText(csv, `reorder_list_${today()}.csv`, 'text/csv')
  }

  function handleFileUpload(event) {
    const file = event.target.files[0]
    if (!file) return

    setImportDone(null)
    setImportErrors([])
    setImportRows([])

    const reader = new FileReader()
    reader.onload = loadEvent => {
      const text = loadEvent.target.result
      const lines = text.split(/\r?\n/).filter(line => line.trim())
      if (lines.length < 2) {
        setImportErrors(['File is empty or has no data rows.'])
        return
      }

      const rawHeader = lines[0].split(',').map(header => header.replace(/"/g, '').trim().toLowerCase().replace(/ /g, '_'))
      const nameIdx = rawHeader.indexOf('drug_name')
      if (nameIdx === -1) {
        setImportErrors(['Missing required column: drug_name'])
        return
      }

      const col = key => rawHeader.indexOf(key)
      const parsed = []
      const errors = []

      lines.slice(1).forEach((line, index) => {
        const row = line.split(',').map(value => value.replace(/^"|"$/g, '').trim())
        const get = key => (col(key) >= 0 ? row[col(key)] || '' : '')

        const drugName = get('drug_name')
        if (!drugName) {
          errors.push(`Row ${index + 2}: drug_name is required`)
          return
        }

        const qty = parseInt(get('quantity'), 10)
        const price = parseFloat(get('price_kes'))

        if (Number.isNaN(qty)) {
          errors.push(`Row ${index + 2} (${drugName}): quantity must be a number`)
          return
        }
        if (Number.isNaN(price)) {
          errors.push(`Row ${index + 2} (${drugName}): price_kes must be a number`)
          return
        }

        parsed.push({
          pharmacy_id: pharmacyId,
          drug_name: drugName,
          drug_code: (get('drug_code') || '').toUpperCase() || null,
          barcode: get('barcode') || null,
          category: get('category') || '',
          quantity: qty,
          price_kes: price,
          cost_price_kes: parseFloat(get('cost_price_kes')) || null,
          expiry_date: get('expiry_date') || null,
          supplier_name: get('supplier_name') || '',
          low_stock_threshold: parseInt(get('low_stock_threshold'), 10) || 20,
          is_controlled: (get('is_controlled') || '').toLowerCase() === 'yes',
          ppb_category: get('ppb_category') || null,
        })
      })

      setImportErrors(errors)
      setImportRows(parsed)
    }

    reader.readAsText(file)
    event.target.value = ''
  }

  async function runImport() {
    if (!importRows.length) return

    setImporting(true)

    const names = importRows.map(row => row.drug_name)
    const { data: existing } = await supabase
      .from('inventory')
      .select('drug_name')
      .eq('pharmacy_id', pharmacyId)
      .in('drug_name', names)

    const existingNames = new Set((existing || []).map(entry => entry.drug_name))
    const toInsert = importRows.filter(row => !existingNames.has(row.drug_name))
    const skipped = importRows.length - toInsert.length

    let inserted = 0
    if (toInsert.length > 0) {
      for (let index = 0; index < toInsert.length; index += 100) {
        const chunk = toInsert.slice(index, index + 100)
        const { error } = await supabase.from('inventory').insert(chunk)
        if (error) {
          notifyError('Import error: ' + error.message, { title: 'Import failed' })
          setImporting(false)
          return
        }
        inserted += chunk.length
      }
    }

    setImporting(false)
    setImportDone({ inserted, skipped })
    setImportRows([])
    notifyInfo(`Import complete: ${inserted} added, ${skipped} skipped.`, { title: 'Inventory import' })
    fetchData()
  }

  if (loading) return <div style={s.loading}>Loading inventory...</div>

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Inventory Management</h2>
          <p style={s.subtitle}>
            {drugs.length} drugs | {drugs.filter(drug => drug.quantity <= (drug.low_stock_threshold || 20)).length} low stock | {drugs.filter(drug => drug.is_controlled).length} controlled
          </p>
        </div>
        {canEdit && (
          <div style={s.headerActions}>
            <button onClick={exportCSV} style={s.btnSecondary}>Export CSV</button>
            <button onClick={openAdd} style={s.btnPrimary}>+ Add Drug</button>
          </div>
        )}
      </div>

      <div style={s.tabs}>
        {[
          ['inventory', `Inventory (${drugs.length})`],
          ['reorder', `Reorder List (${reorderList.length})`],
          ['orders', `Purchase Orders (${purchaseOrders.length})`],
          ['import', 'Bulk Import'],
        ].map(([id, label]) => (
          <button key={id} style={activeTab === id ? s.tabActive : s.tab} onClick={() => setActiveTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'inventory' && (
        <>
          <div style={s.filterRow}>
            <input
              style={s.search}
              placeholder="Search drug name, code, supplier..."
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
            <select style={s.select} value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
              {categories.map(category => <option key={category}>{category}</option>)}
            </select>
            <select style={s.select} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              {['All', 'In Stock', 'Low Stock', 'Out of Stock', 'Expiring Soon', 'Expired'].map(status => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>

          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Drug Name', 'Code', 'Category', 'Qty', 'Price', 'Cost', 'Expiry', 'Supplier', 'Status', 'Actions']
                    .map(header => <th key={header} style={s.th}>{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ ...s.td, textAlign: 'center', color: '#999', padding: '30px' }}>
                      No drugs found.
                    </td>
                  </tr>
                )}
                {filtered.map((drug, index) => {
                  const status = getStatus(drug)
                  const margin = drug.cost_price_kes && drug.price_kes
                    ? (((drug.price_kes - drug.cost_price_kes) / drug.price_kes) * 100).toFixed(0)
                    : null

                  return (
                    <tr key={drug.id} style={index % 2 ? { background: '#f9fbf9' } : {}}>
                      <td style={s.td}>
                        <div style={{ fontWeight: '500' }}>{drug.drug_name}</div>
                        {drug.is_controlled && <span style={s.controlledBadge}>Controlled</span>}
                      </td>
                      <td style={s.td}>{drug.drug_code || '-'}</td>
                      <td style={s.td}>{drug.category || '-'}</td>
                      <td style={{ ...s.td, fontWeight: '600', color: drug.quantity <= (drug.low_stock_threshold || 20) ? '#E09B00' : '#111' }}>
                        {drug.quantity}
                      </td>
                      <td style={s.td}>{formatCurrency(drug.price_kes || 0)}</td>
                      <td style={s.td}>
                        {drug.cost_price_kes
                          ? (
                            <span>
                              {Number(drug.cost_price_kes).toLocaleString()}
                              {margin !== null && <span style={s.marginBadge}>{margin}%</span>}
                            </span>
                          )
                          : <span style={{ color: '#ccc' }}>-</span>}
                      </td>
                      <td style={s.td}>{drug.expiry_date || '-'}</td>
                      <td style={s.td}>{drug.supplier_name || '-'}</td>
                      <td style={s.td}>
                        <span style={{ ...s.statusBadge, color: status.color, background: status.bg }}>
                          {status.label}
                        </span>
                      </td>
                      <td style={s.td}>
                        {canEdit ? (
                          <div style={s.actionBtns}>
                            <button onClick={() => openEdit(drug)} style={s.btnEdit}>Edit</button>
                            <button onClick={() => deleteDrug(drug)} style={s.btnDelete}>Delete</button>
                            {drug.quantity <= (drug.low_stock_threshold || 20) && (
                              <button onClick={() => openReorder(drug)} style={s.btnReorder}>Reorder</button>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#bbb', fontSize: '11px' }}>Owner only</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'reorder' && (
        <div>
          <div style={s.reorderHeader}>
            <div>
              <p style={s.reorderSub}>
                {reorderList.length === 0
                  ? 'All items are sufficiently stocked.'
                  : `${reorderList.length} item${reorderList.length !== 1 ? 's' : ''} need restocking. Create a purchase order and send it to the supplier.`}
              </p>
            </div>
            {reorderList.length > 0 && (
              <button onClick={exportReorderCSV} style={s.btnSecondary}>Export Reorder CSV</button>
            )}
          </div>

          {reorderList.length > 0 && (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Drug Name', 'Code', 'Category', 'Current Qty', 'Min Level', 'Suggested Order', 'Supplier', 'Status', 'Action']
                      .map(header => <th key={header} style={s.th}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {reorderList.map((drug, index) => {
                    const status = getStatus(drug)
                    const threshold = drug.low_stock_threshold || 20
                    const suggested = threshold * 3

                    return (
                      <tr key={drug.id} style={index % 2 ? { background: '#f9fbf9' } : {}}>
                        <td style={s.td}><strong>{drug.drug_name}</strong></td>
                        <td style={s.td}>{drug.drug_code || '-'}</td>
                        <td style={s.td}>{drug.category || '-'}</td>
                        <td style={{ ...s.td, color: status.color, fontWeight: '700' }}>{drug.quantity}</td>
                        <td style={s.td}>{threshold}</td>
                        <td style={{ ...s.td, color: '#0F6E56', fontWeight: '600' }}>{suggested} units</td>
                        <td style={s.td}>{drug.supplier_name || '-'}</td>
                        <td style={s.td}>
                          <span style={{ ...s.statusBadge, color: status.color, background: status.bg }}>
                            {status.label}
                          </span>
                        </td>
                        <td style={s.td}>
                          {canEdit && (
                            <button onClick={() => openReorder(drug)} style={s.btnReorder}>
                              Create PO
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'orders' && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {['Drug Name', 'Qty Ordered', 'Supplier', 'Status', 'Date Created', 'Action']
                  .map(header => <th key={header} style={s.th}>{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#999', padding: '30px' }}>
                    No purchase orders created yet.
                  </td>
                </tr>
              )}
              {purchaseOrders.map((order, index) => {
                const isReceived = order.status === 'Received'

                return (
                  <tr key={order.id || `${order.drug_name}-${index}`} style={index % 2 ? { background: '#f9fbf9' } : {}}>
                    <td style={s.td}>{order.drug_name || '-'}</td>
                    <td style={s.td}>{order.qty_ordered || 0}</td>
                    <td style={s.td}>{order.supplier_name || '-'}</td>
                    <td style={s.td}>
                      <span style={isReceived ? s.statusReceived : s.statusPending}>
                        {order.status || 'Pending'}
                      </span>
                    </td>
                    <td style={s.td}>{formatDateTime(order.ordered_at || order.sent_at || order.created_at)}</td>
                    <td style={s.td}>
                      {isReceived ? (
                        <span style={s.receivedText}>Received</span>
                      ) : (
                        <button
                          style={s.btnPrimary}
                          onClick={() => markOrderReceived(order)}
                          disabled={receivingOrderId === order.id}
                        >
                          {receivingOrderId === order.id ? 'Receiving...' : 'Mark as Received'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'import' && (
        <div style={s.importSection}>
          <div style={s.importCard}>
            <div style={s.importTitle}>Bulk Import Drugs from CSV</div>
            <p style={s.importDesc}>
              Upload a CSV file to add many drugs at once. Drugs with a name that already exists in your inventory will be skipped.
            </p>

            <div style={s.importStep}>
              <div style={s.stepNum}>1</div>
              <div>
                <div style={s.stepTitle}>Download the template</div>
                <div style={s.stepDesc}>Fill it in Excel or Google Sheets, then save as CSV.</div>
                <button style={{ ...s.btnSecondary, marginTop: '8px' }} onClick={downloadTemplate}>
                  Download CSV Template
                </button>
              </div>
            </div>

            <div style={s.importStep}>
              <div style={s.stepNum}>2</div>
              <div style={{ flex: 1 }}>
                <div style={s.stepTitle}>Upload your filled CSV</div>
                <div style={s.stepDesc}>Required columns: drug_name, quantity, price_kes</div>
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                  <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileUpload} />
                  <button style={s.btnPrimary} onClick={() => fileInputRef.current?.click()}>
                    Choose CSV File
                  </button>
                </div>
              </div>
            </div>

            {importErrors.length > 0 && (
              <div style={s.errorBox}>
                <strong>{importErrors.length} issue{importErrors.length !== 1 ? 's' : ''} found. Fix your CSV and re-upload:</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                  {importErrors.map((error, index) => (
                    <li key={index} style={{ fontSize: '12px', marginBottom: '3px' }}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {importRows.length > 0 && (
              <div style={s.importStep}>
                <div style={s.stepNum}>3</div>
                <div style={{ flex: 1 }}>
                  <div style={s.stepTitle}>Preview - {importRows.length} rows ready to import</div>
                  <div style={{ overflowX: 'auto', marginTop: '10px' }}>
                    <table style={{ ...s.table, fontSize: '11px' }}>
                      <thead>
                        <tr>
                          {['Drug Name', 'Code', 'Category', 'Qty', 'Price', 'Cost', 'Expiry', 'Supplier', 'Controlled']
                            .map(header => <th key={header} style={s.th}>{header}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 10).map((row, index) => (
                          <tr key={index} style={index % 2 ? { background: '#f9fbf9' } : {}}>
                            <td style={s.td}>{row.drug_name}</td>
                            <td style={s.td}>{row.drug_code || '-'}</td>
                            <td style={s.td}>{row.category || '-'}</td>
                            <td style={s.td}>{row.quantity}</td>
                            <td style={s.td}>{row.price_kes}</td>
                            <td style={s.td}>{row.cost_price_kes || '-'}</td>
                            <td style={s.td}>{row.expiry_date || '-'}</td>
                            <td style={s.td}>{row.supplier_name || '-'}</td>
                            <td style={s.td}>{row.is_controlled ? 'Yes' : 'No'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importRows.length > 10 && (
                    <p style={{ fontSize: '11px', color: '#888', marginTop: '6px' }}>
                      ... and {importRows.length - 10} more rows
                    </p>
                  )}
                  <button style={{ ...s.btnPrimary, marginTop: '12px' }} onClick={runImport} disabled={importing}>
                    {importing ? 'Importing...' : `Import ${importRows.length} Drugs`}
                  </button>
                </div>
              </div>
            )}

            {importDone && (
              <div style={s.successBox}>
                Import complete - <strong>{importDone.inserted} drugs added</strong>
                {importDone.skipped > 0 && `, ${importDone.skipped} skipped (already exist)`}
              </div>
            )}
          </div>

          <div style={s.importCard}>
            <div style={s.importTitle}>CSV Column Reference</div>
            <table style={{ ...s.table, marginTop: '8px' }}>
              <thead>
                <tr>
                  <th style={s.th}>Column</th>
                  <th style={s.th}>Required</th>
                  <th style={s.th}>Format / Example</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['drug_name', 'Yes', 'Amoxicillin 500mg'],
                  ['drug_code', 'No', 'AMOX-500'],
                  ['barcode', 'No', '6001234567890'],
                  ['category', 'No', 'Antibiotic'],
                  ['quantity', 'Yes', '200 (whole number)'],
                  ['price_kes', 'Yes', '45 (number only, no KES)'],
                  ['cost_price_kes', 'No', '28 (your buying price)'],
                  ['expiry_date', 'No', 'YYYY-MM-DD e.g. 2026-12-31'],
                  ['supplier_name', 'No', 'Dawa Ltd'],
                  ['low_stock_threshold', 'No', '20 (default if blank)'],
                  ['is_controlled', 'No', 'Yes or No'],
                  ['ppb_category', 'No', 'Opioid Analgesic'],
                ].map(([column, required, format]) => (
                  <tr key={column}>
                    <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '11px' }}>{column}</td>
                    <td style={{ ...s.td, color: required === 'Yes' ? '#0F6E56' : '#888' }}>{required}</td>
                    <td style={{ ...s.td, color: '#555' }}>{format}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <h3 style={s.modalTitle}>
              {editingDrug ? `Edit - ${editingDrug.drug_name}` : 'Add New Drug'}
            </h3>
            <div style={s.formGrid}>
              {[
                ['drug_name', 'Drug Name *', 'text'],
                ['drug_code', 'Drug Code (e.g. AMOX-500)', 'text'],
                ['barcode', 'Barcode', 'text'],
                ['category', 'Category', 'text'],
                ['quantity', 'Current Quantity *', 'number'],
                ['price_kes', 'Selling Price (KES) *', 'number'],
                ['cost_price_kes', 'Cost / Buying Price (KES)', 'number'],
                ['expiry_date', 'Expiry Date', 'date'],
                ['supplier_name', 'Supplier Name', 'text'],
                ['low_stock_threshold', 'Low Stock Alert Level', 'number'],
              ].map(([key, label, type]) => (
                <div key={key} style={s.formGroup}>
                  <label style={s.label}>{label}</label>
                  <input
                    type={type}
                    style={s.input}
                    value={form[key]}
                    onChange={event => setForm({ ...form, [key]: event.target.value })}
                  />
                </div>
              ))}
            </div>

            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '12px' }}>
              Cost price is used to calculate your profit margin. It will not appear on receipts.
            </div>

            <div style={s.formGroup}>
              <label style={s.label}>
                <input
                  type="checkbox"
                  checked={form.is_controlled}
                  onChange={event => setForm({ ...form, is_controlled: event.target.checked })}
                  style={{ marginRight: '8px' }}
                />
                Controlled Substance (Narcotic / Psychotropic)
              </label>
            </div>

            {form.is_controlled && (
              <div style={s.formGroup}>
                <label style={s.label}>PPB Category</label>
                <input
                  type="text"
                  style={s.input}
                  value={form.ppb_category}
                  onChange={event => setForm({ ...form, ppb_category: event.target.value })}
                  placeholder="e.g. Opioid Analgesic"
                />
              </div>
            )}

            <div style={s.modalFooter}>
              <button
                style={s.btnSecondary}
                onClick={() => {
                  setShowForm(false)
                  setEditingDrug(null)
                  setForm(emptyDrugForm)
                }}
              >
                Cancel
              </button>
              <button style={s.btnPrimary} onClick={saveDrug}>
                {editingDrug ? 'Update Drug' : 'Save Drug'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReorderModal
        form={showReorderModal ? reorderForm : null}
        submitting={reorderSubmitting}
        onChange={updateReorderForm}
        onCancel={closeReorderModal}
        onSave={savePurchaseOrder}
      />

      <POSummaryModal
        order={poSummaryOrder}
        onClose={() => setPoSummaryOrder(null)}
        onPrint={() => printPurchaseOrder(poSummaryOrder)}
        onWhatsApp={() => sendPurchaseOrderWhatsApp(poSummaryOrder)}
        onEmail={() => sendPurchaseOrderEmail(poSummaryOrder)}
      />
    </div>
  )
}

const s = {
  page: { padding: '18px 22px', flex: 1, overflowY: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111', margin: 0 },
  subtitle: { fontSize: '11px', color: '#666', margin: '4px 0 0' },
  headerActions: { display: 'flex', gap: '8px' },
  tabs: { display: 'flex', gap: '4px', marginBottom: '14px', borderBottom: '2px solid #e8ebe8', paddingBottom: '0', flexWrap: 'wrap' },
  tab: { background: 'none', border: 'none', padding: '8px 16px', fontSize: '12px', cursor: 'pointer', color: '#888', borderBottom: '2px solid transparent', marginBottom: '-2px' },
  tabActive: { background: 'none', border: 'none', padding: '8px 16px', fontSize: '12px', cursor: 'pointer', color: '#0F6E56', fontWeight: '600', borderBottom: '2px solid #0F6E56', marginBottom: '-2px' },
  filterRow: { display: 'flex', gap: '8px', marginBottom: '12px' },
  search: { flex: 2, padding: '8px 12px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' },
  select: { flex: 1, padding: '8px 10px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '12px' },
  tableWrap: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '8px 10px', color: '#888', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e8ebe8', background: '#f9fbf9', whiteSpace: 'nowrap' },
  td: { padding: '9px 10px', borderBottom: '1px solid #f0f2f0', color: '#222', verticalAlign: 'middle' },
  statusBadge: { padding: '3px 9px', borderRadius: '99px', fontSize: '10px', fontWeight: '600' },
  controlledBadge: { background: '#FEF3F2', color: '#B91C1C', fontSize: '10px', padding: '1px 6px', borderRadius: '4px', marginLeft: '4px', fontWeight: '500' },
  marginBadge: { background: '#E1F5EE', color: '#0F6E56', fontSize: '10px', padding: '1px 6px', borderRadius: '4px', marginLeft: '4px', fontWeight: '500' },
  actionBtns: { display: 'flex', gap: '5px', flexWrap: 'wrap' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' },
  btnSecondary: { background: '#fff', color: '#333', border: '1px solid #ddd', padding: '8px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' },
  btnEdit: { background: '#EAF4FF', color: '#1A6BB5', border: '1px solid #B8D9F7', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' },
  btnDelete: { background: '#FCEBEB', color: '#C0392B', border: '1px solid #F09595', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' },
  btnReorder: { background: '#FFF4E5', color: '#E67E22', border: '1px solid #F5CBA7', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' },
  btnWhatsapp: { background: '#25D366', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' },
  btnEmail: { background: '#EAF4FF', color: '#1A6BB5', border: '1px solid #B8D9F7', padding: '8px 14px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' },
  reorderHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' },
  reorderSub: { fontSize: '13px', color: '#555', margin: 0 },
  importSection: { display: 'flex', flexDirection: 'column', gap: '14px' },
  importCard: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '18px 20px' },
  importTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '8px' },
  importDesc: { fontSize: '12px', color: '#666', marginBottom: '16px', lineHeight: '1.6' },
  importStep: { display: 'flex', gap: '14px', alignItems: 'flex-start', marginBottom: '16px' },
  stepNum: { width: '26px', height: '26px', background: '#0F6E56', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0 },
  stepTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '2px' },
  stepDesc: { fontSize: '11px', color: '#888' },
  errorBox: { background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', color: '#B91C1C', fontSize: '12px' },
  successBox: { background: '#E1F5EE', border: '1px solid #A7F3D0', borderRadius: '8px', padding: '12px 14px', color: '#065F46', fontSize: '13px', fontWeight: '500' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modal: { background: '#fff', borderRadius: '10px', padding: '24px', width: '700px', maxHeight: '90vh', overflowY: 'auto', maxWidth: 'calc(100vw - 32px)' },
  modalTitle: { fontSize: '15px', fontWeight: '600', color: '#111', marginBottom: '16px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' },
  label: { fontSize: '11px', color: '#555' },
  input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', width: '100%', boxSizing: 'border-box' },
  readOnlyInput: { background: '#f7f8f7', color: '#555' },
  textarea: { minHeight: '92px', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px', flexWrap: 'wrap' },
  modalFooterWrap: { display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '20px', flexWrap: 'wrap', alignItems: 'center' },
  summaryBox: { background: '#f7f8f7', border: '1px solid #e8ebe8', borderRadius: '8px', padding: '12px 14px' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13px', color: '#222', marginBottom: '8px' },
  summaryNotes: { maxWidth: '320px', textAlign: 'right', lineHeight: '1.5' },
  statusPending: { background: '#FFF7E6', color: '#9A6700', padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '600' },
  statusReceived: { background: '#E1F5EE', color: '#0F6E56', padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '600' },
  receivedText: { fontSize: '12px', color: '#0F6E56', fontWeight: '600' },
  loading: { padding: '40px', textAlign: 'center', color: '#666' },
}
