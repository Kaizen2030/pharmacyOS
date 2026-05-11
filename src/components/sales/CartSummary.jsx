import React from 'react'

export default function CartSummary({
  subtotal,
  discount,
  onDiscountChange,
  total,
  paymentMethod,
  onPaymentMethodChange,
  specificInsurer,
  onSpecificInsurerChange,
  insurers,
}) {
  return (
    <div style={styles.summaryBox}>
      <div style={styles.summaryHeader}>Cart summary</div>
      <div style={styles.summaryRow}>
        <span>Subtotal</span>
        <strong>KES {subtotal.toLocaleString()}</strong>
      </div>
      <div style={styles.summaryRow}>
        <span>Discount</span>
        <strong>KES {discount.toLocaleString()}</strong>
      </div>
      <div style={styles.summaryRowTotal}>
        <span>Total</span>
        <strong>KES {total.toLocaleString()}</strong>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Payment Method</label>
        <select style={styles.input} value={paymentMethod} onChange={e => onPaymentMethodChange(e.target.value)}>
          <option value="M-Pesa">M-Pesa</option>
          <option value="Cash">Cash</option>
          <option value="SHA">SHA / SHIF / NHIF / PHC</option>
          <option value="Insurance">Private Insurance</option>
          <option value="Credit (Debt)">Credit (Debt)</option>
        </select>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Cart Discount (KES)</label>
        <input
          type="number"
          min="0"
          style={styles.input}
          value={discount}
          onChange={e => onDiscountChange(e.target.value)}
          placeholder="0"
        />
      </div>

      {paymentMethod === 'Insurance' && (
        <div style={styles.formGroup}>
          <label style={styles.label}>Specific Insurer</label>
          <select style={styles.input} value={specificInsurer} onChange={e => onSpecificInsurerChange(e.target.value)}>
            <option value="">-- Select Insurer --</option>
            {insurers.map(insurer => (
              <option key={insurer} value={insurer}>{insurer}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

const styles = {
  summaryBox: { background: '#f7f8f7', borderRadius: '8px', padding: '14px', border: '1px solid #e8ebe8', marginBottom: '12px' },
  summaryHeader: { fontSize: '13px', fontWeight: '700', color: '#111', marginBottom: '12px' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#555', marginBottom: '8px' },
  summaryRowTotal: { display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '700', marginTop: '8px', color: '#0F6E56' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' },
  label: { fontSize: '11px', color: '#666' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' },
}
