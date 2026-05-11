import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { auth_user_id, email, pharmacy_id } = await req.json()

    if (!auth_user_id || !email) {
      return new Response(JSON.stringify({ error: 'Missing auth_user_id or email' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    let query = supabase
      .from('web_users')
      .select('id, auth_user_id, pharmacy_id')
      .eq('email', String(email).trim().toLowerCase())

    if (pharmacy_id) {
      query = query.eq('pharmacy_id', pharmacy_id)
    }

    const { data: webUser, error: findError } = await query.maybeSingle()

    if (findError) {
      return new Response(JSON.stringify({ error: findError.message }), {
        status: 500,
        headers: corsHeaders,
      })
    }

    if (!webUser) {
      return new Response(JSON.stringify({ linked: false, reason: 'no_web_user' }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    if (webUser.auth_user_id === auth_user_id) {
      return new Response(JSON.stringify({ linked: true, reason: 'already_linked', web_user_id: webUser.id }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    if (webUser.auth_user_id) {
      return new Response(JSON.stringify({ linked: false, reason: 'linked_to_different_auth', web_user_id: webUser.id }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    const { error: updateError } = await supabase
      .from('web_users')
      .update({ auth_user_id })
      .eq('id', webUser.id)

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: corsHeaders,
      })
    }

    return new Response(JSON.stringify({ linked: true, reason: 'linked', web_user_id: webUser.id }), {
      status: 200,
      headers: corsHeaders,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
