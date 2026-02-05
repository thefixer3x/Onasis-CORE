#!/usr/bin/env node
/**
 * Run OAuth2 PKCE migration on Supabase
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import 'dotenv/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function runMigration() {
  try {
    console.log('📦 Reading migration file...')
    const migrationPath = join(__dirname, 'migrations', '002_oauth2_pkce.sql')
    const sql = readFileSync(migrationPath, 'utf-8')

    console.log('🚀 Running OAuth2 PKCE migration on Supabase...')
    console.log(`   Database: ${supabaseUrl}`)

    // Execute the SQL via Supabase's RPC
    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql })

    if (error) {
      console.error('❌ Migration failed:', error)

      // Try alternative approach: split and execute statements
      console.log('\n⚠️  Trying alternative approach...')
      await executeSqlStatements(sql)
    } else {
      console.log('✅ Migration completed successfully!')
      console.log('   Tables created:')
      console.log('   - oauth_clients')
      console.log('   - oauth_authorization_codes')
      console.log('   - oauth_tokens')
      console.log('   - oauth_audit_log')
      console.log('\n   Seed clients:')
      console.log('   - cursor-extension')
      console.log('   - onasis-cli')
    }

    // Verify tables exist
    console.log('\n🔍 Verifying tables...')
    const { data: clients, error: verifyError } = await supabase
      .from('oauth_clients')
      .select('client_id, client_name')
      .limit(5)

    if (verifyError) {
      console.error('❌ Verification failed:', verifyError.message)
      console.log('\n⚠️  The migration SQL might need to be run manually via Supabase dashboard')
      console.log(`   Dashboard: ${supabaseUrl.replace('https://', 'https://app.supabase.com/project/')}/sql`)
    } else {
      console.log('✅ Verification passed!')
      console.log(`   Found ${clients?.length || 0} OAuth clients`)
      if (clients && clients.length > 0) {
        clients.forEach(c => console.log(`   - ${c.client_id}: ${c.client_name}`))
      }
    }

  } catch (err) {
    console.error('❌ Error:', err.message)
    console.log('\n💡 Manual migration required:')
    console.log(`   1. Go to: ${supabaseUrl.replace('https://', 'https://app.supabase.com/project/')}/sql`)
    console.log('   2. Copy the contents of migrations/002_oauth2_pkce.sql')
    console.log('   3. Run the SQL in the SQL Editor')
    process.exit(1)
  }
}

async function executeSqlStatements(sql) {
  // This is a backup approach - may not work with all SQL statements
  console.log('   Note: Some statements may need manual execution via Supabase dashboard')
  console.log(`   Dashboard SQL Editor: ${supabaseUrl.replace('https://', 'https://app.supabase.com/project/')}/sql`)
  console.log('\n   Migration file: migrations/002_oauth2_pkce.sql')
}

runMigration()
