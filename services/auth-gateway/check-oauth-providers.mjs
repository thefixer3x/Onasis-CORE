import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required')
}

const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
  headers: {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
  }
})

const settings = await response.json()

console.log('\n🔐 Supabase OAuth Providers Configuration\n')
console.log('External Providers:', settings.external)
console.log('\n✅ Enabled Providers:')

Object.entries(settings.external || {}).forEach(([provider, enabled]) => {
  if (enabled && !['email', 'phone', 'anonymous_users'].includes(provider)) {
    console.log(`  - ${provider}`)
  }
})

console.log('\n❌ Disabled Providers:')
Object.entries(settings.external || {}).forEach(([provider, enabled]) => {
  if (!enabled && !['email', 'phone', 'anonymous_users'].includes(provider)) {
    console.log(`  - ${provider}`)
  }
})
