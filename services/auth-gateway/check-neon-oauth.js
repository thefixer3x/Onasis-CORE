#!/usr/bin/env node
import { neon } from '@neondatabase/serverless'
import 'dotenv/config'

const sql = neon(process.env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

async function checkOAuthTables() {
  console.log('🔍 Checking for OAuth tables in Neon DB...\n')

  const tables = [
    'oauth_clients',
    'oauth_authorization_codes',
    'oauth_tokens',
    'oauth_audit_log'
  ]

  for (const table of tables) {
    try {
      const result = await sql`SELECT COUNT(*) as count FROM ${sql(table)} LIMIT 1`
      console.log(`✅ ${table}: EXISTS (${result[0]?.count || 0} rows)`)
    } catch (error) {
      console.log(`❌ ${table}: MISSING (${error.message})`)
    }
  }

  // Check for seed clients
  console.log('\n🔍 Checking for OAuth clients...')
  try {
    const clients = await sql`SELECT client_id, client_name, status FROM oauth_clients`
    console.log(`✅ Found ${clients.length} OAuth clients:`)
    clients.forEach(c => console.log(`   - ${c.client_id}: ${c.client_name} (${c.status})`))
  } catch (error) {
    console.log(`❌ Cannot query oauth_clients: ${error.message}`)
  }
}

checkOAuthTables()
