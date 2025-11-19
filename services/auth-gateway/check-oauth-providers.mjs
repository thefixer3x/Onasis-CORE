import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL=https://<project-ref>.supabase.co
const SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY

const response = await fetch(`${SUPABASE_URL=https://<project-ref>.supabase.co
  headers: {
    'apikey': SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
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
