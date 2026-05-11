import React from 'react'

export default function ReceiptModal({ receipt, onPrint }) {
  if (!receipt) return null

  return (
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
        <div style={styles.rLine}><span>Subtotal</span><span>KES {receipt.subtotal?.toLocaleString() || 0}</span></div>
        <div style={styles.rLine}><span>Discount</span><span>KES {receipt.discount?.toLocaleString() || 0}</span></div>
        <div style={styles.rTotal}>
          <span>TOTAL</span>
          <span>KES {receipt.total.toLocaleString()}</span>
        </div>
        <div style={styles.rFooter}>Sale ID: #{receipt.saleId} • {receipt.time}</div>
        <button type="button" style={styles.btnPrint} onClick={onPrint}>Print Receipt</button>
      </div>
    </div>
  )
}

const styles = {
  receiptPreview: { marginTop: '12px' },
  receipt: { background: '#f7f8f7', border: '1px dashed #ccc', borderRadius: '8px', padding: '14px', fontSize: '12px', fontFamily: 'monospace' },
  rTitle: { textAlign: 'center', fontWeight: '700', fontSize: '14px', marginBottom: '8px' },
  rSubtitle: { fontSize: '12px', fontWeight: '600', marginTop: '10px', marginBottom: '6px' },
  rLine: { display: 'flex', justifyContent: 'space-between', marginBottom: '3px', gap: '8px' },
  rTotal: { display: 'flex', justifyContent: 'space-between', fontWeight: '700', borderTop: '1px dashed #ccc', marginTop: '6px', paddingTop: '6px' },
  rFooter: { textAlign: 'center', fontSize: '10px', marginTop: '8px' },
  btnPrint: { marginTop: '12px', width: '100%', background: '#0F6E56', color: '#fff', border: 'none', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' },
}
