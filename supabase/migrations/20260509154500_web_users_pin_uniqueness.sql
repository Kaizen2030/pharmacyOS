-- Prevent duplicate staff PINs within the same pharmacy.

CREATE UNIQUE INDEX IF NOT EXISTS web_users_pharmacy_pin_unique
  ON web_users (pharmacy_id, pin)
  WHERE pin IS NOT NULL;
