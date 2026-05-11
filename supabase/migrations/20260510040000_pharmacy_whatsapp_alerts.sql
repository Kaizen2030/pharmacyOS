-- Add WhatsApp low stock alert settings to pharmacies
ALTER TABLE pharmacies
  ADD COLUMN whatsapp_alerts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_alert_phone text,
  ADD COLUMN whatsapp_alert_threshold integer NOT NULL DEFAULT 20;
