import React from 'react'

export default function HeldSalesPanel({ heldSales, onResume, onDelete }) {
  if (heldSales.length === 0) return null

  return (
    <div style={styles.heldSalesBox}>
      <div style={styles.cartHeader}>Held Sales ({heldSales.length})</div>
      {heldSales.map(heldSale => (
        <div key={heldSale.id} style={styles.heldSaleRow}>
          <div>
            <div style={styles.cartName}>{heldSale.customerName}</div>
            <div style={styles.cartMeta}>
              {heldSale.items.length} item(s) - KES {Math.max(0, heldSale.items.reduce((sum, item) => sum + item.total, 0) - (parseFloat(heldSale.cartDiscount) || 0)).toLocaleString()}
            </div>
          </div>
          <div style={styles.heldSaleActions}>
            <button type="button" style={styles.heldBtn} onClick={() => onResume(heldSale)}>Resume</button>
            <button type="button" style={styles.heldBtnDanger} onClick={() => onDelete(heldSale.id)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  )
}

const styles = {
  heldSalesBox: { background: '#fff', borderRadius: '8px', padding: '12px', marginBottom: '12px', border: '1px solid #e8ebe8' },
  cartHeader: { fontSize: '13px', fontWeight: '600', marginBottom: '10px' },
  heldSaleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid #f0f2f0' },
  cartName: { fontSize: '13px', fontWeight: '600' },
  cartMeta: { fontSize: '11px', color: '#666' },
  heldSaleActions: { display: 'flex', gap: '6px' },
  heldBtn: { background: '#EAF4FF', color: '#1A6BB5', border: '1px solid #B8D9F7', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' },
  heldBtnDanger: { background: '#FCEBEB', color: '#C0392B', border: '1px solid #F09595', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' },
}
