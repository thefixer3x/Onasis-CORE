#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.SUPABASE_URL=https://<project-ref>.supabase.co
  process.env.SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
)

async function checkOAuthTables() {
  console.log('🔍 Checking for OAuth tables in Supabase...\n')

  const tables = [
    'oauth_clients',
    'oauth_authorization_codes',
    'oauth_tokens',
    'oauth_audit_log'
  ]

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1)

    if (error) {
      console.log(`❌ ${table}: MISSING (${error.message})`)
    } else {
      console.log(`✅ ${table}: EXISTS (${data?.length || 0} rows)`)
    }
  }
}

checkOAuthTables()
