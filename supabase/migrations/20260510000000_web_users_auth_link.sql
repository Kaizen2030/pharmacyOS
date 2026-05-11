-- Separate the internal web_users primary key from the Supabase auth UUID.

ALTER TABLE IF EXISTS web_users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS web_users_auth_user_id_unique
  ON web_users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

UPDATE web_users AS wu
SET auth_user_id = wu.id
WHERE wu.auth_user_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM auth.users AS au
    WHERE au.id = wu.id
  );
