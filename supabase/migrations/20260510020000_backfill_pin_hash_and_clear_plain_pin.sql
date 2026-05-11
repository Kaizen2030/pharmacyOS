CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE web_users
SET pin_hash = encode(digest(pin || 'pharmacyos_salt_v1', 'sha256'), 'hex')
WHERE pin IS NOT NULL
  AND pin_hash IS NULL;

UPDATE web_users
SET pin = NULL
WHERE pin IS NOT NULL
  AND pin_hash IS NOT NULL;

DROP INDEX IF EXISTS web_users_pharmacy_pin_unique;
