-- Adds feedback storage for AI assistant responses.
CREATE TABLE IF NOT EXISTS ai_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_id uuid,
  message_text text,
  feedback text,
  correction text,
  created_at timestamptz DEFAULT now()
);
