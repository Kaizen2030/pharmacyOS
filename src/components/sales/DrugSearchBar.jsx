import React, { useMemo } from 'react'

export default function DrugSearchBar({
  drugs,
  selectedDrug,
  searchValue,
  onSearchChange,
  onSelectDrug,
  scanning,
  scanValue,
  onToggleScanning,
  onScanChange,
  onScanSubmit,
}) {
  const filteredDrugs = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    if (!query) return []
    return drugs.filter(drug =>
      drug.drug_name?.toLowerCase().includes(query) ||
      drug.drug_code?.toLowerCase().includes(query) ||
      drug.barcode?.toLowerCase().includes(query)
    ).slice(0, 8)
  }, [drugs, searchValue])

  return (
    <div style={styles.container}>
      <label style={styles.label}>Drug</label>
      <input
        style={styles.input}
        value={searchValue}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Type drug name, code, or barcode"
      />
      {filteredDrugs.length > 0 && (
        <div style={styles.resultsBox}>
          {filteredDrugs.map(drug => (
            <button
              key={drug.id}
              type="button"
              style={styles.resultItem}
              onClick={() => onSelectDrug(drug)}
            >
              <span>{drug.drug_name}</span>
              <span style={styles.resultMeta}>KES {parseFloat(drug.price_kes || 0).toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}

      {selectedDrug && (
        <div style={styles.selectedDrug}>
          Selected: {selectedDrug.drug_name} • KES {parseFloat(selectedDrug.price_kes || 0).toLocaleString()}
        </div>
      )}

      <div style={styles.scanRow}>
        <button type="button" style={styles.scanToggle} onClick={onToggleScanning}>
          {scanning ? 'Cancel Scan' : 'Scan Barcode'}
        </button>
        {scanning && (
          <input
            autoFocus
            style={styles.scanInput}
            placeholder="Scan barcode now and press Enter..."
            value={scanValue}
            onChange={e => onScanChange(e.target.value)}
            onKeyDown={onScanSubmit}
          />
        )}
      </div>
    </div>
  )
}

const styles = {
  container: { position: 'relative', marginBottom: '12px' },
  label: { display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' },
  resultsBox: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', marginTop: '6px', zIndex: 2, boxShadow: '0 10px 25px rgba(0,0,0,0.08)' },
  resultItem: { width: '100%', display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '10px 12px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '12px', textAlign: 'left' },
  resultMeta: { color: '#6b7280', fontSize: '11px' },
  selectedDrug: { marginTop: '8px', fontSize: '12px', color: '#111' },
  scanRow: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' },
  scanToggle: { alignSelf: 'flex-start', background: '#fff', color: '#333', border: '1px solid #ddd', borderRadius: '7px', padding: '8px 12px', cursor: 'pointer', fontSize: '12px' },
  scanInput: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' },
}
