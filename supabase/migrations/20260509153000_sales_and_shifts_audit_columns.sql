-- Align sales and shift tables with the audit fields written by the app.

ALTER TABLE IF EXISTS sales_ledger
  ADD COLUMN IF NOT EXISTS cashier_name TEXT,
  ADD COLUMN IF NOT EXISTS cashier_role TEXT,
  ADD COLUMN IF NOT EXISTS authenticated_user_id UUID,
  ADD COLUMN IF NOT EXISTS authenticated_user_email TEXT,
  ADD COLUMN IF NOT EXISTS verified_by TEXT,
  ADD COLUMN IF NOT EXISTS operator_branch_pharmacy_id UUID REFERENCES pharmacies(id);

ALTER TABLE IF EXISTS shifts
  ADD COLUMN IF NOT EXISTS cashier_name TEXT,
  ADD COLUMN IF NOT EXISTS cashier_role TEXT,
  ADD COLUMN IF NOT EXISTS authenticated_user_id UUID,
  ADD COLUMN IF NOT EXISTS authenticated_user_email TEXT,
  ADD COLUMN IF NOT EXISTS verified_by TEXT,
  ADD COLUMN IF NOT EXISTS operator_branch_pharmacy_id UUID REFERENCES pharmacies(id);

CREATE INDEX IF NOT EXISTS sales_ledger_shift_id_idx
  ON sales_ledger (shift_id);

CREATE INDEX IF NOT EXISTS sales_ledger_operator_branch_idx
  ON sales_ledger (operator_branch_pharmacy_id);

CREATE INDEX IF NOT EXISTS shifts_operator_branch_idx
  ON shifts (operator_branch_pharmacy_id);
