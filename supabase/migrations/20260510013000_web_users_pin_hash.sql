-- Store staff POS PINs as hashes instead of relying on plain text.

ALTER TABLE IF EXISTS web_users
  ADD COLUMN IF NOT EXISTS pin_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS web_users_pharmacy_pin_hash_unique
  ON web_users (pharmacy_id, pin_hash)
  WHERE pin_hash IS NOT NULL;
