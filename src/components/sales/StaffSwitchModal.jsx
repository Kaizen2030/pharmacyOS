import React from 'react'

export default function StaffSwitchModal({
  show,
  staffPin,
  staffPinLoading,
  setStaffPin,
  onCancel,
  onSwitchStaff,
}) {
  if (!show) return null

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h3 style={styles.modalTitle}>Switch POS Staff</h3>
        <p style={styles.modalText}>
          Enter the 4-digit PIN of the pharmacist, locum, nurse, CO, MO, or technologist currently at the till.
        </p>
        <div style={styles.formRow}>
          <label style={styles.label}>Staff PIN</label>
          <input
            type="password"
            maxLength={4}
            style={styles.input}
            value={staffPin}
            onChange={event => setStaffPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="Enter 4-digit PIN"
          />
        </div>
        <div style={styles.modalFooter}>
          <button style={styles.btnSecondary} onClick={onCancel} disabled={staffPinLoading}>
            Cancel
          </button>
          <button style={styles.btnPrimary} onClick={onSwitchStaff} disabled={staffPinLoading}>
            {staffPinLoading ? 'Verifying...' : 'Switch Staff'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '10px', padding: '24px', width: '420px', maxWidth: 'calc(100vw - 32px)' },
  modalTitle: { fontSize: '16px', fontWeight: '600', color: '#111', marginBottom: '10px' },
  modalText: { fontSize: '13px', color: '#555', lineHeight: '1.5', marginBottom: '14px' },
  formRow: { marginBottom: '12px', position: 'relative' },
  label: { fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' },
  input: { width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '8px', fontWeight: '500', cursor: 'pointer' },
  btnSecondary: { background: '#fff', color: '#333', border: '1px solid #ddd', padding: '10px 14px', borderRadius: '8px', cursor: 'pointer' },
}
