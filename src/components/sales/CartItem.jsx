import React from 'react'

export default function CartItem({ item, onChangeQty, onRemove }) {
  return (
    <div style={styles.cartRow}>
      <div>
        <div style={styles.cartName}>{item.drug_name}</div>
        <div style={styles.cartMeta}>Qty: {item.qty} • KES {item.unit_price.toLocaleString()}</div>
      </div>
      <div style={styles.cartRight}>
        <div style={styles.quantityControls}>
          <button
            type="button"
            style={styles.qtyBtn}
            onClick={() => onChangeQty(item.id, Math.max(1, item.qty - 1))}
          >
            -
          </button>
          <span style={styles.qtyValue}>{item.qty}</span>
          <button
            type="button"
            style={styles.qtyBtn}
            onClick={() => onChangeQty(item.id, item.qty + 1)}
          >
            +
          </button>
        </div>
        <div style={styles.cartTotal}>KES {item.total.toLocaleString()}</div>
        <button type="button" style={styles.cartRemove} onClick={() => onRemove(item.id)}>
          Remove
        </button>
      </div>
    </div>
  )
}

const styles = {
  cartRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #e8ebe8' },
  cartName: { fontSize: '13px', fontWeight: '600', color: '#111' },
  cartMeta: { fontSize: '11px', color: '#666', marginTop: '4px' },
  cartRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' },
  quantityControls: { display: 'flex', alignItems: 'center', gap: '6px' },
  qtyBtn: { width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #ddd', background: '#fff', color: '#333', fontSize: '14px', cursor: 'pointer' },
  qtyValue: { minWidth: '28px', textAlign: 'center', fontSize: '12px', fontWeight: '600' },
  cartTotal: { fontSize: '13px', fontWeight: '700', color: '#0F6E56' },
  cartRemove: { border: 'none', background: 'transparent', color: '#E24B4A', cursor: 'pointer', fontSize: '11px' },
}
