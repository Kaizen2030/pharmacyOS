import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async req => {
  const { sale, kraPin, branchId, deviceSerial } = await req.json()

  const ETIMS_URL = 'https://etims-api-sbx.kra.go.ke/etims-api/saveItems'

  const payload = {
    tin: kraPin,
    bhfId: branchId,
    dvcSrlNo: deviceSerial,
    modrNm: 'PharmacyOS',
    modrId: sale.cashier_id,
    items: [{
      itemSeq: 1,
      itemCd: sale.drug_code || 'DRUG001',
      itemNm: sale.drug_name,
      qty: sale.qty_sold,
      prc: sale.qty_sold ? sale.total_kes / sale.qty_sold : sale.total_kes,
      totAmt: sale.total_kes,
      taxTyCd: 'B',
    }],
  }

  const response = await fetch(ETIMS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const result = await response.json()

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
})
