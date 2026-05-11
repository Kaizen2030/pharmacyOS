import React from 'react'
import CartItem from './CartItem'
import CartSummary from './CartSummary'
import DrugSearchBar from './DrugSearchBar'
import ReceiptModal from './ReceiptModal'
import HeldSalesPanel from './HeldSalesPanel'
import StaffSwitchModal from './StaffSwitchModal'

export default function SalesPanel({
  activeShift,
  shiftTotals,
  patient,
  patientResults,
  selectedPatient,
  searchPatients,
  selectPatient,
  operatorName,
  operatorRole,
  activePosStaff,
  authenticatedStaff,
  setShowStaffSwitchModal,
  resetStaffSession,
  drugs,
  selectedDrug,
  drugSearch,
  scanning,
  scanValue,
  setDrugSearch,
  setSelectedDrug,
  onScanSubmit,
  scanningToggle,
  setScanValue,
  qty,
  setQty,
  paymentMethod,
  specificInsurer,
  cartDiscount,
  setCartDiscount,
  setPaymentMethod,
  insurers,
  cartItems,
  addToCart,
  holdCurrentSale,
  resetCurrentSale,
  processSale,
  printReceipt,
  removeCartItem,
  updateCartItemQty,
  heldSales,
  loadHeldSale,
  removeHeldSale,
  receipt,
  salesLog,
  processingSale,
  loading,
  showStaffSwitchModal,
  staffPin,
  staffPinLoading,
  setStaffPin,
  switchStaffWithPin,
  getCartSubtotal,
  getDiscountAmount,
  getCartTotal,
}) {
  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <h2 style={styles.title}>Sales & POS</h2>
        <span style={styles.date}>Point of Sale</span>
      </div>

      {activeShift ? (
        <div style={styles.shiftBanner}>
          <div>
            <strong>Active shift:</strong> {activeShift.cashier_name || 'Staff'} · {new Date(activeShift.opened_at).toLocaleString('en-GB')}
          </div>
          <div style={styles.shiftMeta}>
            <span>Cash KES {shiftTotals.cash.toLocaleString()}</span>
            <span>M-Pesa KES {shiftTotals.mpesa.toLocaleString()}</span>
            <span>Credit KES {shiftTotals.credit.toLocaleString()}</span>
          </div>
        </div>
      ) : (
        <div style={styles.infoBanner}>
          No open shift found. Sales can still be recorded, but you will be asked to confirm before processing and the sale will not be linked to a shift.
        </div>
      )}

      <div style={styles.twoCol}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>New Sale</div>

          <div style={styles.formRow}>
            <label style={styles.label}>Patient / Customer Name</label>
            <input
              style={styles.input}
              value={patient}
              onChange={event => searchPatients(event.target.value)}
              placeholder="Search patient or type walk-in name"
            />
            {patientResults.length > 0 && (
              <div style={styles.resultsBox}>
                {patientResults.map(result => (
                  <button key={result.id} type="button" style={styles.resultItem} onClick={() => selectPatient(result)}>
                    <span>{result.full_name}</span>
                    <span style={styles.resultMeta}>{result.phone || result.sha_member_no || 'No phone'}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedPatient?.allergies && (
              <div style={styles.allergyAlert}>Allergy alert: {selectedPatient.allergies}</div>
            )}
          </div>

          <div style={styles.formRow}>
            <label style={styles.label}>Sold by</label>
            <div style={styles.operatorBox}>
              <div>
                <div style={styles.operatorName}>{operatorName}</div>
                <div style={styles.operatorMeta}>
                  {operatorRole}
                  {activePosStaff?.verifiedBy === 'pin' ? ' - verified by PIN' : ' - signed in account'}
                </div>
              </div>
              <div style={styles.operatorActions}>
                <button type="button" style={styles.smallBtn} onClick={() => setShowStaffSwitchModal(true)}>
                  Switch Staff PIN
                </button>
                {authenticatedStaff && activePosStaff?.id !== authenticatedStaff.id && (
                  <button type="button" style={styles.smallBtnSecondary} onClick={resetStaffSession}>
                    Use My Account
                  </button>
                )}
              </div>
            </div>
          </div>

          <DrugSearchBar
            drugs={drugs}
            selectedDrug={selectedDrug}
            searchValue={drugSearch}
            onSearchChange={value => {
              setDrugSearch(value)
              setSelectedDrug(null)
            }}
            onSelectDrug={drug => {
              setSelectedDrug(drug)
              setDrugSearch('')
            }}
            scanning={scanning}
            scanValue={scanValue}
            onToggleScanning={scanningToggle}
            onScanChange={value => setScanValue(value)}
            onScanSubmit={onScanSubmit}
          />

          <div style={styles.formRow}>
            <label style={styles.label}>Quantity</label>
            <input
              type="number"
              style={styles.input}
              value={qty}
              min="1"
              onChange={event => setQty(parseInt(event.target.value, 10) || 1)}
            />
          </div>

          <CartSummary
            subtotal={getCartSubtotal()}
            discount={getDiscountAmount()}
            onDiscountChange={value => setCartDiscount(value)}
            total={getCartTotal()}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={value => {
              setPaymentMethod(value)
              if (value !== 'Insurance') setSpecificInsurer('')
            }}
            specificInsurer={specificInsurer}
            onSpecificInsurerChange={value => setSpecificInsurer(value)}
            insurers={insurers}
          />

          {cartItems.length > 0 && (
            <div style={styles.cartBox}>
              <div style={styles.cartHeader}>Cart items ({cartItems.length})</div>
              {cartItems.map(item => (
                <CartItem
                  key={item.id}
                  item={item}
                  onChangeQty={updateCartItemQty}
                  onRemove={removeCartItem}
                />
              ))}
            </div>
          )}

          <HeldSalesPanel heldSales={heldSales} onResume={loadHeldSale} onDelete={removeHeldSale} />

          <div style={styles.receiptBox}>
            <div style={styles.receiptLine}><span>Unit Price</span><span>KES {selectedDrug ? parseFloat(selectedDrug.price_kes || 0).toLocaleString() : '0'}</span></div>
            <div style={styles.receiptLine}><span>Quantity</span><span>{qty}</span></div>
            <div style={styles.receiptLine}><span>Cart Subtotal</span><span>KES {getCartSubtotal().toLocaleString()}</span></div>
            <div style={styles.receiptLine}><span>Cart Discount</span><span>KES {getDiscountAmount().toLocaleString()}</span></div>
            <div style={styles.totalLine}>
              <span>TOTAL</span>
              <span style={styles.totalAmount}>KES {getCartTotal().toLocaleString()}</span>
            </div>
          </div>

          <div style={styles.btnRowThree}>
            <button style={styles.btnPrimary} onClick={addToCart}>Add to Cart</button>
            <button style={styles.btnSecondary} onClick={holdCurrentSale} disabled={cartItems.length === 0}>Hold Sale</button>
            <button style={styles.btnSecondary} onClick={resetCurrentSale}>Clear Sale</button>
          </div>

          <div style={styles.btnRowTwo}>
            <button style={styles.btnPrimary} onClick={processSale} disabled={processingSale}>
              {processingSale ? 'Processing...' : 'Process Sale'}
            </button>
            <button style={styles.btnSecondary} onClick={printReceipt}>Print Receipt</button>
          </div>

          {receipt && <ReceiptModal receipt={receipt} onPrint={printReceipt} />}
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Today&apos;s sales log</div>
          {salesLog.length === 0 ? (
            <p style={styles.emptyText}>No sales recorded today yet.</p>
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
                {salesLog.map(sale => (
                  <tr key={sale.id}>
                    <td style={styles.td}>{new Date(sale.sold_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={styles.td}>{sale.customer_name}</td>
                    <td style={styles.td}>{sale.drug_name} x{sale.qty_sold}</td>
                    <td style={styles.td}>{sale.cashier_name || sale.cashier_id || '-'}</td>
                    <td style={styles.td}>KES {parseFloat(sale.total_kes || 0).toLocaleString()}</td>
                    <td style={styles.td}>
                      <span style={sale.payment_method?.includes('M-Pesa') ? styles.pillGreen : styles.pillBlue}>
                        {sale.payment_method}{sale.insurer ? ` - ${sale.insurer}` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <StaffSwitchModal
        show={showStaffSwitchModal}
        staffPin={staffPin}
        staffPinLoading={staffPinLoading}
        setStaffPin={setStaffPin}
        onCancel={() => {
          if (staffPinLoading) return
          setShowStaffSwitchModal(false)
          setStaffPin('')
        }}
        onSwitchStaff={switchStaffWithPin}
      />
    </div>
  )
}

const styles = {
  page: { padding: '18px 22px', flex: 1 },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111' },
  date: { fontSize: '12px', color: '#888' },
  shiftBanner: { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', background: '#E1F5EE', border: '1px solid #B9E4D6', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', fontSize: '12px', color: '#0F6E56', flexWrap: 'wrap' },
  shiftMeta: { display: 'flex', gap: '12px', flexWrap: 'wrap', fontWeight: '600' },
  infoBanner: { background: '#FFF7E6', border: '1px solid #F3D08A', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', fontSize: '12px', color: '#9A6700' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  card: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '14px 16px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '12px' },
  formRow: { marginBottom: '12px', position: 'relative' },
  label: { fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' },
  input: { width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' },
  operatorBox: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', border: '1px solid #ddd', borderRadius: '8px', padding: '10px 12px', background: '#fff' },
  operatorName: { fontSize: '13px', fontWeight: '600', color: '#111' },
  operatorMeta: { fontSize: '11px', color: '#6b7280', marginTop: '3px' },
  operatorActions: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' },
  smallBtn: { background: '#0F6E56', color: '#fff', border: 'none', padding: '7px 10px', borderRadius: '7px', cursor: 'pointer', fontSize: '11px' },
  smallBtnSecondary: { background: '#fff', color: '#333', border: '1px solid #ddd', padding: '7px 10px', borderRadius: '7px', cursor: 'pointer', fontSize: '11px' },
  resultsBox: { border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', marginTop: '6px', overflow: 'hidden' },
  resultItem: { width: '100%', display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '10px 12px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '12px', textAlign: 'left' },
  resultMeta: { color: '#6b7280', fontSize: '11px' },
  allergyAlert: { background: '#FEF2F2', border: '1px solid #F8D7DA', color: '#B91C1C', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', marginTop: '8px' },
  receiptBox: { background: '#f7f8f7', borderRadius: '8px', padding: '12px', marginBottom: '12px', border: '1px solid #e8ebe8' },
  receiptLine: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666', marginBottom: '4px' },
  totalLine: { display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: '600', color: '#0F6E56', borderTop: '1px dashed #ddd', paddingTop: '8px', marginTop: '8px' },
  totalAmount: { fontSize: '18px', fontWeight: '700', color: '#0F6E56' },
  btnRowThree: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', marginTop: '12px' },
  btnRowTwo: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', marginTop: '10px' },
  btnPrimary: { width: '100%', background: '#0F6E56', color: '#fff', border: 'none', padding: '12px 14px', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', minHeight: '46px' },
  btnSecondary: { width: '100%', background: '#fff', color: '#333', border: '1px solid #ddd', padding: '12px 14px', borderRadius: '8px', cursor: 'pointer', minHeight: '46px' },
  cartBox: { background: '#f7f8f7', borderRadius: '8px', padding: '12px', marginBottom: '12px', border: '1px solid #e8ebe8' },
  cartHeader: { fontSize: '13px', fontWeight: '600', marginBottom: '10px' },
  emptyText: { textAlign: 'center', color: '#999', padding: '30px', fontSize: '13px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '7px 10px', color: '#888', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e8ebe8' },
  td: { padding: '9px 10px', borderBottom: '1px solid #f0f2f0', color: '#222', verticalAlign: 'top' },
  pillGreen: { background: '#E1F5EE', color: '#0F6E56', padding: '2px 9px', borderRadius: '99px', fontSize: '11px', fontWeight: '500' },
  pillBlue: { background: '#E6F1FB', color: '#185FA5', padding: '2px 9px', borderRadius: '99px', fontSize: '11px', fontWeight: '500' },
}
