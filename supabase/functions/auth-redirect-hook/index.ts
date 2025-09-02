import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { record, old_record } = await req.json()
    
    // Get the redirect URL from custom claims or metadata
    const customClaims = record.app_metadata?.claims || {}
    const redirectTo = customClaims.redirect_to || record.user_metadata?.redirect_to
    
    console.log('Auth hook triggered for user:', record.id)
    console.log('Redirect metadata:', { redirectTo, customClaims })
    
    // If no specific redirect is set, use smart routing based on email domain or other factors
    if (!redirectTo) {
      const email = record.email || ''
      let defaultRedirect = 'https://dashboard.lanonasis.com'
      
      // Smart routing logic
      if (email.includes('vortex') || email.includes('core')) {
        defaultRedirect = 'https://auth.vortexcore.app'
      } else if (email.includes('dev') || email.includes('developer')) {
        defaultRedirect = 'https://api.lanonasis.com/console'
      } else if (email.includes('seyederick')) {
        defaultRedirect = 'https://seyederick.com'
      } else if (email.includes('seftec')) {
        defaultRedirect = 'https://saas.seftec.tech'
      }
      
      console.log('Using smart redirect for:', email, '→', defaultRedirect)
      
      // Update user metadata with determined redirect
      return new Response(
        JSON.stringify({
          user: {
            ...record,
            user_metadata: {
              ...record.user_metadata,
              redirect_to: defaultRedirect
            }
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    // Return the user record unchanged if redirect is already set
    return new Response(
      JSON.stringify({ user: record }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
    
  } catch (error) {
    console.error('Auth hook error:', error)
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})