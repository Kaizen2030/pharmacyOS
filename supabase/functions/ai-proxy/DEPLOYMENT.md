# Deployment Instructions

1. **Install Supabase CLI** (choose one):
   
   **Option A: Using Scoop (recommended for Windows)**
   ```powershell
   scoop install supabase
   ```
   
   **Option B: Using npx (no install needed)**
   ```powershell
   npx supabase@latest functions deploy ai-proxy
   ```

2. **Set up Gemini API Key**
   
   First, get your Gemini API key from: https://aistudio.google.com/app/apikeys
   
   Then add it to your Supabase project secrets:
   
   ```powershell
   # Using npx
   npx supabase@latest secrets set GEMINI_API_KEY "your-api-key-here"
   
   # Or using CLI
   supabase secrets set GEMINI_API_KEY "your-api-key-here"
   ```

3. **Deploy the function**
   
   ```powershell
   # Using npx
   npx supabase@latest functions deploy ai-proxy
   
   # Or using CLI
   supabase functions deploy ai-proxy
   ```

4. **Verify deployment**
   
   Check your Supabase Dashboard:
   - Go to Edge Functions
   - You should see `ai-proxy` listed
   - Check its status and logs

## Troubleshooting

- **"Function endpoint not available"**: Wait a few seconds after deployment and refresh
- **"Gemini API error"**: Make sure GEMINI_API_KEY is properly set in Supabase secrets
- **"CORS error"**: The function already handles CORS headers
