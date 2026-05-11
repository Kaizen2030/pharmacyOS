-- Versioned migration for staff invite support and multi-branch pharmacies.

ALTER TABLE IF EXISTS web_users
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE INDEX IF NOT EXISTS web_users_pharmacy_email_idx
  ON web_users (pharmacy_id, email);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'web_users'
      AND c.conname = 'web_users_pharmacy_email_unique'
  ) THEN
    ALTER TABLE web_users
      ADD CONSTRAINT web_users_pharmacy_email_unique
      UNIQUE (pharmacy_id, email);
  END IF;
END $$;

ALTER TABLE IF EXISTS pharmacies
  ADD COLUMN IF NOT EXISTS parent_pharmacy_id UUID REFERENCES pharmacies(id),
  ADD COLUMN IF NOT EXISTS is_branch BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS branch_name TEXT;

DROP POLICY IF EXISTS "pharmacies: insert own" ON pharmacies;

CREATE POLICY "pharmacies: insert own"
ON pharmacies
FOR INSERT
WITH CHECK (
  owner_email = (SELECT email FROM auth.users WHERE id = auth.uid())
);
