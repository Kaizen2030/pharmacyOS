import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://npybtjtilzjsgcxgesxy.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weWJ0anRpbHpqc2djeGdlc3h5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NjQxMzgsImV4cCI6MjA5MTE0MDEzOH0.C6K-lBJ-R6DdEqeqTTHCWjNhhxXmBSYTzfr6xTZAIlw'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export default supabase
