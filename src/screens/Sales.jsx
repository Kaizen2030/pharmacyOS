import { useEffect, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'

export default function Sales() {
  const { pharmacyId, userId, pharmacyName, currentUserName } = usePharmacy()

  const displayPharmacyName = pharmacyName || 'My Pharmacy'
  const pharmacyLicense = 'PPB/C/2026'

  const [drugs, setDrugs] = useState([])
  const [salesLog, setSalesLog] = useState([])
  const [patient, setPatient] = useState('')
  const [soldBy, setSoldBy] = useState('')
  const [selectedDrug, setSelectedDrug] = useState(null)
  const [qty, setQty] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState('M-Pesa')
  const [specificInsurer, setSpecificInsurer] = useState('')
  const [cartItems, setCartItems] = useState([])
  const [receipt, setReceipt] = useState(null)
  const [loading, setLoading] = useState(true)

  const insurers = ['AAR', 'JUBILEE', 'BRITAM', 'MADISON', 'CIC', 'UAP', 'RESOLUTION', 'OTHER']

  useEffect(() => {
    if (pharmacyId) {
      fetchDrugs()
      fetchTodaySales()
    }
  }, [pharmacyId])

  useEffect(() => {
    setSoldBy(currentUserName || '')
  }, [currentUserName])

  async function fetchDrugs() {
    if (!pharmacyId) return

    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .order('drug_name')

    if (error) {
      console.error('Failed to load drugs:', error)
      alert('Unable to load inventory. Please refresh the page.')
      return
    }

    setDrugs(data || [])
  }

  async function fetchTodaySales() {
    if (!pharmacyId) return

    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('sales_ledger')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .gte('sold_at', today)
      .order('sold_at', { ascending: false })

    if (error) {
      console.error('Failed to load sales log:', error)
      alert('Unable to load sales log. Please refresh the page.')
      setLoading(false)
      return
    }

    setSalesLog(data || [])
    setLoading(false)
  }

  function calculateTotal() {
    if (!selectedDrug) return 0
    return parseFloat(selectedDrug.price_kes) * qty
  }

  function getCartTotal() {
    return cartItems.reduce((sum, item) => sum + item.total, 0)
  }

  function addToCart() {
    if (!selectedDrug) return alert('Please select a drug to add to cart')
    if (qty < 1 || Number.isNaN(qty)) return alert('Please enter a valid quantity')
    if (paymentMethod === 'Insurance' && !specificInsurer) return alert('Please select an insurer for Insurance payments')

    const item = {
      id: `${selectedDrug.id}-${Date.now()}`,
      drug_name: selectedDrug.drug_name,
      qty,
      unit_price: parseFloat(selectedDrug.price_kes),
      total: parseFloat(selectedDrug.price_kes) * qty
    }

    setCartItems(prev => [...prev, item])
    setSelectedDrug(null)
    setQty(1)
  }

  function removeCartItem(itemId) {
    setCartItems(prev => prev.filter(item => item.id !== itemId))
  }

  async function processSale() {
    if (!pharmacyId) return alert('No pharmacy selected. Please sign in again.')
    if (cartItems.length === 0) return alert('Add at least one drug to the cart before processing the sale')
    if (paymentMethod === 'Insurance' && !specificInsurer) return alert('Please select an insurer for Insurance payments')

    const customer_name = patient.trim() || 'Walk-in'
    const soldAt = new Date().toISOString()
    const saleData = cartItems.map(item => ({
      drug_name: item.drug_name,
      qty_sold: item.qty,
      total_kes: item.total,
      payment_method: paymentMethod,
      insurer: paymentMethod === 'Insurance' ? specificInsurer : null,
      customer_name,
      sold_at: soldAt,
      cashier_id: userId || 'AD',
      pharmacy_id: pharmacyId
    }))

    const { error } = await supabase.from('sales_ledger').insert(saleData)
    if (error) {
      console.error('Sales insert error:', error)
      return alert('Error saving sale: ' + error.message)
    }

    setReceipt({
      items: cartItems,
      total: getCartTotal(),
      saleId: Math.floor(1000 + Math.random() * 9000),
      time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      pharmacyName: displayPharmacyName,
      pharmacyLicense,
      customer_name,
      soldBy: soldBy.trim() || currentUserName || 'Unknown',
      payment_method: paymentMethod,
      insurer: paymentMethod === 'Insurance' ? specificInsurer : null
    })

    fetchTodaySales()
    setPatient('')
    setQty(1)
    setSpecificInsurer('')
    setSelectedDrug(null)
    setCartItems([])
  }

  function printReceipt() {
    if (!receipt) return alert('No receipt to print')
    const printWin = window.open('', '_blank')
    printWin.document.write(`
      <div style="font-family:monospace;padding:25px;max-width:420px;margin:0 auto;line-height:1.6">
        <h2 style="text-align:center">${receipt.pharmacyName}</h2>
        <p style="text-align:center">Nairobi, Kenya | ${receipt.pharmacyLicense}</p>
        <hr style="margin:15px 0">
        <p><strong>Customer:</strong> ${receipt.customer_name}</p>
        <p><strong>Sold by:</strong> ${receipt.soldBy || 'Unknown'}</p>
        <p><strong>Payment:</strong> ${receipt.payment_method}${receipt.insurer ? ` - ${receipt.insurer}` : ''}</p>
        <hr style="margin:15px 0">
        <div style="margin-bottom:8px">
          <strong>Items</strong>
        </div>
        ${receipt.items?.map(item => `<p style="margin:0 0 4px"><span>${item.drug_name} x${item.qty}</span> <span style="float:right">KES ${item.total.toLocaleString()}</span></p>`).join('')}
        <hr style="margin:15px 0">
        <h3 style="text-align:right">TOTAL: KES ${receipt.total.toLocaleString()}</h3>
        <p style="text-align:center;font-size:11px;margin-top:20px">Sale ID: #${receipt.saleId} • ${receipt.time}</p>
      </div>
    `)
    printWin.document.close()
    printWin.print()
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <h2 style={styles.title}>Sales & POS</h2>
        <span style={styles.date}>Point of Sale</span>
      </div>

      <div style={styles.twoCol}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>New Sale</div>

          <div style={styles.formRow}>
            <label style={styles.label}>Patient / Customer Name</label>
            <input style={styles.input} value={patient} onChange={e => setPatient(e.target.value)} placeholder="e.g. John Kamau" />
          </div>

          <div style={styles.formRow}>
            <label style={styles.label}>Sold by</label>
            <input
              style={styles.input}
              value={soldBy}
              onChange={e => setSoldBy(e.target.value)}
              placeholder="e.g. Jane Mwangi"
            />
          </div>

          <div style={styles.formRow}>
            <label style={styles.label}>Drug</label>
            <select
              style={styles.input}
              value={selectedDrug ? selectedDrug.drug_name : ''}
              onChange={e => {
                const drug = drugs.find(d => d.drug_name === e.target.value)
                setSelectedDrug(drug)
              }}
            >
              <option value="">— Select drug —</option>
              {drugs.map(d => (
                <option key={d.id} value={d.drug_name}>
                  {d.drug_name} — KES {parseFloat(d.price_kes).toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.formRow}>
            <label style={styles.label}>Quantity</label>
            <input type="number" style={styles.input} value={qty} min="1" onChange={e => setQty(parseInt(e.target.value) || 1)} />
          </div>

          <div style={styles.formRow}>
            <label style={styles.label}>Payment Method</label>
            <select style={styles.input} value={paymentMethod} onChange={e => {
              setPaymentMethod(e.target.value)
              if (e.target.value !== 'Insurance') setSpecificInsurer('')
            }}>
              <option value="M-Pesa">M-Pesa</option>
              <option value="Cash">Cash</option>
              <option value="SHA">SHA / SHIF / NHIF / PHC</option>
              <option value="Insurance">Private Insurance</option>
              <option value="Credit (Debt)">Credit (Debt)</option>
            </select>
          </div>

          {paymentMethod === 'Insurance' && (
            <div style={styles.formRow}>
              <label style={styles.label}>Specific Insurer</label>
              <select style={styles.input} value={specificInsurer} onChange={e => setSpecificInsurer(e.target.value)}>
                <option value="">— Select Insurer —</option>
                {insurers.map(ins => (
                  <option key={ins} value={ins}>{ins}</option>
                ))}
              </select>
            </div>
          )}

          {cartItems.length > 0 && (
            <div style={styles.cartBox}>
              <div style={styles.cartHeader}>Cart items ({cartItems.length})</div>
              {cartItems.map(item => (
                <div key={item.id} style={styles.cartRow}>
                  <div>
                    <div style={styles.cartName}>{item.drug_name}</div>
                    <div style={styles.cartMeta}>Qty: {item.qty} • KES {item.unit_price.toLocaleString()}</div>
                  </div>
                  <div style={styles.cartRight}>
                    <div style={styles.cartTotal}>KES {item.total.toLocaleString()}</div>
                    <button style={styles.cartRemove} onClick={() => removeCartItem(item.id)}>Remove</button>
                  </div>
                </div>
              ))}
              <div style={styles.cartSummary}>
                <span>Cart total</span>
                <strong>KES {getCartTotal().toLocaleString()}</strong>
              </div>
            </div>
          )}

          <div style={styles.receiptBox}>
            <div style={styles.receiptLine}><span>Unit Price</span><span>KES {selectedDrug ? parseFloat(selectedDrug.price_kes).toLocaleString() : '0'}</span></div>
            <div style={styles.receiptLine}><span>Quantity</span><span>{qty}</span></div>
            <div style={styles.totalLine}>
              <span>TOTAL</span>
              <span style={{ fontSize: '18px', fontWeight: '700', color: '#0F6E56' }}>KES {calculateTotal().toLocaleString()}</span>
            </div>
          </div>

          <div style={styles.btnRow}>
            <button style={styles.btnPrimary} onClick={addToCart}>Add to Cart</button>
            <button style={styles.btnSecondary} onClick={processSale}>Process Sale</button>
            <button style={styles.btnSecondary} onClick={printReceipt}>Print Receipt</button>
          </div>

          {receipt && (
            <div style={styles.receiptPreview}>
              <div style={styles.receipt}>
                        <div style={styles.rTitle}>{receipt.pharmacyName}</div>
                <div style={styles.rLine}><span>Customer:</span><span>{receipt.customer_name}</span></div>
                <div style={styles.rLine}><span>Sold by:</span><span>{receipt.soldBy || 'Unknown'}</span></div>
                <div style={styles.rLine}><span>Payment:</span><span>{receipt.payment_method}{receipt.insurer ? ` - ${receipt.insurer}` : ''}</span></div>
                <div style={styles.rSubtitle}>Items</div>
                {receipt.items?.map((item, index) => (
                  <div key={index} style={styles.rLine}>
                    <span>{item.drug_name} x{item.qty}</span>
                    <span>KES {item.total.toLocaleString()}</span>
                  </div>
                ))}
                <div style={styles.rTotal}>
                  <span>TOTAL</span>
                  <span>KES {receipt.total.toLocaleString()}</span>
                </div>
                <div style={styles.rFooter}>Sale ID: #{receipt.saleId} • {receipt.time}</div>
              </div>
            </div>
          )}
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Today's sales log</div>
          {salesLog.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#999', padding: '30px', fontSize: '13px' }}>No sales recorded today yet.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Time</th>
                  <th style={styles.th}>Patient</th>
                  <th style={styles.th}>Drug</th>
                  <th style={styles.th}>Cashier</th>
                  <th style={styles.th}>Amount</th>
                  <th style={styles.th}>Method</th>
                </tr>
              </thead>
              <tbody>
                {salesLog.map(s => (
                  <tr key={s.id}>
                    <td style={styles.td}>{new Date(s.sold_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={styles.td}>{s.customer_name}</td>
                    <td style={styles.td}>{s.drug_name} x{s.qty_sold}</td>
                    <td style={styles.td}>{s.cashier_name || s.cashier_id || '—'}</td>
                    <td style={styles.td}>KES {s.total_kes}</td>
                    <td style={styles.td}>
                      <span style={s.payment_method?.includes('M-Pesa') ? styles.pillGreen : styles.pillBlue}>
                        {s.payment_method}{s.insurer ? ` - ${s.insurer}` : ''}
                      </span>
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
  page: { padding: '18px 22px', flex: 1 },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111' },
  date: { fontSize: '12px', color: '#888' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  card: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '14px 16px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '12px' },
  formRow: { marginBottom: '12px' },
  label: { fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' },
  input: { width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px' },
  receiptBox: { background: '#f7f8f7', borderRadius: '8px', padding: '12px', marginBottom: '12px', border: '1px solid #e8ebe8' },
  receiptLine: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666', marginBottom: '4px' },
  totalLine: { display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: '600', color: '#0F6E56', borderTop: '1px dashed #ddd', paddingTop: '8px', marginTop: '8px' },
  btnRow: { display: 'flex', gap: '8px' },
  btnPrimary: { flex: 1, background: '#0F6E56', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '500', cursor: 'pointer' },
  btnSecondary: { flex: 1, background: '#fff', color: '#333', border: '1px solid #ddd', padding: '10px', borderRadius: '8px', cursor: 'pointer' },
  cartBox: { background: '#f7f8f7', borderRadius: '8px', padding: '12px', marginBottom: '12px', border: '1px solid #e8ebe8' },
  cartHeader: { fontSize: '13px', fontWeight: '600', marginBottom: '10px' },
  cartRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #e8ebe8' },
  cartName: { fontSize: '13px', fontWeight: '600' },
  cartMeta: { fontSize: '11px', color: '#666' },
  cartRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' },
  cartTotal: { fontSize: '13px', fontWeight: '700', color: '#0F6E56' },
  cartRemove: { border: 'none', background: 'transparent', color: '#E24B4A', cursor: 'pointer', fontSize: '11px' },
  cartSummary: { display: 'flex', justifyContent: 'space-between', fontWeight: '700', paddingTop: '10px', fontSize: '13px' },
  receiptPreview: { marginTop: '12px' },
  receipt: { background: '#f7f8f7', border: '1px dashed #ccc', borderRadius: '8px', padding: '14px', fontSize: '12px', fontFamily: 'monospace' },
  rTitle: { textAlign: 'center', fontWeight: '700', fontSize: '14px', marginBottom: '8px' },
  rSubtitle: { fontSize: '12px', fontWeight: '600', marginTop: '10px', marginBottom: '6px' },
  rLine: { display: 'flex', justifyContent: 'space-between', marginBottom: '3px' },
  rTotal: { display: 'flex', justifyContent: 'space-between', fontWeight: '700', borderTop: '1px dashed #ccc', marginTop: '6px', paddingTop: '6px' },
  rFooter: { textAlign: 'center', fontSize: '10px', marginTop: '8px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '7px 10px', color: '#888', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e8ebe8' },
  td: { padding: '9px 10px', borderBottom: '1px solid #f0f2f0', color: '#222' },
  pillGreen: { background: '#E1F5EE', color: '#0F6E56', padding: '2px 9px', borderRadius: '99px', fontSize: '11px', fontWeight: '500' },
  pillBlue: { background: '#E6F1FB', color: '#185FA5', padding: '2px 9px', borderRadius: '99px', fontSize: '11px', fontWeight: '500' }
}
