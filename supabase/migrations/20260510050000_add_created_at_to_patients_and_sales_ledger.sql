-- Add missing created_at columns to patients and sales_ledger
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE sales_ledger 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Backfill both from existing timestamp columns
UPDATE patients SET created_at = now() WHERE created_at IS NULL;
UPDATE sales_ledger SET created_at = sold_at WHERE created_at IS NULL;
