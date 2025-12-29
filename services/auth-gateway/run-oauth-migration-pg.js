#!/usr/bin/env node
import pg from 'pg'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const { Client } = pg
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function runMigration() {
  // Allow self-signed certificates for staging/testing (Supabase uses valid certs; this is defensive)
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'
  const client = new Client({ connectionString: process.env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

  try {
    console.log('📦 Reading OAuth migration file...')
    const migrationPath = join(__dirname, 'migrations', '002_oauth2_pkce.sql')
    const migrationSQL = readFileSync(migrationPath, 'utf-8')

    console.log('🔌 Connecting to Postgres (Supabase)...')
    await client.connect()

    console.log('🚀 Running OAuth2 PKCE migration...\n')
    await client.query(migrationSQL)

    console.log('✅ Migration completed successfully!')
    console.log('\n📋 Verifying tables...')

    const { rows } = await client.query('SELECT client_id, client_name, status FROM oauth_clients')
    console.log(`✅ Found ${rows.length} OAuth clients:`)
    rows.forEach(c => console.log(`   - ${c.client_id}: ${c.client_name} (${c.status})`))

    console.log('\n🎉 OAuth flow is ready! Try logging in again.')

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigration()
